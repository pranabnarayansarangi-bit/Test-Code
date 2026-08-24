#!/usr/bin/env python3
"""Visual Storybook — turn a script into an illustrated, cinematic storybook.

Pipeline (all local, no cloud required):

  1. breakdown  — a local LLM (e.g. Gemma served by Ollama / LM Studio / llama.cpp)
                  reads the script and produces a "production bible" (characters,
                  locations) plus a shot-by-shot scene list, inventing intermediate
                  cinematic shots between script beats so the book flows like a film.
  2. render     — each scene's image prompt is sent to an image backend
                  (AUTOMATIC1111 / SD-WebUI, or any OpenAI-compatible images API),
                  or skipped entirely in prompts-only mode.
  3. assemble   — pages (image + narration + dialogue) are bound into a single
                  storybook.html, printable to PDF from a browser.

Only the Python standard library is used.
"""

from __future__ import annotations

import argparse
import base64
import html
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_CONFIG = {
    "llm": {
        # OpenAI-compatible chat endpoint. Ollama: http://localhost:11434/v1
        # LM Studio: http://localhost:1234/v1 · llama.cpp server: http://localhost:8080/v1
        "base_url": "http://localhost:11434/v1",
        "api_key": "ollama",  # any non-empty string is fine for local servers
        "model": "gemma-abliterated:latest",  # set to your local model tag
        "temperature": 0.7,
        "max_tokens": 4096,
        "timeout_seconds": 600,
        "json_retries": 3,
        "chunk_chars": 6000,  # long scripts are storyboarded in chunks this size
    },
    "images": {
        "backend": "none",  # none | a1111 | openai
        "base_url": "http://localhost:7860",
        "api_key": "",
        "model": "",  # openai backend only; omit to use the server default
        "width": 1152,
        "height": 768,
        "steps": 28,
        "cfg_scale": 6.0,
        "sampler": "",  # a1111 only; empty = server default
        "seed": 1234,  # base seed; scene N uses seed+N-1. -1 = random every scene
        "negative_prompt": (
            "text, watermark, caption, lettering, logo, signature, "
            "low quality, blurry, deformed hands, extra fingers"
        ),
        "timeout_seconds": 600,
    },
    "book": {
        "style": (
            "cinematic digital painting, film still, dramatic lighting, "
            "rich color grading, 35mm, high detail"
        ),
        "max_intermediate_per_gap": 2,
        "narration_sentences": 3,
    },
}


def deep_merge(base: dict, override: dict) -> dict:
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            deep_merge(base[key], value)
        else:
            base[key] = value
    return base


def load_config(path: str | None) -> dict:
    cfg = json.loads(json.dumps(DEFAULT_CONFIG))  # deep copy
    candidate = Path(path) if path else Path("config.json")
    if path and not candidate.exists():
        die(f"config file not found: {candidate}")
    if candidate.exists():
        try:
            deep_merge(cfg, json.loads(candidate.read_text(encoding="utf-8")))
        except json.JSONDecodeError as exc:
            die(f"config file {candidate} is not valid JSON: {exc}")
    return cfg


def die(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    sys.exit(1)


def info(message: str) -> None:
    print(message, flush=True)


# ---------------------------------------------------------------------------
# HTTP helpers (stdlib only)
# ---------------------------------------------------------------------------

def http_post_json(url: str, payload: dict, headers: dict | None = None,
                   timeout: int = 600) -> dict:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, method="POST")
    request.add_header("Content-Type", "application/json")
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"HTTP {exc.code} from {url}: {body[:500]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"cannot reach {url}: {exc.reason}") from exc


def http_get_bytes(url: str, timeout: int = 600) -> bytes:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return response.read()


# ---------------------------------------------------------------------------
# LLM calls
# ---------------------------------------------------------------------------

CHARACTER_SYSTEM = """\
You are a film development assistant preparing a script for visual production.
Read the script and produce a production bible as JSON.

Return EXACTLY this JSON shape:
{
  "title": "story title",
  "logline": "one-sentence summary of the story",
  "characters": [
    {"name": "NAME", "role": "protagonist | antagonist | supporting",
     "visual": "concrete, reusable physical description: age, build, face, hair, wardrobe, distinguishing marks"}
  ],
  "locations": [
    {"name": "NAME", "visual": "concrete visual description: architecture or landscape, era, palette, weather, key props"}
  ]
}

Rules:
- Every "visual" field must be specific enough that two different artists would paint the same person or place.
- Include every character and location that appears on screen.
- Output ONLY the JSON object. No commentary, no markdown fences.
"""

