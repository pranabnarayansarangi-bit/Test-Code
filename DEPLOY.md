# Deploying Narayan

Narayan must run on an **always-on machine you control** — your PC/laptop or a small VPS —
because it links to *your* WhatsApp number (a one-time QR scan) and uses *your* secrets.
Pick one of the three paths below. All of them boil down to: install → set 3 secrets →
start → scan the QR once.

> ⚠️ Baileys is an unofficial WhatsApp client (against WhatsApp's ToS). Narayan is
> read/draft-only and never auto-sends, which keeps the risk low — but use a number you can
> afford to risk. See the README's risk note.

---

## The two steps only you can do

No matter which path you choose, these two are manual (they need your accounts and phone):

1. **Three secrets** in `.env`:
   - `ANTHROPIC_API_KEY` — https://console.anthropic.com/
   - `TELEGRAM_BOT_TOKEN` — Telegram **@BotFather** → `/newbot`
   - `TELEGRAM_CHAT_ID` — Telegram **@userinfobot** (then press **Start** on your new bot)
2. **Scan the WhatsApp QR** once on first start (it prints in the logs):
   WhatsApp → Settings → Linked Devices → Link a Device.

Everything else (install, build, run, restart-on-crash, scheduling) is automated.

---

## Path A — Docker (recommended, works anywhere)

```bash
cp .env.example .env            # then edit .env (the 3 secrets)
cp config.example.json config.json   # groups to watch, timezone
cp knowledge.example.md knowledge.md # your personnel/projects/disputes/fleet/receivables

docker compose up -d --build
docker compose logs -f narayan  # <-- scan the QR shown here, once
```

Auth session and database persist in named volumes (`narayan_auth`, `narayan_data`), so
restarts and upgrades keep your pairing. To update: `git pull && docker compose up -d --build`.

---

## Path B — pm2 (PC/VPS with Node 20+, no Docker)

```bash
bash scripts/setup.sh           # seeds .env/config.json/knowledge.md, installs, builds
#   ... edit .env with your 3 secrets ...
npm install -g pm2
pm2 start deploy/ecosystem.config.js
pm2 logs narayan                # <-- scan the QR shown here, once
pm2 save && pm2 startup         # auto-start on reboot
```

---

## Path C — systemd (Linux VPS, no Docker)

```bash
bash scripts/setup.sh           # then edit .env with your 3 secrets
# edit deploy/narayan.service — set <your-linux-user> and <absolute-path-to-Test-Code>
sudo cp deploy/narayan.service /etc/systemd/system/narayan.service
sudo systemctl daemon-reload && sudo systemctl enable --now narayan
journalctl -u narayan -f        # <-- scan the QR shown here, once
```

---

## How to see it working

- **Telegram (the live UI):** P1 items arrive instantly with Approve / ✏️ Edit / Snooze /
  Dismiss buttons; the **09:30 Daily Brief** and the morning/evening digests land
  automatically. Commands: `/pending`, `/today`, `/digest`.
- **`npm run status`** (or `npm run status:dev`): a terminal snapshot of open items grouped
  by P1/P2/P3 with owner, due time, confidence, and your recent decisions — no Telegram
  needed. In Docker: `docker compose exec narayan node dist/cli/status.js`.
- **Logs:** `docker compose logs -f narayan` / `pm2 logs narayan` / `journalctl -u narayan -f`
  — shows the pairing QR, each analysed batch, and any errors.
- **Obsidian (optional):** set `OBSIDIAN_VAULT_PATH` and every request is appended to a dated
  note under `Narayan/` in your vault.

## First-day checklist

1. Start it, scan the QR — logs should print `[whatsapp] connected.`
2. Have someone post a real request in a monitored group (e.g. "please share work plan").
3. Within ~a minute you should get a Telegram card (P1) or see it via `npm run status` (P2).
4. Tap **Approve** or **✏️ Edit** — `npm run status` then shows it under "Recent decisions".
5. Tune `config.json` (which groups, priority keywords) and fill `knowledge.md` for sharper
   drafts and a more useful brief.
