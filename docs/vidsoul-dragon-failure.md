# VidSoul — dragon clip failure: diagnosis and fix plan

Written 2026-07-31. Captures the analysis of the dragon clip that failed, so it is not
lost between sessions.

**Status: diagnosis and recommendations only — none of this has been run.** The VidSoul
codebase was not reachable from the session that produced this document, and the
Higgsfield workspace available there was on a free plan with 0 credits and an empty
generation history, so no test render was possible. Treat every parameter below as a
starting point to verify, not a measured result.

## The two confirmed failure modes

1. **Character drift / morph** — the dragon is not the same dragon between shots (and
   sometimes within a shot): scale, colour, anatomy and style all move.
2. **Bad motion / physics** — warping geometry, wing motion that does not read as flight.

These have different root causes and different fixes. Treating them as one "quality"
problem and attacking it with better prose in the prompt is why the clip failed.

---

## Failure 1 — character drift

### Root cause

Drift of this kind is the signature of a pipeline that generates **each shot
independently from text**. Nothing carries identity from one shot to the next, so every
shot re-invents the creature from the description. A text prompt is a lossy channel for
identity: "a large red dragon with black horns" has an enormous space of valid renderings,
and the model samples a different point in it every time.

The corollary matters: **making the description more detailed does not fix this.** It
narrows the space slightly and costs prompt budget that should be spent on action and
camera. The fix has to carry identity as *pixels*, not as words.

### Fix, in order of impact

1. **Lock the character once, before any video is generated.** Produce a canonical
   multi-view reference set and treat it as the single source of truth for the whole film.
   The `character-sheet` workflow in the Higgsfield bundle exists for exactly this
   (turnarounds, expression sheets, consistent multi-view).

2. **Use a reference-driven video model.** This is the single highest-impact change.
   Models that accept reference images and are built for identity retention:

   | Model | Reference inputs | Notes |
   | --- | --- | --- |
   | `seedance_2_0` | `start_image`, `end_image`, `image_references`, `video_references` | Tagged *reference / identity / consistent*. 4–15s, up to 4k. Best default here. |
   | `wan2_7` | `start_image`, `end_image` | Tagged *character / consistent*. 2–15s. |
   | `minimax_h3` | `start_image`, `end_image`, `image_references` | Multimodal keyframes, 2K. |
   | `kling3_0` | `start_image`, `end_image` | Tagged *multi-shot*, motion transfer. |

   Plain text-to-video will drift no matter how good the prompt is.

3. **Chain continuity inside a scene.** Take the last frame of shot N and pass it as
   `start_image` of shot N+1. This keeps identity *and* staging continuous across a cut
   that is meant to be continuous.

4. **Stop re-describing the dragon mid-film.** Once a reference is attached, the prompt
   should carry only **action and camera**. Re-describing the creature invites the model
   to reconcile two sources of truth, and it will sometimes pick the words over the image.

---

## Failure 2 — motion and physics

### Root cause

Dragons are close to a worst case for current video models. Wings are large articulated
surfaces with no rigid-body prior, so models default to treating them as **morphing
cloth** — which is exactly the "melting" look. This is a subject-difficulty problem, not
purely a model-quality problem, and it is attacked structurally rather than by prompting.

### Fix, in order of impact

1. **Shorter shots.** Warping and drift both compound with duration. Several 4–6s shots
   beat one 15s shot, and cutting more is free. If a shot has to be long, it should be one
   where the dragon is *not* mid-articulation.

2. **Bracket the motion with `start_image` and `end_image`.** Giving the model both
   endpoints turns an open-ended generation ("invent a flight cycle") into an
   interpolation between two poses that were chosen deliberately. This is the strongest
   single lever for wing motion.

3. **Use `motion_control` (motion transfer)** if any reference footage of a flight cycle
   or comparable creature movement is available. Transferred motion is physically
   plausible by construction; generated motion is not.

4. **Choose shots the model can win.** Wides for flight (wing detail is small on screen,
   so error is less visible); tighter shots for held poses, roars, dialogue. **Mid-shots
   with full wing articulation are the worst case** and should be avoided or replaced with
   a cutaway.

5. **Set the `genre` hint** (`epic` / `action`) on `seedance_2_0` or
   `cinematic_studio_3_0` rather than encoding tone in prose.

---

## Suggested pipeline shape

Two stages, because identity and assembly are separate problems:

```
Stage 1 — IDENTITY LOCK  (runs once per production)
  character brief
    └─► character-sheet workflow ──► canonical reference set  ◄── frozen, version-controlled
                                     (multi-view, expressions)

Stage 2 — PER SHOT  (runs per shot, reads the frozen reference)
  shot description (action + camera only)
    ├─► reference set ─────────────┐
    ├─► start_image (prev last frame, or a keyframe)
    ├─► end_image   (target pose)  ├─► seedance_2_0 ──► 4–6s clip
    └─► genre hint ────────────────┘
                                    └─► assemble in order
```

The `faceless-channel-video` workflow is worth reading as the assembly layer: it locks a
style plus reusable assets, scripts across one continuous voiceover, and ships one
finished video, explicitly supporting animated fairy-tale/myth. It is closer to a film
spine than its name suggests.

## Where a fuzzy name-matcher could fit (low priority)

If VidSoul resolves characters from a script, a script that says "the dragon", "Ember",
and "the great wyrm" must resolve to **one** locked reference. A canonical-key matcher
(fold case/punctuation/accents, singularise, then compare) handles that. This matters only
because a *failed* match may silently generate a shot with no reference attached — which
presents as drift. Worth checking whether the pipeline logs unmatched character mentions;
silent fallback to text-only generation would explain intermittent drift.

## Open questions to resolve before implementing

- Where does VidSoul live, and what does its current shot loop actually call?
- Is it text-to-video per shot today, or already passing references?
- What was the exact prompt and model for the dragon clip?
- Does it log when a character mention fails to resolve to a reference asset?
