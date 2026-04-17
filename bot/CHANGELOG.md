# Changelog — Solana Sniper Bot

All notable changes to the bot (`stb/`) are documented here.  
Dashboard changes are in `stb-dashboard/CHANGELOG.md`.

---

## [0.1.0] — 2026-04-17

### Bot core

#### Modules toegevoegd
- **`src/index.ts`** — Entry point; initialiseert alle modules, socket-server, event-bus, balance-polling en status-broadcasting. Bot start pas via dashboard (niet automatisch).
- **`src/config.ts`** — Laadt en valideert alle `.env` variabelen met type-safe accessors.
- **`src/logger.ts`** — Winston logger met timestamps en kleur-gecodeerde levels.
- **`src/wallet.ts`** — `WalletManager`: laadt keypair uit `WALLET_PRIVATE_KEY`, genereert throwaway keypair bij DRY_RUN, biedt `getBalanceSol()` en `hasSufficientBalance()`.
- **`src/listener.ts`** — `RaydiumListener`: Helius WebSocket `logsSubscribe` op Raydium AMM v4 program. Detecteert `initialize2` pool-creaties, parse instructie-data (openTime, liquiditeit, mints), reconnect met exponentiële backoff.
- **`src/filter.ts`** — `PoolFilter`: evalueert pool op liquiditeit, token-leeftijd, deployer history (min tx count), honeypot-simulatie via Jupiter quote, WSOL-pair check, toekomstige openTime check, en blacklist.
- **`src/swapper.ts`** — `Swapper`: koopt via Jupiter Aggregator v6 (`lite-api.jup.ag/swap/v1`) met quote → swap flow, retries, en DRY_RUN simulatiemodus. `sellToken()` methode voor TP/SL exits.
- **`src/monitor.ts`** — `PositionMonitor`: bewaakt open posities elke `MONITOR_INTERVAL_MS` via Jupiter Price API v2, triggert take-profit of stop-loss, emit `trade_closed` event bij sluiting.
- **`src/socket-server.ts`** — `BotSocketServer`: Socket.io server op poort 3001. Verwerkt `start_bot`, `stop_bot`, `update_config`, `request_status` events van het dashboard. Broadcast bot-status, DRY_RUN mode en alle bot-events.
- **`src/event-bus.ts`** — Typed EventEmitter die alle modules koppelt. Events: `pool_detected`, `pool_filtered`, `trade_executed`, `trade_closed`, `bot_log`, `balance_update`, `credit_stats`, `dry_run_status`.
- **`src/socket-types.ts`** — Gedeelde TypeScript interfaces voor Socket.io events (gespiegeld in `stb-dashboard/lib/types.ts`).
- **`src/creditTracker.ts`** — `CreditTracker` singleton: telt Helius WebSocket credit-verbruik (bytes, berichten passed/dropped), logt stats elke 10 minuten en emit `credit_stats` event.
- **`blacklist.json`** — 10 bekende malafide deployer-adressen.

#### Optimalisaties
- **Pre-filter Helius credits**: raw WebSocket string gecheckt op `"initialize2"` vóór `JSON.parse`. ~99% van berichten wordt verworpen zonder CPU-kosten.
- **Time-windowed deduplicatie**: `Map<signature, timestamp>` met 30s venster en max 500 entries voorkomt dubbele pool-verwerking.
- **Jupiter Price API v2**: `lite-api.jup.ag/price/v2` voor instapprijs bij `addPosition()`.

#### DRY RUN
- Wallet genereert throwaway keypair als `WALLET_PRIVATE_KEY` ontbreekt.
- Swapper simuleert quote maar verstuurt geen transactie.
- Monitor simuleert P&L op basis van Jupiter prijs.
- Bot logt waarschuwing bij opstart als placeholder key gebruikt wordt.

#### RaydiumListener verbeteringen
- `restart()` methode: sluit bestaande WS-verbinding en herverbindt met nieuwe configuratie uit `process.env`.
- `stop()` roept `creditTracker.flush()` aan voor laatste stats.

---

## Geplande verbeteringen

- [ ] Wallet private key invullen voor live trading
- [ ] Trailing stop-loss implementatie
- [ ] Multi-token position management
- [ ] Metrics dashboard (Prometheus/Grafana)
- [ ] Telegram notificaties bij trades
