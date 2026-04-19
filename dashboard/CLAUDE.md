# Dashboard — SOL Sniper Dashboard

## Stack
- **Vite + React 19 + TypeScript**
- React Router v6 (client-side routing)
- **Tailwind CSS v3** (`src/index.css` gebruikt `@tailwind` directives + HSL vars)
- shadcn-style components in `src/components/ui/` (geen 'use client')
- Socket.io client → bot op poort 3001

## Pagina's (src/pages/)
| Route | Bestand | Doel |
|---|---|---|
| `/live` | `LivePage.tsx` | Real-time bot monitor |
| `/demo` | `DemoPage.tsx` | DRY RUN simulatie met sliders |
| `/stats` | `StatsPage.tsx` | Filter breakdown + trades |
| `/settings` | `SettingsPage.tsx` | Config via socket get_config/update_config |

## Services starten
```bash
cd dashboard && npm run dev   # poort 3000
```

## Kritieke constraints

### Tailwind
- `src/index.css` gebruikt `@tailwind base/components/utilities`
- Dark mode via `.dark {}` CSS variabelen in HSL formaat: `hsl(var(--background))`
- `tailwind.config.ts`: `darkMode: 'class'`, content: `["./index.html", "./src/**/*.{js,ts,jsx,tsx}"]`

### Routing
- `src/App.tsx` gebruikt `BrowserRouter` + `Routes` van react-router-dom
- `src/components/dashboard/nav.tsx` gebruikt `Link`/`useLocation` van react-router-dom

### Socket.io
- Singleton in `src/lib/socket.ts` — gebruik altijd `getSocket()`, nooit `new io()`
- Centrale state in `src/hooks/use-bot-socket.ts` — voeg nieuwe events hier toe
- Typed events in `src/lib/socket-types.ts` — gespiegeld vanuit `bot/src/socket-types.ts`

### Settings
- Geen API routes — settings worden geladen via `get_config` socket event
- Bot stuurt `config_data` terug met alle process.env values
- Opslaan via `update_config` socket event

### Vite proxy (price API)
- `/api/price` → `https://lite-api.jup.ag/price/v2` (geconfigureerd in `vite.config.ts`)

### npm install
```bash
npm install --legacy-peer-deps   # altijd --legacy-peer-deps
```

## TypeScript check
```bash
npx tsc --noEmit
```

## Veelgemaakte fouten
- Socket event toevoegen in `src/lib/socket-types.ts` maar vergeten in `src/hooks/use-bot-socket.ts`
- Ook `bot/src/socket-types.ts` updaten bij nieuw event (beide synchroon houden)
