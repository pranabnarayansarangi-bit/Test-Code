# Narayan — WhatsApp Executive Assistant

Narayan reads your WhatsApp, finds the **real requests** buried in busy operational
groups (work plans, tool/material deposits, electrical & procurement requirements, daily
reports, approvals), and brings them to you on **Telegram** with a one-line summary, a
priority, a due time, and a **ready-to-send draft reply**. You approve, snooze, or
dismiss with a tap. It reminds you with morning and evening digests so nothing slips.

```
  WhatsApp (your number)
        │  QR link (Baileys)
        ▼
   Listener ──► SQLite store ──► Obsidian vault (optional .md export)
        │            │
        │            ▼
        │       Claude analyzer  (extract action-items, deadlines, draft replies)
        │            │
        ▼            ▼
  (Phase 2 send) ◄── Telegram bot ──► YOU (reminders, digests, Approve/Snooze/Dismiss)
                       ▲
                 cron scheduler (morning + evening digests, snooze reminders)
```

**Phase 1 (this version) is read / draft-only — Narayan never sends anything to WhatsApp
on its own.** It reads, analyzes, reminds, and drafts; you copy the approved reply and
send it yourself. This keeps the WhatsApp ban risk low. Phase 2 will optionally wire the
"Approve" button to an automatic, rate-limited send.

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

## Using it (on Telegram)

Narayan messages you when it finds a request. Each card shows the group, who asked, the
ask, a due time if any, and a suggested reply, with buttons:

- **✅ Approve** — marks it handled and sends you the reply text to copy into WhatsApp.
- **⏰ Snooze 2h** — reminds you again in 2 hours.
- **✔️ Done** / **🗑 Dismiss** — clear it.

Commands:

- `/pending` — list open requests as actionable cards.
- `/today` — items due today.
- `/digest` — a summary of everything open.

You also get an automatic **morning digest** and **evening digest** (times set in
`config.json`).

## Configuration reference

`config.json` (see `config.example.json`):

| Field | Meaning |
|-------|---------|
| `timezone` | IANA timezone for digests and due times (e.g. `Asia/Kolkata`). |
| `ownerName` | Your name, used in drafts. |
| `persona` | System prompt describing you and your domain — tune this for accuracy. |
| `reminderTimes.morningDigest` / `eveningDigest` | `"HH:MM"` digest times. |
| `highPriorityKeywords` | Words that bump an item to high priority. |
| `monitoredChats` | List of `{ "match": "<substring of chat name>" }` to watch. |
| `monitorAllChats` | If `true`, watch every chat (ignores the allow-list). |

`.env` (see `.env.example`): `ANTHROPIC_API_KEY`, `NARAYAN_MODEL` (default
`claude-opus-4-8`), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `AUTH_DIR`, `DB_PATH`,
`CONFIG_PATH`, and optional `OBSIDIAN_VAULT_PATH`.

### Optional: Obsidian export

Set `OBSIDIAN_VAULT_PATH` in `.env` to an absolute path to your Obsidian vault. Narayan
will append each new request as a checkbox item to a dated daily note under a `Narayan/`
folder in the vault. Leave it empty to disable.

## Project layout

```
src/
  index.ts            # boots WhatsApp, scheduler, Telegram bot, analysis loop
  config.ts           # env + config.json loader, chat allow-list matching
  whatsapp/           # Baileys client, message ingestion, normalization
  store/              # SQLite schema + messages/action-items/drafts/reminders
  analyze/            # Claude classification + extraction, due-date parsing, prompts
  notify/             # Telegram bot (buttons/commands) + cron reminders + formatting
  obsidian/           # optional markdown vault export
  util/               # small time helpers
```

## Data & privacy

Everything stays **local**: messages and action items live in a SQLite file (`DB_PATH`),
WhatsApp auth in `auth_state/`, secrets in `.env`. All of these are gitignored and never
committed. Only message **text** from monitored chats is sent to the Anthropic API for
analysis.

## Roadmap (Phase 2)

- Wire **Approve** to an automatic, rate-limited WhatsApp send (opt-in).
- Optional ChatGPT "second opinion" audit pass on drafts before you approve.
- Deploy to an always-on VPS with a process manager (pm2 / systemd).
- Per-chat mute/priority rules and richer scheduling.
