# Narayan — WhatsApp Executive Assistant

Narayan reads your WhatsApp, finds the **real requests** buried in busy operational
groups (work plans, tool/material deposits, electrical & procurement requirements, daily
reports, payments, approvals), and brings them to you on **Telegram** with a priority, a
suggested owner, a due time, and a **ready-to-send draft reply**. You approve, edit,
snooze, or dismiss with a tap. A morning **Daily Brief** plus digests mean nothing slips.

```
  WhatsApp (your number)
        │  QR link (Baileys)
        ▼
   Listener ──► SQLite store ──► Obsidian vault (optional .md export)
        │            │
        │            ▼
        │     Triage (Sonnet 4.6) ──► Draft (Opus 4.8)   ◄── knowledge.md + decision memory
        │            │
        ▼            ▼
  (later: send) ◄── Telegram bot ──► YOU (Daily Brief, digests, Approve/Edit/Snooze/Dismiss)
                       ▲
                 cron scheduler (09:30 brief, morning/evening digests, snooze reminders)
```

**Read / draft-only — Narayan never sends anything to WhatsApp on its own.** It reads,
analyzes, reminds, and drafts; you copy the approved reply and send it yourself. This keeps
the WhatsApp ban risk low. A later phase will optionally wire "Approve" to an automatic,
rate-limited send.

### What's new (chief-of-staff upgrade)

- **P1 / P2 / P3 routing** — P1 (money, Vedanta, safety, legal, contract, diesel, PO
  exhaustion, breakdown) alerts you instantly; P2 (procurement, tools, reports, work plans)
  waits for the digest; P3 (greetings, quotes, FYI) is auto-archived and never pings you.
- **Expected Owner** — each item suggests who should action it (Procurement, Store, Finance…).
- **Daily MD Brief** at 09:30 — Critical / Due Today / Awaiting Your Decision / Risks.
- **Decision Memory** — Approve or ✏️ Edit a reply; Narayan stores your final wording and
  uses recent approvals as examples so drafts start sounding like you.
- **Knowledge file** (`knowledge.md`) — personnel, projects, disputes, fleet, receivables,
  injected into analysis so drafts and the brief are grounded in your operation.
- **Confidence score** — anything the model is unsure about (< 0.75) is flagged
  **⚠ Needs Review** instead of being trusted silently, and is never auto-archived.
