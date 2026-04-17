# Solana Sniper Bot

Detecteert nieuwe Raydium AMM v4 liquidity pools via Helius WebSocket en koopt automatisch tokens via Jupiter Aggregator.

## Setup

```bash
cp .env.example .env
# Vul je Helius API key en wallet private key in

npm install
npm run dev
```

## Modules

| Bestand | Functie |
|---|---|
| `config.ts` | Centrale config via `.env` |
| `logger.ts` | Winston logging naar console + bestanden |
| `listener.ts` | Helius WebSocket → Raydium pool detectie |
| `filter.ts` | Filtert pools op liquiditeit en pair-type |
| `wallet.ts` | Keypair beheer en balance checks |
| `swapper.ts` | Jupiter v6 swap uitvoering |
| `monitor.ts` | Take Profit / Stop Loss monitor |
| `index.ts` | Main entry point |

## Belangrijke variabelen (.env)

- `BUY_AMOUNT_SOL` — hoeveel SOL per trade
- `SLIPPAGE_BPS` — max slippage (300 = 3%)
- `PRIORITY_FEE_MICRO_LAMPORTS` — snelheid vs kosten
- `TAKE_PROFIT_PERCENT` / `STOP_LOSS_PERCENT` — exit criteria
- `MIN_LIQUIDITY_SOL` — minimum pool liquiditeit

## Risico-disclaimer

Deze software is uitsluitend bedoeld voor educatieve doeleinden. Trading van crypto-tokens brengt aanzienlijke financiële risico's met zich mee. Gebruik nooit meer dan je bereid bent te verliezen.
