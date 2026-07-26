# Visual Storybook

Turn a script into an illustrated, cinematic storybook — **entirely on your own
machine**. A local LLM (e.g. your Gemma abliterated build served by Ollama)
reads the script and expands it into a shot-by-shot cinematic breakdown,
*inventing the intermediate scenes between your script beats* (establishing
shots, transitions, reactions, passage-of-time images) so the book flows like a
film. A local image backend then paints each shot, and the pages are bound into
a single `storybook.html` you can read in a browser or print to PDF.

```
script.txt ──▶ [1. breakdown]  local LLM writes the production bible + shot list
                    │           (script beats + invented intermediate shots)
                    ▼
              breakdown.json / prompts.md
                    │
              [2. render]      each shot's prompt → image backend → images/*.png
                    │           (or skip: prompts-only mode)
                    ▼
              [3. assemble]    pages (image + narration + dialogue) → storybook.html
```

No dependencies — plain Python 3.9+ standard library. Nothing leaves your
machine unless you point it at a remote server.

## Requirements

1. **A local LLM behind an OpenAI-compatible API.** Any of:
   - [Ollama](https://ollama.com) — `http://localhost:11434/v1`
   - LM Studio — `http://localhost:1234/v1`
   - llama.cpp server / vLLM — `http://localhost:8080/v1` (or wherever you run it)

   Pull/load your model (e.g. your Gemma 4 abliterated build) and put its exact
   tag in the config's `llm.model`.

2. **Optionally, a local image backend** for the render stage:
   - `a1111` — AUTOMATIC1111 / SD-WebUI (or Forge/compatible) with `--api`,
     default `http://localhost:7860`
   - `openai` — anything exposing `POST /v1/images/generations`
   - `none` — skip rendering; you get `prompts.md` and a book with prompt
     placeholders, and can generate images anywhere (ComfyUI, Midjourney, …)
     and drop them into `out/<name>/images/` yourself.

## Quickstart

```bash
cd visual-storybook
cp config.example.json config.json     # then edit: model tag, URLs, backend

# whole pipeline in one go
python3 storybook.py run --script examples/the_lighthouse_keeper.txt

# open the result
open out/the_lighthouse_keeper/storybook.html   # print → PDF for a bound copy
```

Or stage by stage (each stage is resumable and idempotent):

```bash
python3 storybook.py breakdown --script examples/the_lighthouse_keeper.txt
python3 storybook.py render   --book out/the_lighthouse_keeper
python3 storybook.py assemble --book out/the_lighthouse_keeper --embed
```

Useful flags: `--model` and `--backend` override the config per run;
`--embed` inlines the images so `storybook.html` is a single shareable file.
`render` skips images that already exist, so re-running it retries only
failures — and lets you regenerate a single page by deleting its PNG.

## How it works

**Stage 1 — breakdown (the LLM does the storytelling).** Two passes:

1. *Production bible* — the model extracts every character and location with a
   concrete, reusable visual description ("silver hair in a tight braid, navy
   oilskin coat…").
2. *Storyboard* — the model converts the script (chunked for long scripts, with
   a rolling "story so far" recap) into ordered shots: title, narration for the
   page, optional dialogue, camera framing, mood, and a paintable `action`
   line. Between your script beats it inserts up to
   `book.max_intermediate_per_gap` **intermediate shots**, marked
   `"kind": "intermediate"` — these are the connective cinematic tissue you'd
   otherwise storyboard by hand.

**Character consistency is enforced in code, not by the model.** The final
image prompt for each shot is assembled deterministically:
`style + camera framing + action + the bible's verbatim visual description of
every character in frame + setting + mood + "no text"`. The same character
description lands in every prompt, and each scene uses `seed + scene_number`,
which keeps a stable look across pages on Stable Diffusion backends.

**Stage 2 — render** posts each prompt to the chosen backend and writes
`images/scene_NNN.png`. Failures don't abort the run; re-run to retry.

**Stage 3 — assemble** binds everything into `storybook.html`: a cover, then
one page per shot (image, narration, dialogue; intermediate shots get a small
"interlude" badge). Pages without an image show their prompt in a placeholder,
so the prompts-only workflow still produces a reviewable draft. Print CSS puts
one page per sheet — use the browser's *Print → Save as PDF* for the final
book.

## Configuration

Everything lives in `config.json` (see `config.example.json`; missing keys fall
back to defaults):

| Section  | Key                       | Meaning                                                    |
|----------|---------------------------|------------------------------------------------------------|
| `llm`    | `base_url`, `api_key`     | OpenAI-compatible endpoint; local servers accept any key   |
|          | `model`                   | your model tag, e.g. your Gemma abliterated build          |
|          | `json_retries`            | re-asks when a small model replies with malformed JSON     |
|          | `chunk_chars`             | long scripts are storyboarded in chunks of this size       |
| `images` | `backend`                 | `none` \| `a1111` \| `openai`                              |
|          | `width/height/steps/cfg_scale/sampler` | passed through to the backend                 |
|          | `seed`                    | base seed (scene *N* uses `seed+N−1`); `-1` = random       |
|          | `negative_prompt`         | applied to every scene                                     |
| `book`   | `style`                   | global art direction, prepended to every prompt            |
|          | `max_intermediate_per_gap`| how many invented shots may sit between two script beats   |
|          | `narration_sentences`     | max narration length per page                              |

## Script format

Plain text. Anything works — prose, screenplay, or beat outlines like the
example. Blank lines are used as chunk boundaries for long scripts, and
`NAME: line` dialogue survives nicely, but there is no required syntax: the
LLM does the interpretation.

## Extending

- **ComfyUI or another backend:** add a `render_<name>()` function in
  `storybook.py` returning PNG bytes and register it in `RENDERERS`.
- **Different look:** edit `book.style` (art direction) and `BOOK_CSS` (page
  design).
- **Webtoon/comic layout, speech bubbles, EPUB export** are natural next steps —
  the `breakdown.json` schema already carries dialogue per shot.
