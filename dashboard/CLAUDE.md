# Dashboard — SOL Sniper Dashboard

## Stack
- Next.js 16 App Router + TypeScript
- **Tailwind CSS v3** (NIET v4 — globals.css gebruikt `@tailwind` directives + HSL vars)
- shadcn/ui components (via `@base-ui/react`)
- Socket.io client → bot op poort 3001

## Pagina's (app/)
| Route | Bestand | Doel |
|---|---|---|
| `/live` | `app/live/page.tsx` | Real-time bot monitor |
| `/demo` | `app/demo/page.tsx` | DRY RUN simulatie met sliders |
| `/settings` | `app/settings/page.tsx` | .env lezen/schrijven |
| `/stats` | `app/stats/page.tsx` | Filter breakdown + trades |

## Kritieke constraints

### Tailwind
- `globals.css` gebruikt `@tailwind base/components/utilities` — GEEN `@import "shadcn/tailwind.css"`
- Dark mode via `.dark {}` CSS variabelen in HSL formaat: `hsl(var(--background))`
- `tailwind.config.ts`: `darkMode: 'class'`

### Componenten
- Alle componenten die hooks gebruiken hebben `'use client'` nodig bovenaan
- `components/ui/button.tsx` heeft `'use client'` — verwijder dit niet (hydration fix)
- Theme: GEEN `next-themes` — `ThemeToggle` gebruikt `localStorage` + `classList` direct

### Socket.io
- Singleton in `lib/socket.ts` — gebruik altijd `getSocket()`, nooit `new io()`
- Centrale state in `hooks/use-bot-socket.ts` — voeg nieuwe events hier toe
- Typed events in `lib/types.ts` — gespiegeld vanuit `bot/src/socket-types.ts`

### npm install
```bash
npm install --legacy-peer-deps   # altijd --legacy-peer-deps
```

### API routes
- `app/api/settings/route.ts` — GET leest `/opt/claude/solana-sniper-bot/bot/.env`, POST schrijft terug
- Key validatie: `/^[A-Z0-9_]+$/`

## TypeScript check
```bash
npx tsc --noEmit
```

## Veelgemaakte fouten
- Slider onChange vergeten (gebruik `onChange`, NIET `onInput` — React synthetic events)
- Socket event toevoegen in `lib/types.ts` maar vergeten in `hooks/use-bot-socket.ts`
- `<script>` tags in `<html>` of buiten `<body>` → Next.js App Router error