- **Model tiering** — cheap/fast **Sonnet 4.6** triages every batch; capable **Opus 4.8**
  drafts the few replies that matter. (Switch the draft tier to `claude-fable-5` once it is
  available — it's one config value.)

---

## ⚠️ Important: read this first

Narayan connects to WhatsApp using **Baileys**, an *unofficial* WhatsApp Web library.
This is **against WhatsApp's Terms of Service** and carries a real risk that your number
could be rate-limited or banned. To reduce that risk this build:

- only **reads** and **never auto-sends** messages (sending is the main ban trigger),
- only processes the **groups you allow-list** in `config.json`,
- avoids aggressive reconnects and does not hijack your phone's online presence.

Use a number you can afford to risk, keep outbound activity minimal, and understand the
trade-off before pairing.

---

## What you need

1. **Node.js 20+** on the machine that will run Narayan (your PC/laptop). It must be on
   and connected for Narayan to receive messages and fire reminders.
2. An **Anthropic API key** — https://console.anthropic.com/
3. A **Telegram bot**:
   - Open Telegram, message **@BotFather**, send `/newbot`, follow the prompts, and copy
     the **bot token**.
   - Message **@userinfobot** to get your **numeric chat id**.
   - Open a chat with your new bot and press **Start** (so it can message you).

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure secrets
cp .env.example .env
#    then edit .env and fill in ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

# 3. Configure which chats to watch + reminder times + persona
cp config.example.json config.json
#    edit config.json: list the groups under "monitoredChats" (substring match on the
#    chat name, e.g. "Athagarh WTP", "Vedanta Lanjigarh O&M"), set your timezone, etc.

# 4. Run it
npm run dev          # development (ts-node)
# or
npm run build && npm start
```

On first run Narayan prints a **QR code** in the terminal. On your phone:
**WhatsApp → Settings → Linked Devices → Link a Device → scan the QR.**
After pairing, the session is saved under `auth_state/` and you won't need to scan again.

> **Deploying for real (always-on)?** See **[DEPLOY.md](./DEPLOY.md)** for one-command Docker,
> pm2, and systemd setups, plus how to watch it work. A quick `bash scripts/setup.sh` seeds
> your config files, installs, and builds in one go.

## Using it (on Telegram)

Narayan messages you for P1 items (and anything flagged ⚠ Needs Review) the moment it finds
them. Each card shows the group, who asked, the **suggested owner**, a due time, and a draft
reply, with buttons:

- **✅ Approve** — records your decision and sends you the reply text to copy into WhatsApp.
- **✏️ Edit** — reply with your own wording; Narayan saves *your* version (this is how it
  learns your style over time).
- **⏰ Snooze 2h** — reminds you again in 2 hours.
- **🗑 Dismiss** — clear it.

Commands:

- `/pending` — list open requests as actionable cards.
- `/today` — items due today.
- `/digest` — a summary of everything open.

You also get the **Daily MD Brief** at 09:30 (Critical / Due Today / Awaiting Your Decision /
Risks) plus a **morning** and **evening digest** (times in `config.json`).

## Configuration reference

`config.json` (see `config.example.json`):

| Field | Meaning |
|-------|---------|
| `timezone` | IANA timezone for digests and due times (e.g. `Asia/Kolkata`). |
| `ownerName` | Your name, used in drafts. |
| `persona` | System prompt describing you and your domain — tune for accuracy. |
| `reminderTimes.dailyBrief` / `morningDigest` / `eveningDigest` | `"HH:MM"` times. |
| `priorityBands.p1` / `p2` / `p3` | Keyword hints that steer triage into each band. |
| `delegationTargets` | Teams/people Narayan may suggest as the owner. |
| `reviewThreshold` | Below this confidence (0–1) an item is flagged ⚠ Needs Review. |
| `monitoredChats` | List of `{ "match": "<substring of chat name>" }` to watch. |
| `monitorAllChats` | If `true`, watch every chat (ignores the allow-list). |

`.env` (see `.env.example`): `ANTHROPIC_API_KEY`, `CLASSIFY_MODEL` (default
`claude-sonnet-4-6`), `DRAFT_MODEL` (default `claude-opus-4-8`; set `claude-fable-5` when
available), `CLASSIFY_EFFORT` / `DRAFT_EFFORT` / `BRIEF_EFFORT`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID`, `AUTH_DIR`, `DB_PATH`, `CONFIG_PATH`, and optional `OBSIDIAN_VAULT_PATH`
and `KNOWLEDGE_PATH`.

### Knowledge base

Copy `knowledge.example.md` to `knowledge.md` and set `KNOWLEDGE_PATH=./knowledge.md`. Fill in
PERSONNEL / PROJECTS / DISPUTES / FLEET / RECEIVABLES; Narayan injects it into triage, drafts,
and the daily brief so they're grounded in your operation. A tight markdown file beats a
vector database at this scale.

### Optional: Obsidian export

Set `OBSIDIAN_VAULT_PATH` to your vault folder. Narayan appends each new request to a dated
daily note under `Narayan/`. Leave empty to disable.

## Project layout

```
src/
  index.ts            # boots WhatsApp, scheduler, Telegram bot; routes P1/P2/P3
  config.ts           # env + config.json loader, allow-list, priority bands
  whatsapp/           # Baileys client, message ingestion, normalization
  store/              # SQLite: messages, action-items, drafts, reminders, decisions
  analyze/            # triage + draft (two-stage), prompts, knowledge loader, due-date
  notify/             # Telegram bot, daily brief, cron reminders, formatting
  obsidian/           # optional markdown vault export
  util/               # small time helpers
```

## Data & privacy

Everything stays **local**: messages, action items, and your decision history live in a
SQLite file (`DB_PATH`); WhatsApp auth in `auth_state/`; secrets in `.env`; your facts in
`knowledge.md`. All gitignored. Only message **text** from monitored chats (and your
knowledge file) is sent to the Anthropic API for analysis.

## Roadmap (next)

- **Phase 3:** Risk Score (0–100, brief sorts Risks by score), Calendar, Email into one
  unified queue, voice-note transcription.
- Wire **Approve** to an automatic, rate-limited WhatsApp send (opt-in).
- Deploy to an always-on VPS with a process manager (pm2 / systemd).
