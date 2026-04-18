/**
 * types.ts
 *
 * Gedeelde socket-event types worden geïmporteerd uit socket-types.ts,
 * dat gesynchroniseerd wordt vanuit bot/src/socket-types.ts via:
 *   bash scripts/sync-types.sh
 *
 * Dit bestand bevat alleen dashboard-specifieke UI state types.
 */

export * from './socket-types';

// ── UI state types ────────────────────────────────────────────────────────────

export interface ActiveTrade {
  tokenMint:       string;
  entryTimestamp:  number;
  inputSol:        number;
  outputTokens:    string;
  currentPriceSol: number | null;
  entryPriceSol:   number;
  pnlPercent:      number | null;
  dryRun:          boolean;
}

export interface ClosedTrade extends ActiveTrade {
  closeTimestamp: number;
  closeReason:    'take_profit' | 'stop_loss';
  pnlSol:         number;
  pnlPercent:     number;
  durationMs:     number;
}

export interface DailyPnl {
  date:   string;   // "YYYY-MM-DD"
  pnlSol: number;
  trades: number;
}