SCENES_SYSTEM = """\
You are a cinematographer and storyboard artist converting a script into a visual
storybook: a sequence of cinematic shots, each paired with storybook narration.

You are given a production bible (characters, locations) and a portion of the script.
Break that portion into shots, and ALSO invent connective "intermediate" shots between
script beats — establishing shots, transitions, reaction shots, passage-of-time images —
so the sequence flows like a film.

Return EXACTLY this JSON shape:
{
  "scenes": [
    {
      "title": "short shot title",
      "kind": "script" or "intermediate",
      "narration": "storybook prose for this page, at most {narration_sentences} sentences, present tense",
      "dialogue": [{"speaker": "NAME", "line": "short spoken line"}],
      "shot": "camera framing, e.g. wide establishing shot / medium two-shot / extreme close-up",
      "mood": "lighting and atmosphere in a few words",
      "action": "what is physically visible in the frame, one or two sentences, concrete and paintable",
      "characters": ["names of characters visible in frame, matching the bible"],
      "location": "location name matching the bible"
    }
  ]
}

Rules:
- Cover every story beat of the given script portion, in order.
- Insert at most {max_intermediate} intermediate shots between consecutive script beats,
  marked "kind": "intermediate".
- "action" must describe only what a camera could capture: no inner thoughts, no sounds,
  no on-screen text.
- Dialogue is optional; use [] when nobody speaks.
- Use ONLY character and location names that exist in the bible.
- Output ONLY the JSON object. No commentary, no markdown fences.
"""


def chat(llm: dict, system: str, user: str) -> str:
    url = llm["base_url"].rstrip("/") + "/chat/completions"
    payload = {
        "model": llm["model"],
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": llm.get("temperature", 0.7),
    }
    if llm.get("max_tokens"):
        payload["max_tokens"] = llm["max_tokens"]
    headers = {}
    if llm.get("api_key"):
        headers["Authorization"] = f"Bearer {llm['api_key']}"
    response = http_post_json(url, payload, headers,
                              timeout=llm.get("timeout_seconds", 600))
    try:
        return response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(
            f"unexpected response shape from {url}: {json.dumps(response)[:300]}"
        ) from exc


def extract_json(text: str) -> dict:
    """Pull the first balanced JSON object out of a model reply."""
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    start = text.find("{")
    if start == -1:
        raise ValueError("no JSON object found in model reply")
    depth, in_string, escaped = 0, False, False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
        else:
            if char == '"':
                in_string = True
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return json.loads(text[start:index + 1])
    raise ValueError("unbalanced JSON object in model reply")


def chat_json(llm: dict, system: str, user: str) -> dict:
    last_error: Exception | None = None
    retries = max(1, int(llm.get("json_retries", 3)))
    for attempt in range(retries):
        suffix = ""
        if attempt:
            suffix = ("\n\nYour previous reply was not valid JSON. "
                      "Reply again with ONLY the JSON object.")
        raw = chat(llm, system, user + suffix)
        try:
            return extract_json(raw)
        except (ValueError, json.JSONDecodeError) as exc:
            last_error = exc
            info(f"  ! model reply was not valid JSON (attempt {attempt + 1}/{retries})")
    raise RuntimeError(f"model never returned valid JSON: {last_error}")


# ---------------------------------------------------------------------------
# Stage 1 — breakdown
# ---------------------------------------------------------------------------

def split_script(text: str, chunk_chars: int) -> list[str]:
    if len(text) <= chunk_chars:
        return [text]
    paragraphs = re.split(r"\n\s*\n", text)
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        if current and len(current) + len(paragraph) + 2 > chunk_chars:
            chunks.append(current)
            current = paragraph
        else:
            current = f"{current}\n\n{paragraph}" if current else paragraph
    if current:
        chunks.append(current)
    return chunks


def find_entry(entries: list, name: str) -> dict | None:
    wanted = (name or "").strip().lower()
    if not wanted:
        return None
    for entry in entries:
        if isinstance(entry, dict) and str(entry.get("name", "")).strip().lower() == wanted:
            return entry
    return None


