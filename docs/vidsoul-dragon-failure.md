# VidSoul — dragon clip failure: diagnosis and fix plan

Written 2026-07-31, revised the same day once the real stack was identified.

**Status: diagnosis only — none of this has been run.** The pipeline lives on local
Windows drives that the session producing this document could not reach, so every
recommendation below is reasoned from the stack description, not measured. Verify before
trusting.

---

## 0. The most urgent problem is not the dragon

At the time of writing, **the dragon pipeline has no version control**:

| Location | State |
| --- | --- |
| `E:\jcpl_avatar_studio\MF\dragons_last_trial\` | **No git at all.** Holds `dragon_manifest.py`, `dragon_assemble.py`, `test_render_neg.py`, repair-table edits. Only the disk protects them. |
| `E:\jcpl_avatar_studio\video_tools\` | Git, local-only, **no remote**. 133 commits, branch `feat/gt002-acceptance-runner`, last commit `9c18947` (2026-07-26). |
| `ltx23_train/audit/run_ltx.py` + engine changes | **Uncommitted**, sitting on the feature branch. |
| `D:\`, `D:\dragon_runs`, `E:\jcpl_avatar_studio` | Not repositories. |

This is the actual explanation for days of lost work and vanished models — not any single
bad render. Fix it first; it costs two minutes:

```bash
cd E:\jcpl_avatar_studio\video_tools
git add -A && git commit -m "WIP: --neg flag on run_ltx, engine-side changes"

cd E:\jcpl_avatar_studio\MF\dragons_last_trial
git init && git add -A && git commit -m "Dragon pipeline: manifest, assemble, neg-render test, repair table"
```

Before adding a remote, check the history size — if model weights were ever committed,
the push will fail:

```bash
git count-objects -vH        # size-pack over ~1 GB means weights are in history
```

Keep `*.safetensors`, `*.ckpt`, `*.pt` and render outputs in `.gitignore`; weights belong
on the Hugging Face Hub, which already holds `pranab_v1.safetensors` in
`Pramaan/jcpl-loras` (private) and `Pramaan/pranab-flux-lora-public`.

---

## 1. The actual stack

Inferred from `ltx23_train`, `run_ltx.py`, and the commit *"Flip film keyframe default
klein → flux2"*:

```
  shot description
        │
        ▼
  FLUX keyframe (flux2)  ──►  keyframe image per shot
        │
        ▼
  LTX-Video (ltx23)      ──►  animated clip from that keyframe
        │
        ▼
  dragon_assemble.py     ──►  final film
```

This is **local and keyframe-driven**, not hosted text-to-video. That distinction changes
the diagnosis, and it invalidates the first draft of this document, which recommended
Seedance / Wan / Kling. Those are Higgsfield-hosted models and are only relevant if the
production ever moves off local inference.

## 2. Where the drift actually originates

An earlier draft assumed shots were generated straight from text. They are not — there is
already a keyframe stage. So the useful question is *which* stage loses identity, and the
architecture answers it:

> **If each FLUX keyframe is generated independently from a text prompt, every keyframe is
> a different dragon — and LTX then animates each different dragon faithfully.**

The video model is likely not the culprit. It is doing its job on inconsistent input.
This is worth confirming before changing anything: **lay the raw FLUX keyframes side by
side.** If the dragon differs across them, the bug is upstream of LTX entirely, and no
amount of LTX tuning will fix it.

### Fix, in order of impact

1. **Train a dragon LoRA.** This is the strongest identity lock available and the
   capability is already in hand — `pranab_v1.safetensors` proves the FLUX LoRA training
   path works. A character LoRA makes the dragon reproducible across every keyframe by
   construction, which no prompt can achieve.
2. **Failing that, condition keyframes on a reference image** — FLUX Redux / IP-Adapter
   style — so keyframe N+1 inherits keyframe N's appearance instead of resampling it.
3. **Freeze the seed and the full prompt prefix** across keyframes of the same character.
   Weakest of the three and it will not survive pose changes, but it is nearly free.
4. **Chain within a scene**: last frame out of LTX becomes the next shot's init image, so
   continuity holds across cuts meant to be continuous.
5. **Log unresolved character references.** If `dragon_manifest.py` maps a script mention
   to a character asset and the lookup can silently miss, a missed match means a keyframe
   generated with no reference at all — which presents as intermittent, hard-to-reproduce
   drift.

## 3. Motion and physics

Separate problem, separate fix. Dragons are close to a worst case for video models: wings
are large articulated surfaces with no rigid-body prior, so models default to rendering
them as **morphing cloth**. Attack it structurally, not by prompting.

1. **Shorter shots.** Warping compounds with duration. Several 4–6s shots beat one long
   take, and cutting more is free.
2. **Bracket the motion with both endpoints.** If the LTX path supports an end keyframe as
   well as a start, supplying both turns "invent a flight cycle" into interpolation
   between two poses that were chosen deliberately. Strongest single lever for wings.
3. **Use the `--neg` flag** that was just added to `run_ltx.py`. Negative prompts targeting
   the actual artefacts — *melting, morphing, extra limbs, deformed wings, warping* — are
   well matched to this failure. This is the cheapest experiment available and it is
   already wired up.
4. **Choose shots the model can win.** Wides for flight, where wing detail is small on
   screen and error is less visible; tighter shots for held poses and roars. **Mid-shots
   with full wing articulation are the worst case** — replace them with a cutaway.

## 4. Open questions

- Are the FLUX keyframes for one character visibly the same dragon? (Decides everything above.)
- Does `run_ltx.py` accept an end keyframe, or only a start image?
- Does `dragon_manifest.py` log a miss when a character mention resolves to no asset?
- What were the exact prompt, seed and model for the failing dragon clip?
