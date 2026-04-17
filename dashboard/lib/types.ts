/**
 * Gedeelde Socket.io event-types voor bot ↔ dashboard communicatie.
 * Dit bestand wordt gespiegeld in stb/src/socket-types.ts.
 */

// ── Bot → Dashboard events ────────────────────────────────────────────────────

export interface PoolDetectedEvent {
  timestamp:     number;
  signature:     string;
  ammId:         string;
  tokenMint:     string;
  liquiditySol:  number;
  deployer:      string;
  openTime:      number;
}

export interface PoolFilteredEvent {
  timestamp:   number;
  ammId:       string;
  tokenMint:   string;
  reason:      string;
  /** Categorie voor de pie-chart op de stats-pagina */
  category:    FilterCategory;
}

export type FilterCategory =
  | 'liquidity'
  | 'age'
  | 'honeypot'
  | 'blacklist'
  | 'deployer'
  | 'sol_pair'
  | 'open_time'
  | 'other';

export interface TradeExecutedEvent {
  timestamp:       number;
  signature:       string;
  tokenMint:       string;
  inputSol:        number;
  outputTokens:    string;
  priceImpactPct:  string;
  routeSummary:    string;
  dryRun:          boolean;
  elapsedMs:       number;
}

export interface TradeClosedEvent {
  timestamp:   number;
  tokenMint:   string;
  closeReason: 'take_profit' | 'stop_loss';
  pnlPercent:  number;
  pnlSol:      number;
  durationMs:  number;
}

export interface BotLogEvent {
  timestamp: number;
  level:     'info' | 'warn' | 'error' | 'debug';
  message:   string;
}

export interface BalanceUpdateEvent {
  timestamp:  number;
  balanceSol: number;
}

export interface DryRunStatusEvent {
  timestamp: number;
  dryRun:    boolean;
}

export interface CreditStatsEvent {
  timestamp:       number;
  bytesReceived:   number;
  creditsUsed:     number;
  creditsPerHour:  number;
  creditsPerMonth: number;
  msgTotal:        number;
  msgPassed:       number;
  msgDropped:      number;
  passRatePct:     number;
  savingsPct:      number;
}

export interface BotStatusEvent {
  status:  BotStatus;
  uptime:  number;  // ms
  dryRun:  boolean;
  stats: {
    txSeen:     number;
    init2Found: number;
    parsedOk:   number;
    parseErrors: number;
    duplicates: number;
    poolsFiltered: number;
    tradesExecuted: number;
    tradesClosed: number;
  };
}

export type BotStatus = 'running' | 'stopped' | 'error';

// ── Dashboard → Bot events ────────────────────────────────────────────────────

export interface StartBotEvent {
  dryRun?: boolean;
}

export interface UpdateConfigEvent {
  key:   string;
  value: string;
}

// ── Socket event map (voor TypeScript type-safety) ────────────────────────────

export interface ServerToClientEvents {
  pool_detected:   (data: PoolDetectedEvent)  => void;
  pool_filtered:   (data: PoolFilteredEvent)  => void;
  trade_executed:  (data: TradeExecutedEvent) => void;
  trade_closed:    (data: TradeClosedEvent)   => void;
  bot_log:         (data: BotLogEvent)        => void;
  balance_update:  (data: BalanceUpdateEvent) => void;
  bot_status:      (data: BotStatusEvent)     => void;
  credit_stats:    (data: CreditStatsEvent)   => void;
  dry_run_status:  (data: DryRunStatusEvent)  => void;
}

export interface ClientToServerEvents {
  start_bot:     (data?: StartBotEvent)      => void;
  stop_bot:      ()                          => void;
  update_config: (data: UpdateConfigEvent)   => void;
  request_status: ()                         => void;
}

// ── UI state types ────────────────────────────────────────────────────────────

export interface ActiveTrade {
  tokenMint:      string;
  entryTimestamp: number;
  inputSol:       number;
  outputTokens:   string;
  currentPriceSol: number | null;
  entryPriceSol:  number;
  pnlPercent:     number | null;
  dryRun:         boolean;
}

export interface ClosedTrade extends ActiveTrade {
  closeTimestamp: number;
  closeReason:    'take_profit' | 'stop_loss';
  pnlSol:         number;
  pnlPercent:     number;
  durationMs:     number;
}

export interface DailyPnl {
  date:    string;   // "YYYY-MM-DD"
  pnlSol:  number;
  trades:  number;
}