def build_image_prompt(scene: dict, bible: dict, book: dict) -> str:
    parts: list[str] = [book["style"]]
    if scene.get("shot"):
        parts.append(str(scene["shot"]))
    if scene.get("action"):
        parts.append(str(scene["action"]))
    for name in scene.get("characters") or []:
        character = find_entry(bible.get("characters", []), str(name))
        if character and character.get("visual"):
            parts.append(f"{character['name']}: {character['visual']}")
    location = find_entry(bible.get("locations", []), str(scene.get("location", "")))
    if location and location.get("visual"):
        parts.append(f"Setting: {location['visual']}")
    if scene.get("mood"):
        parts.append(str(scene["mood"]))
    parts.append("no text, no lettering, no watermark")
    return ". ".join(part.strip().rstrip(".") for part in parts if part and part.strip())


def normalize_scene(raw: object) -> dict | None:
    if not isinstance(raw, dict):
        return None
    scene = {
        "title": str(raw.get("title") or "Untitled shot").strip(),
        "kind": "intermediate" if str(raw.get("kind", "")).lower().startswith("inter") else "script",
        "narration": str(raw.get("narration") or "").strip(),
        "shot": str(raw.get("shot") or "").strip(),
        "mood": str(raw.get("mood") or "").strip(),
        "action": str(raw.get("action") or "").strip(),
        "location": str(raw.get("location") or "").strip(),
        "characters": [str(name).strip() for name in (raw.get("characters") or [])
                       if str(name).strip()],
        "dialogue": [],
    }
    for line in raw.get("dialogue") or []:
        if isinstance(line, dict) and str(line.get("line", "")).strip():
            scene["dialogue"].append({
                "speaker": str(line.get("speaker") or "").strip(),
                "line": str(line["line"]).strip(),
            })
    if not (scene["narration"] or scene["action"]):
        return None
    return scene


