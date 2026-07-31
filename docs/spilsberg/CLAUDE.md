# Spilsberg — video & image generation agent

Working notes for the JCPL Avatar Studio pipeline. Copy this file to the agent's working
directory (the folder it starts in) so it loads on every session.

Written 2026-07-31 after the dragon clip failed on character drift and bad motion.

---

## Layout

| Path | What it is | Git |
| --- | --- | --- |
| `E:\jcpl_avatar_studio\video_tools\` | Engines, runners, UI, benches | Repo, branch `feat/gt002-acceptance-runner`. **No remote.** |
| `E:\jcpl_avatar_studio\MF\dragons_last_trial\` | Dragon film: `dragon_manifest.py`, `dragon_assemble.py`, `test_render_neg.py`, repair table | Repo, branch `master` |
| `D:\dragon_runs\` | Render outputs | Not a repo |

Engines present: **LTX-Video** (`ltx_engine.py`, `ltx23_train/`), **WAN**
(`wan_engine.py`, `wan_runners/run_s2v.py`), **FLUX** keyframes via `image_engine.py`.
Film keyframe default is `flux2` (changed from `klein` in `9c18947`).

## Rules of the house

**Commit before any run that changes engine code.** In July 2026 twenty modified and
untracked files sat uncommitted overnight, including `identity_harness.py`, `regen_ref.py`
and `film_maker.py` — none of which had ever been committed. Nothing was lost, but only
by luck. A WIP commit costs seconds and is always better than a clean-looking tree.

**`video_tools` has no remote.** Its history exists on exactly one disk. Do not treat
committed as backed up. Before adding a remote, run `git count-objects -vH` — a
`size-pack` in the GB range means weights are in history and the push will fail on the
100 MB file limit.

**Never commit weights or renders.** `*.safetensors`, `*.ckpt`, `*.pt`, `*.bak-*` and
output video belong in `.gitignore`. Trained LoRAs go to the Hugging Face Hub — the
account `Pramaan` already holds `pranab_v1.safetensors` in `jcpl-loras` (private) and
`pranab-flux-lora-public`.

---

## Character drift — diagnose the stage before changing anything

The pipeline is **keyframe-driven**: FLUX renders a keyframe per shot, then LTX or WAN
animates it. So drift has two possible homes, and they need opposite fixes.

**Check the keyframes first.** Lay the raw FLUX keyframes for one character side by side
before touching any video parameter.

- **Keyframes disagree** → the bug is in image generation. The video model is innocent;
  it is faithfully animating a different creature each time. No amount of LTX or WAN
  tuning will help.
- **Keyframes agree, video drifts** → the bug is in the animate stage. Now video
  parameters are worth tuning.

This one observation decides everything downstream. Do not skip it.

### If keyframes disagree, in order of impact

1. **Train a character LoRA.** Strongest identity lock available, and the FLUX LoRA
   training path is already proven by `pranab_v1`. A LoRA makes the character
   reproducible by construction — something no prompt can achieve.
2. **Condition on a reference image** (FLUX Redux / IP-Adapter style) so each keyframe
   inherits the last one's appearance instead of resampling from scratch.
3. **Freeze seed and prompt prefix** across a character's keyframes. Nearly free, but
   weak — it will not survive pose or angle changes.
4. **Check `identity_harness.py` and `regen_ref.py` are actually wired into the film
   path.** They exist. If the dragon run bypassed them, the fix may be wiring rather
   than new capability.

### Silent lookup misses

If `dragon_manifest.py` maps a script mention to a character asset and that lookup can
miss without raising, the shot renders with **no reference at all** — which presents as
intermittent, hard-to-reproduce drift. Make a miss loud. A warning line is enough.

Name variants are the usual cause: "the dragon", "Ember", "the great wyrm" must all
resolve to one asset. Match on a canonical key — fold case, strip punctuation and
accents, singularise — rather than exact string equality.

---

## Motion and physics

A separate problem with separate fixes. Dragons are close to a worst case: wings are
large articulated surfaces with no rigid-body prior, so models render them as **morphing
cloth**. Attack this structurally, not by adding adjectives.

1. **Use the `--neg` flag** on `run_ltx.py`. Negative prompts naming the actual artefacts
   — *melting, morphing, warping, deformed wings, extra limbs* — are well matched to this
   failure. Cheapest experiment available; try it before anything structural.
2. **Shorter shots.** Warping compounds with duration. Several 4–6s shots beat one long
   take, and cutting more costs nothing.
3. **Bracket the motion with both endpoints** where the engine supports an end keyframe.
   Supplying start and end turns "invent a flight cycle" into interpolation between two
   poses chosen deliberately. Strongest single lever for wings.
4. **Chain within a scene** — last frame out becomes the next shot's init image, so
   continuity holds across cuts meant to be continuous.
5. **Pick shots the model can win.** Wides for flight, where wing detail is small on
   screen and error is less visible. Tighter shots for held poses and roars. **Mid-shots
   with full wing articulation are the worst case** — replace them with a cutaway.

---

## Reporting

State what was verified versus inferred. The report that started this investigation said
the dragon folder had no version control; it did, and the false alarm cost real attention.
Run the command and quote the output rather than describing remembered state.
