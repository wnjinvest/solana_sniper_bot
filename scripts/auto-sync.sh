#!/usr/bin/env bash
# Automatisch commit + push na elke Claude Code sessie.
# Draait via de Stop-hook in .claude/settings.json.

cd /opt/claude/solana-sniper-bot

# Niets te doen als working tree clean is
if [ -z "$(git status --porcelain)" ]; then
  exit 0
fi

# Gewijzigde bestanden samenvatten voor commit message
CHANGED=$(git status --porcelain | awk '{print $2}' | head -8 | tr '\n' ', ' | sed 's/,$//')

# Stage alles (.env is geblokkeerd via .gitignore)
git add -A

git commit -m "chore: auto-sync

Gewijzigd: ${CHANGED}

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

git push origin HEAD
echo "[auto-sync] Gepusht naar GitHub."
