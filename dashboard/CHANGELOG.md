# Changelog — SOL Sniper Dashboard

All notable changes to the Next.js dashboard (`stb-dashboard/`) are documented here.

---

## [0.1.0] — 2026-04-17

### Project setup

- Next.js 16 App Router met TypeScript
- Tailwind CSS v3 met shadcn/ui component library
- Socket.io client (typed) verbinding met bot op poort 3001
- Dark mode standaard via `className="dark"` op `<html>` (localStorage persistent via ThemeToggle)

---

### Pagina's

#### `/live` — Live Monitor
- Real-time bot status, wallet balance, pool-statistieken
- **DRY RUN banner**: geel alert bovenaan pagina als `dryRun=true`
- **ModeIndicator**: DRY RUN (geel) of LIVE (pulserende groene dot) badge
- KPI strip: wallet balance, pools gedetecteerd/gefilterd, trades
- Actieve trades tabel met SIM/LIVE badge per trade
- Log feed (laatste 100 regels)
- Pools vandaag samenvatting
- Helius credits widget (credits/uur, credits/maand, pass rate, besparingen)
- Gesimuleerde P&L kaart (alleen zichtbaar bij DRY RUN): totaal SOL P&L, win rate, trade count
- Start/Stop Bot knop met disabled state als niet verbonden

#### `/demo` — Demo Simulatie
- DRY RUN parameter sliders (individuele `useState` per slider):
  - Koop-bedrag per trade (0.001–1 SOL)
  - Min. liquiditeit (1–50 SOL)
  - Max. token leeftijd (10–120s)
  - Max. honeypot verlies (5–50%)
  - Min. deployer transacties (1–50)
  - Take Profit (10–500%)
  - Stop Loss (5–90%)
- Simulatiesnelheid selector (1×, 5×, 10×)
- `handleStart()` stuurt correcte `.env`-sleutelnamen via `update_config` socket event
- Simulatie log feed
- Demo resultaten tabel (gesloten trades met P&L, TP/SL reden, duur)

#### `/stats` — Statistieken
- Filter breakdown pie chart (liquiditeit, leeftijd, honeypot, blacklist, deployer, etc.)
- Gesloten trades overzicht

#### `/settings` — Instellingen
- Laadt huidige `.env` waarden bij mount via `GET /api/settings`
- Individueel opslaan per veld met visuele feedback (✓ / ✗)
- "Alles opslaan" knop voor batch-update
- Wijzigingen gaan ook live naar de bot via `update_config` socket event
- API route: `app/api/settings/route.ts` (GET + POST, valideert key format `/^[A-Z0-9_]+$/`)

---

### Componenten

- **`Nav`** — Zijbalk met navigatielinks en ThemeToggle
- **`ThemeToggle`** — Wisselt dark/light via `localStorage` en `document.documentElement.classList`
- **`StatusBadge`** — Bot status indicator (running/stopped/error + verbindingsstatus)
- **`LogFeed`** — Scrollende log output met level-kleur (info/warn/error/debug)
- **`ActiveTradesTable`** — Tabel met open posities, live P&L%, duur, SIM/LIVE badge

---

### Hooks & lib

- **`hooks/use-bot-socket.ts`** — Centrale Socket.io state: verbinding, botStatus, dryRun, balanceSol, stats, logs, poolsDetected/Filtered, activeTrades, closedTrades, creditStats. Actions: startBot, stopBot.
- **`lib/socket.ts`** — Lazy-initialized Socket.io singleton (poort 3001, 20 reconnect pogingen)
- **`lib/types.ts`** — Gedeelde TypeScript interfaces gespiegeld vanuit `stb/src/socket-types.ts`

---

### Socket.io events

| Event (server→client) | Beschrijving |
|---|---|
| `bot_status` | Status, uptime, dryRun, statistieken |
| `dry_run_status` | DRY RUN aan/uit (direct bij verbinding) |
| `balance_update` | Wallet balance in SOL |
| `pool_detected` | Nieuwe Raydium pool gevonden |
| `pool_filtered` | Pool afgewezen (met categorie) |
| `trade_executed` | Koop uitgevoerd |
| `trade_closed` | Positie gesloten (TP/SL) |
| `bot_log` | Log-regel van de bot |
| `credit_stats` | Helius credit gebruik (elke 10 min) |

---

### Bugfixes

- **Tailwind v4/v3 mismatch**: `globals.css` herschreven met `@tailwind` directives en HSL CSS-variabelen (geen `@import "shadcn/tailwind.css"`)
- **Theme toggle**: vervangen door standalone `localStorage` + `classList` implementatie (geen `next-themes` dependency)
- **Demo sliders**: herschreven met individuele `useState` variabelen en `onChange` (React synthetic event)
- **Settings laden**: `GET /api/settings` leest `.env` bij mount
- **`button.tsx` hydration error**: `'use client'` directive toegevoegd
- **Script-in-html error**: `<script dangerouslySetInnerHTML>` verwijderd uit `<html>`, vervangen door `className="dark"` als startwaarde
- **`start_bot` no-op**: listener start niet meer automatisch; `start_bot` socket event start/herstart de listener
- **Config sleutelnamen demo**: `update_config` gebruikt nu correcte `SNAKE_CASE` namen die overeenkomen met `.env`
