# Changelog

## [0.1.0] — 2026-04-17

### Bot (`bot/`)

#### Modules
- **`listener.ts`** — Helius WebSocket `logsSubscribe` op Raydium AMM v4. Detecteert `initialize2` pool-creaties, parseert instructie-data (openTime, liquiditeit, mints), reconnect met exponentiële backoff. `restart()` methode herverbindt met nieuwe `process.env` config.
- **`filter.ts`** — Evalueert pool op liquiditeit, token-leeftijd, deployer history, honeypot-simulatie via Jupiter quote, WSOL-pair check, toekomstige openTime, en blacklist.
- **`swapper.ts`** — Jupiter Aggregator v6 (`lite-api.jup.ag/swap/v1`): quote → swap flow met retries. `buyToken()` en `sellToken()` voor volledige trade lifecycle. DRY_RUN simuleert quote zonder TX.
- **`monitor.ts`** — Bewaakt open posities via Jupiter Price API v2 (`lite-api.jup.ag/price/v2`). Triggert take-profit of stop-loss, emit `trade_closed` event.
- **`wallet.ts`** — Laadt keypair uit `WALLET_PRIVATE_KEY`. Genereert throwaway keypair bij DRY_RUN. `getBalanceSol()`, `hasSufficientBalance()`.
- **`socket-server.ts`** — Socket.io server (poort 3001). Verwerkt `start_bot`, `stop_bot`, `update_config`, `request_status`. Broadcast alle bot-events naar dashboard. Bot start pas via dashboard.
- **`event-bus.ts`** — Typed EventEmitter: `pool_detected`, `pool_filtered`, `trade_executed`, `trade_closed`, `bot_log`, `balance_update`, `credit_stats`, `dry_run_status`.
- **`creditTracker.ts`** — Telt Helius credit-verbruik (bytes, berichten passed/dropped). Logt stats elke 10 min, emit `credit_stats` event.
- **`config.ts`** — Type-safe `.env` loader.
- **`logger.ts`** — Winston logger met timestamps.

#### Optimalisaties
- Pre-filter op raw WebSocket string voor `"initialize2"` vóór `JSON.parse` — ~99% van berichten verworpen zonder parse-overhead.
- Time-windowed deduplicatie: `Map<signature, timestamp>` met 30s venster, max 500 entries.
- Waarschuwing bij opstart als `WALLET_PRIVATE_KEY` nog de placeholder waarde heeft.

---

### Dashboard (`dashboard/`)

#### Pagina's
- **`/live`** — Real-time monitor: DRY RUN banner, ModeIndicator (LIVE/SIM), KPI strip, actieve trades tabel, log feed, pools vandaag, Helius credit widget, gesimuleerde P&L (alleen DRY RUN).
- **`/demo`** — Parameter sliders (individuele `useState`), simulatie log, resultaten tabel. `handleStart()` stuurt correcte `SNAKE_CASE` config-keys naar bot.
- **`/settings`** — Laadt `.env` via `GET /api/settings`, slaat op via `POST /api/settings`, stuurt wijzigingen ook live via socket.
- **`/stats`** — Filter breakdown en gesloten trades overzicht.

#### Technisch
- Next.js 16 App Router, Tailwind CSS v3, shadcn/ui
- Typed Socket.io client met 20 reconnect pogingen
- `use-bot-socket.ts` hook: centrale staat voor alle bot-events
- ThemeToggle: `localStorage` + `classList` zonder externe dependency
- `'use client'` op `button.tsx` voor hydration fix

#### Bugfixes
- Tailwind v4/v3 mismatch opgelost (`globals.css` herschreven met HSL vars)
- `<script dangerouslySetInnerHTML>` verwijderd uit `<html>` (Next.js App Router fout)
- Demo sliders herschreven met individuele `useState` + `onChange`
- `start_bot` no-op opgelost: listener start nu via dashboard, niet automatisch
