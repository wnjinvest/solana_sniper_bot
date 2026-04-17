# Solana Sniper Bot — Monorepo

## Structuur
```
bot/        Node.js sniper bot (poort 3001 Socket.io)
dashboard/  Next.js dashboard  (poort 3000)
```

## Services starten
```bash
# Bot (terminal 1)
cd bot && npm run dev

# Dashboard (terminal 2)
cd dashboard && npm run dev
```

## Communicatie
- Bot → Dashboard via **Socket.io op poort 3001**
- Typed events in `bot/src/socket-types.ts` (gespiegeld in `dashboard/lib/types.ts`)
- Als je een event toevoegt: **beide bestanden** updaten

## npm install
Gebruik altijd `--legacy-peer-deps` voor het dashboard:
```bash
cd dashboard && npm install --legacy-peer-deps
```

## Werkende mappen (originelen)
De bot en dashboard draaien ook nog vanuit:
- `/opt/claude/stb/` (bot)
- `/opt/claude/stb-dashboard/` (dashboard)
