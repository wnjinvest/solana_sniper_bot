# Bot — Solana Sniper Bot

## Stack
- Node.js 18 + TypeScript (`ts-node` direct, geen build stap)
- Helius WebSocket (`wss://mainnet.helius-rpc.com`)
- Jupiter Aggregator v6 — gebruik altijd `lite-api.jup.ag`, NIET `quote-api.jup.ag` (DNS onbereikbaar)
- Socket.io server op poort 3001
- `@solana/web3.js` voor wallet/keypair

## Modules (src/)
| Bestand | Verantwoordelijkheid |
|---|---|
| `index.ts` | Entry point, start volgorde, pool callback |
| `config.ts` | Type-safe .env loader — lees hier welke keys bestaan |
| `listener.ts` | Helius WebSocket, Raydium initialize2 detectie, reconnect |
| `filter.ts` | Pool evaluatie: liquiditeit, leeftijd, honeypot, blacklist, deployer |
| `swapper.ts` | Jupiter quote + swap, buyToken(), sellToken() |
| `monitor.ts` | TP/SL bewaking via Jupiter Price API v2 |
| `wallet.ts` | Keypair laden, DRY_RUN throwaway keypair, balance |
| `socket-server.ts` | Socket.io server, event forwarding naar dashboard |
| `event-bus.ts` | Typed EventEmitter tussen modules |
| `creditTracker.ts` | Helius credit gebruik bijhouden |
| `socket-types.ts` | Gedeelde Socket.io event interfaces |

## Kritieke constraints
- **Jupiter API**: gebruik `https://lite-api.jup.ag/swap/v1` en `https://lite-api.jup.ag/price/v2`
- **Bot start NIET automatisch** — wacht op `start_bot` socket event van dashboard
- **DRY_RUN=true** → throwaway keypair, geen echte transacties
- `WALLET_PRIVATE_KEY=your_base58_private_key_here` → bot waarschuwt en gebruikt throwaway keypair

## Event flow
```
Helius WS → listener → filter → swapper → monitor
                ↓          ↓        ↓         ↓
             eventBus → socket-server → dashboard
```

## TypeScript check
```bash
npx tsc --noEmit
```

## Veelgemaakte fouten
- Vergeten beide `socket-types.ts` én `dashboard/lib/types.ts` te updaten bij nieuw event
- `config` object wordt geladen bij startup — `process.env` changes via `update_config` gelden pas bij `restart()`
- `RaydiumListener.restart()` sluit WS en herverbindt met huidige `process.env`
