# Solana Sniper Bot

Real-time Raydium AMM v4 pool sniper met Next.js dashboard.

```
solana-sniper-bot/
  bot/        Node.js bot — Helius WebSocket + Jupiter swaps
  dashboard/  Next.js dashboard — live monitor, demo, settings
```

## Vereisten

- Node.js 18+
- Helius API key (gratis op helius.dev)
- Solana wallet met SOL (of DRY_RUN=true voor simulatie)

## Installatie

```bash
# Bot
cd bot
npm install
cp .env.example .env   # vul je keys in
npm run dev

# Dashboard (apart terminalvenster)
cd dashboard
npm install
npm run dev            # opent op http://localhost:3000
```

## Configuratie

Kopieer `bot/.env.example` naar `bot/.env` en vul in:

| Variabele | Beschrijving |
|---|---|
| `HELIUS_API_KEY` | Helius API key |
| `WALLET_PRIVATE_KEY` | Base58 private key van je Solana wallet |
| `DRY_RUN` | `true` = simulatiemodus, geen echte transacties |
| `BUY_AMOUNT_SOL` | SOL per trade (bijv. `0.01`) |
| `TAKE_PROFIT_PERCENT` | Take profit drempel (bijv. `50`) |
| `STOP_LOSS_PERCENT` | Stop loss drempel (bijv. `20`) |

## Architectuur

```
Helius WebSocket
  └─ RaydiumListener     detecteert initialize2 pool-creaties
       └─ PoolFilter      liquidity / age / honeypot / blacklist checks
            └─ Swapper    Jupiter v6 koop via lite-api.jup.ag
                 └─ PositionMonitor   TP/SL bewaking via Jupiter Price API
                      └─ Socket.io →  Dashboard (poort 3001)
```

## DRY RUN modus

Zet `DRY_RUN=true` in `.env`. De bot:
- Genereert een tijdelijk keypair (geen echte wallet nodig)
- Simuleert swaps via Jupiter quote zonder transactie te versturen
- Toont gesimuleerde P&L in het dashboard

## Licentie

MIT
