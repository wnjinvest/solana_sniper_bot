#!/usr/bin/env bash
# Synchroniseert bot/src/socket-types.ts → dashboard/lib/socket-types.ts
# Aanroepen na elke wijziging in de socket-types, en altijd voor een release.

set -e
cd "$(dirname "$0")/.."

SRC="bot/src/socket-types.ts"
DST="dashboard/lib/socket-types.ts"

cp "$SRC" "$DST"
echo "✓ $(wc -l < "$DST") regels gesynchroniseerd: $SRC → $DST"
