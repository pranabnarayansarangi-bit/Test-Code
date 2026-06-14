# Prompt God 🔮

An offline iPhone app that **forges rich creative prompts for AI image & video tools**.
Everything runs **locally on the device** — there is no backend, no account, no network
calls, and no server-side moderation of the prompts you craft. Your subjects and your
saved prompts never leave your phone.

> "Unmoderated" here means the app itself never censors or rewrites the prompt text you
> build. Whatever AI image/video service you paste a prompt into still applies its own
> rules — Prompt God just helps you write the prompt.

## Features

- **Image & Video modes** — video mode adds motion, camera movement, pacing (slow-mo,
  timelapse…) and shot duration on top of the visual dials.
- **GOD MODE** — one tap, fully maxed-out, randomized epic prompt.
- **Dials** — toggle Style, Composition, Lighting, Color, Mood, Camera/Lens, and
  detail boosters; an Intensity slider (Sparse → Balanced → Maximalist) controls how
  many descriptors get layered in.
- **Free subject field** — type your own idea or leave it blank for a random one.
- **Local history & favorites** — every prompt is saved to on-device JSON. Star the
  good ones, swipe to delete, copy or share with the system share sheet.
- **No dependencies** — pure SwiftUI, no third-party packages.

## Project layout

```
PromptGod/
├─ PromptGod.xcodeproj          # Xcode 16 project (file-system synchronized group)
└─ PromptGod/
   ├─ PromptGodApp.swift        # App entry point
   ├─ ContentView.swift         # Tab bar: Forge / History / Saved
   ├─ Models/
   │  └─ PromptModels.swift     # PromptMode, GeneratedPrompt, PromptSettings
   ├─ Services/
   │  ├─ PromptLibrary.swift    # Curated word banks
   │  ├─ PromptGenerator.swift  # Combination engine + God Mode
   │  ├─ PromptStore.swift      # Local JSON persistence
   │  └─ Platform.swift         # Clipboard + haptics wrappers
   ├─ Views/
   │  ├─ GeneratorView.swift
   │  ├─ HistoryView.swift
   │  ├─ FavoritesView.swift
   │  └─ PromptCardView.swift
   └─ Assets.xcassets
```

## Running it

1. Open `PromptGod/PromptGod.xcodeproj` in **Xcode 16** (or newer).
2. Select an iPhone simulator or your device (iOS 17+).
3. Press **Run** (⌘R).

No signing setup is needed for the simulator. To run on a physical device, set your own
Team under *Signing & Capabilities* (the bundle id is `com.promptgod.app`).

## How prompts are built

`PromptGenerator` takes your `PromptSettings`, resolves a subject (yours or a random
one), then layers in randomly-sampled descriptors from each enabled category. The
Intensity slider controls how many items are drawn per category. Video prompts also get
motion + camera movement + pacing + duration appended. Output is a clean comma-separated
prompt ready to paste into your favorite generator.
