#!/usr/bin/env bash
# One-shot setup for Narayan. Idempotent — safe to re-run.
#   bash scripts/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Narayan setup =="

# 1. Seed config files from the examples if they don't exist yet.
seed() {
  if [ ! -f "$1" ]; then cp "$2" "$1"; echo "  created $1 (edit it)"; else echo "  $1 already exists — keeping"; fi
}
seed ".env" ".env.example"
seed "config.json" "config.example.json"
seed "knowledge.md" "knowledge.example.md"

# 2. Install dependencies + build.
echo "== installing dependencies =="
if [ -f package-lock.json ]; then npm ci; else npm install; fi
echo "== building =="
npm run build

cat <<'NEXT'

== Done. Two manual steps remain (only you can do these): ==
  1. Edit .env and fill in:
       ANTHROPIC_API_KEY   (https://console.anthropic.com/)
       TELEGRAM_BOT_TOKEN  (Telegram @BotFather -> /newbot)
       TELEGRAM_CHAT_ID    (Telegram @userinfobot)
     Optionally edit config.json (groups to watch) and knowledge.md (your facts).
  2. Start it and scan the WhatsApp QR shown in the logs:
       npm start            # or: pm2 start deploy/ecosystem.config.js ; pm2 logs narayan
     WhatsApp -> Settings -> Linked Devices -> Link a Device -> scan the QR.

  See what it captured any time with:  npm run status
NEXT