def run_breakdown(config: dict, script_path: Path, out_dir: Path) -> dict:
    llm, book = config["llm"], config["book"]
    script_text = script_path.read_text(encoding="utf-8").strip()
    if not script_text:
        die(f"script is empty: {script_path}")

    info(f"[breakdown] model {llm['model']} at {llm['base_url']}")
    info("[breakdown] pass 1/2 — production bible (characters & locations)")
    bible = chat_json(llm, CHARACTER_SYSTEM, f"SCRIPT:\n\n{script_text}")
    bible.setdefault("title", script_path.stem.replace("_", " ").title())
    bible.setdefault("logline", "")
    bible.setdefault("characters", [])
    bible.setdefault("locations", [])
    info(f"  · {len(bible['characters'])} character(s), {len(bible['locations'])} location(s)")

    scenes_system = (SCENES_SYSTEM
                     .replace("{narration_sentences}", str(book["narration_sentences"]))
                     .replace("{max_intermediate}", str(book["max_intermediate_per_gap"])))
    chunks = split_script(script_text, int(llm["chunk_chars"]))
    info(f"[breakdown] pass 2/2 — storyboarding {len(chunks)} chunk(s)")

    scenes: list[dict] = []
    recap = "Nothing yet — this is the opening of the book."
    for index, chunk in enumerate(chunks, 1):
        info(f"  · chunk {index}/{len(chunks)}")
        user = (f"PRODUCTION BIBLE:\n{json.dumps(bible, indent=2)}\n\n"
                f"STORY SO FAR (already storyboarded): {recap}\n\n"
                f"SCRIPT PORTION {index} of {len(chunks)}:\n\n{chunk}")
        reply = chat_json(llm, scenes_system, user)
        chunk_scenes = [scene for scene in map(normalize_scene, reply.get("scenes") or [])
                        if scene]
        if not chunk_scenes:
            info(f"  ! chunk {index} produced no usable scenes, continuing")
            continue
        scenes.extend(chunk_scenes)
        last = chunk_scenes[-1]
        recap = (f"{len(scenes)} shot(s) storyboarded. "
                 f"Last shot: {last['title']} — {last['narration'] or last['action']}")

    if not scenes:
        die("the model produced no scenes; check the script and model settings")

    for number, scene in enumerate(scenes, 1):
        scene["id"] = number
        scene["image_prompt"] = build_image_prompt(scene, bible, book)
        scene["image_file"] = f"images/scene_{number:03d}.png"

    breakdown = {
        "title": bible["title"],
        "logline": bible["logline"],
        "style": book["style"],
        "negative_prompt": config["images"]["negative_prompt"],
        "characters": bible["characters"],
        "locations": bible["locations"],
        "scenes": scenes,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    breakdown_path = out_dir / "breakdown.json"
    breakdown_path.write_text(json.dumps(breakdown, indent=2, ensure_ascii=False),
                              encoding="utf-8")
    write_prompts_md(breakdown, out_dir / "prompts.md")
    script_count = sum(1 for scene in scenes if scene["kind"] == "script")
    info(f"[breakdown] {len(scenes)} shots ({script_count} script, "
         f"{len(scenes) - script_count} intermediate) -> {breakdown_path}")
    return breakdown


def write_prompts_md(breakdown: dict, path: Path) -> None:
    lines = [f"# {breakdown['title']} — image prompts", ""]
    if breakdown.get("negative_prompt"):
        lines += [f"**Negative prompt (all scenes):** {breakdown['negative_prompt']}", ""]
    for scene in breakdown["scenes"]:
        lines += [f"## {scene['id']:03d} · {scene['title']} ({scene['kind']})", "",
                  scene["image_prompt"], ""]
    path.write_text("\n".join(lines), encoding="utf-8")


# ---------------------------------------------------------------------------
# Stage 2 — render
# ---------------------------------------------------------------------------

def scene_seed(images: dict, scene_id: int) -> int:
    base = int(images.get("seed", -1))
    return -1 if base < 0 else base + scene_id - 1


def render_a1111(images: dict, prompt: str, negative: str, seed: int) -> bytes:
    payload = {
        "prompt": prompt,
        "negative_prompt": negative,
        "width": images["width"],
        "height": images["height"],
        "steps": images["steps"],
        "cfg_scale": images["cfg_scale"],
        "seed": seed,
    }
    if images.get("sampler"):
        payload["sampler_name"] = images["sampler"]
    url = images["base_url"].rstrip("/") + "/sdapi/v1/txt2img"
    response = http_post_json(url, payload, timeout=images.get("timeout_seconds", 600))
    encoded = (response.get("images") or [None])[0]
    if not encoded:
        raise RuntimeError(f"no image in response from {url}")
    if encoded.startswith("data:"):
        encoded = encoded.split(",", 1)[1]
    return base64.b64decode(encoded)


def render_openai(images: dict, prompt: str, _negative: str, _seed: int) -> bytes:
    payload = {
        "prompt": prompt,
        "n": 1,
        "size": f"{images['width']}x{images['height']}",
        "response_format": "b64_json",
    }
    if images.get("model"):
        payload["model"] = images["model"]
    headers = {}
    if images.get("api_key"):
        headers["Authorization"] = f"Bearer {images['api_key']}"
    url = images["base_url"].rstrip("/") + "/v1/images/generations"
    response = http_post_json(url, payload, headers,
                              timeout=images.get("timeout_seconds", 600))
    entry = (response.get("data") or [{}])[0]
    if entry.get("b64_json"):
        return base64.b64decode(entry["b64_json"])
    if entry.get("url"):
        return http_get_bytes(entry["url"], timeout=images.get("timeout_seconds", 600))
    raise RuntimeError(f"no image in response from {url}")


RENDERERS = {"a1111": render_a1111, "openai": render_openai}


def run_render(config: dict, book_dir: Path) -> None:
    images = config["images"]
    backend = images.get("backend", "none")
    breakdown = read_breakdown(book_dir)

    if backend == "none":
        info("[render] backend is 'none' — skipping image generation "
             f"(prompts are in {book_dir / 'prompts.md'})")
        return
    renderer = RENDERERS.get(backend)
    if renderer is None:
        die(f"unknown image backend '{backend}' (expected one of: none, "
            + ", ".join(sorted(RENDERERS)) + ")")

    images_dir = book_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    negative = breakdown.get("negative_prompt", "")
    scenes = breakdown["scenes"]
    rendered, skipped, failed = 0, 0, 0
    info(f"[render] backend {backend} at {images['base_url']} — {len(scenes)} scene(s)")
    for scene in scenes:
        target = book_dir / scene["image_file"]
        if target.exists():
            skipped += 1
            continue
        try:
            data = renderer(images, scene["image_prompt"], negative,
                            scene_seed(images, scene["id"]))
            target.write_bytes(data)
            rendered += 1
            info(f"  · {scene['id']:03d} {scene['title']} -> {target.name}")
        except RuntimeError as exc:
            failed += 1
            info(f"  ! {scene['id']:03d} {scene['title']} failed: {exc}")
    info(f"[render] done: {rendered} rendered, {skipped} already existed, {failed} failed")
    if failed:
        info("[render] re-run this command to retry only the failed scenes")


def read_breakdown(book_dir: Path) -> dict:
    path = book_dir / "breakdown.json"
    if not path.exists():
        die(f"{path} not found — run the 'breakdown' stage first")
    return json.loads(path.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Stage 3 — assemble
# ---------------------------------------------------------------------------

BOOK_CSS = """\
:root { --paper: #f7f2e8; --ink: #26221c; --muted: #6f6759; --accent: #a4552e; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: var(--paper); color: var(--ink);
       font-family: Georgia, 'Times New Roman', serif; line-height: 1.6; }
.book { max-width: 920px; margin: 0 auto; padding: 3rem 1.5rem; }
.cover { text-align: center; padding: 18vh 1rem 14vh; }
.cover .kicker { text-transform: uppercase; letter-spacing: 0.35em;
                 font-size: 0.8rem; color: var(--muted); }
.cover h1 { font-size: 3rem; margin: 1rem 0 1.2rem; font-weight: normal; }
.cover .logline { font-style: italic; color: var(--muted); max-width: 34em; margin: 0 auto; }
.page { padding: 2.5rem 0; border-top: 1px solid rgba(38, 34, 28, 0.12); }
.page figure img { width: 100%; height: auto; display: block; border-radius: 6px;
                   box-shadow: 0 10px 30px rgba(38, 34, 28, 0.18); }
.placeholder { border: 1px dashed rgba(38, 34, 28, 0.35); border-radius: 6px;
               padding: 2.2rem 1.6rem; background: rgba(38, 34, 28, 0.04); }
.placeholder .ph-label { text-transform: uppercase; letter-spacing: 0.25em;
                         font-size: 0.7rem; color: var(--muted); margin-bottom: 0.8rem; }
.placeholder .ph-prompt { font-family: ui-monospace, 'SF Mono', Consolas, monospace;
                          font-size: 0.8rem; color: var(--muted); word-break: break-word; }
.page h2 { font-size: 1.05rem; font-weight: normal; margin: 1.4rem 0 0.6rem;
           color: var(--muted); }
.page h2 .num { color: var(--accent); font-variant-numeric: tabular-nums;
                margin-right: 0.6em; }
.page h2 .badge { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.2em;
                  border: 1px solid var(--muted); border-radius: 999px;
                  padding: 0.1em 0.7em; margin-left: 0.7em; vertical-align: middle; }
.narration { font-size: 1.15rem; max-width: 38em; }
.line { margin-top: 0.7rem; padding-left: 1.2rem; border-left: 2px solid var(--accent);
        max-width: 36em; }
.line .speaker { text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.8rem;
                 color: var(--accent); margin-right: 0.6em; }
.colophon { text-align: center; color: var(--muted); font-size: 0.85rem;
            padding: 3rem 0 1rem; }
@media print {
  .book { max-width: none; padding: 0; }
  .page { border-top: none; page-break-after: always; padding: 1.2rem 0; }
  .cover { page-break-after: always; }
  .page figure img { box-shadow: none; }
}
"""


def image_src(book_dir: Path, scene: dict, embed: bool) -> str | None:
    path = book_dir / scene["image_file"]
    if not path.exists():
        return None
    if not embed:
        return scene["image_file"]
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def run_assemble(config: dict, book_dir: Path, embed: bool) -> Path:
    breakdown = read_breakdown(book_dir)
    esc = lambda value: html.escape(str(value), quote=True)  # noqa: E731

    pages: list[str] = []
    for scene in breakdown["scenes"]:
        src = image_src(book_dir, scene, embed)
        if src:
            figure = f'<figure><img src="{esc(src)}" alt="{esc(scene["title"])}"></figure>'
        else:
            prompt = scene["image_prompt"]
            clipped = prompt if len(prompt) <= 400 else prompt[:400] + "…"
            figure = ('<div class="placeholder"><p class="ph-label">image pending</p>'
                      f'<p class="ph-prompt">{esc(clipped)}</p></div>')
        badge = ('<span class="badge">interlude</span>'
                 if scene["kind"] == "intermediate" else "")
        dialogue = "".join(
            f'<p class="line"><span class="speaker">{esc(line["speaker"])}</span>'
            f'“{esc(line["line"])}”</p>'
            for line in scene["dialogue"]
        )
        narration = (f'<p class="narration">{esc(scene["narration"])}</p>'
                     if scene["narration"] else "")
        pages.append(
            f'<section class="page" data-kind="{esc(scene["kind"])}">{figure}'
            f'<h2><span class="num">{scene["id"]:03d}</span>{esc(scene["title"])}{badge}</h2>'
            f"{narration}{dialogue}</section>"
        )

    logline = (f'<p class="logline">{esc(breakdown["logline"])}</p>'
               if breakdown.get("logline") else "")
    document = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(breakdown["title"])}</title>
<style>
{BOOK_CSS}</style>
</head>
<body>
<div class="book">
<header class="cover">
<p class="kicker">A visual storybook</p>
<h1>{esc(breakdown["title"])}</h1>
{logline}
</header>
{"".join(pages)}
<footer class="colophon">{len(breakdown["scenes"])} pages · generated locally</footer>
</div>
</body>
</html>
"""
    out_path = book_dir / "storybook.html"
    out_path.write_text(document, encoding="utf-8")
    with_images = sum(1 for scene in breakdown["scenes"]
                      if (book_dir / scene["image_file"]).exists())
    info(f"[assemble] {out_path} ({with_images}/{len(breakdown['scenes'])} pages "
         "have images; the rest show their prompt)")
    return out_path


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def default_out_dir(script_path: Path) -> Path:
    return Path("out") / script_path.stem


def apply_overrides(config: dict, args: argparse.Namespace) -> None:
    if getattr(args, "backend", None):
        config["images"]["backend"] = args.backend
    if getattr(args, "model", None):
        config["llm"]["model"] = args.model


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="storybook.py",
        description="Turn a script into an illustrated cinematic storybook, "
                    "using a local LLM and a local image backend.",
    )
    parser.add_argument("--config", help="path to config JSON (default: ./config.json if present)")
    subparsers = parser.add_subparsers(dest="command", required=True)

    breakdown_cmd = subparsers.add_parser(
        "breakdown", help="script -> breakdown.json + prompts.md (LLM stage)")
    breakdown_cmd.add_argument("--script", required=True, help="path to the script text file")
    breakdown_cmd.add_argument("--out", help="output book directory (default: out/<script name>)")
    breakdown_cmd.add_argument("--model", help="override the LLM model tag")

    render_cmd = subparsers.add_parser(
        "render", help="breakdown.json -> images/ (image backend stage)")
    render_cmd.add_argument("--book", required=True, help="book directory containing breakdown.json")
    render_cmd.add_argument("--backend", help="override image backend: none | a1111 | openai")

    assemble_cmd = subparsers.add_parser(
        "assemble", help="breakdown.json + images/ -> storybook.html")
    assemble_cmd.add_argument("--book", required=True, help="book directory containing breakdown.json")
    assemble_cmd.add_argument("--embed", action="store_true",
                              help="inline images as data URIs (single self-contained file)")

    run_cmd = subparsers.add_parser("run", help="breakdown + render + assemble in one go")
    run_cmd.add_argument("--script", required=True, help="path to the script text file")
    run_cmd.add_argument("--out", help="output book directory (default: out/<script name>)")
    run_cmd.add_argument("--model", help="override the LLM model tag")
    run_cmd.add_argument("--backend", help="override image backend: none | a1111 | openai")
    run_cmd.add_argument("--embed", action="store_true",
                         help="inline images as data URIs (single self-contained file)")

    args = parser.parse_args(argv)
    config = load_config(args.config)
    apply_overrides(config, args)

    try:
        if args.command == "breakdown":
            script_path = Path(args.script)
            if not script_path.exists():
                die(f"script not found: {script_path}")
            out_dir = Path(args.out) if args.out else default_out_dir(script_path)
            run_breakdown(config, script_path, out_dir)
        elif args.command == "render":
            run_render(config, Path(args.book))
        elif args.command == "assemble":
            run_assemble(config, Path(args.book), args.embed)
        elif args.command == "run":
            script_path = Path(args.script)
            if not script_path.exists():
                die(f"script not found: {script_path}")
            out_dir = Path(args.out) if args.out else default_out_dir(script_path)
            run_breakdown(config, script_path, out_dir)
            run_render(config, out_dir)
            path = run_assemble(config, out_dir, args.embed)
            info(f"\nDone. Open {path} in a browser (print to PDF for a bound copy).")
    except RuntimeError as exc:
        die(f"{exc}\nhint: is the server running and the base_url in your config correct?")


if __name__ == "__main__":
    main()
