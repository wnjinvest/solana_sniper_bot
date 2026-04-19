/**
 * socket-types.ts
 *
 * Gedeelde Socket.io event-types voor bot ↔ dashboard communicatie.
 * Gespiegeld van stb-dashboard/lib/types.ts — houd beide synchroon.
 */

export type FilterCategory =
  | 'liquidity'
  | 'age'
  | 'honeypot'
  | 'blacklist'
  | 'deployer'
  | 'sol_pair'
  | 'open_time'
  | 'other';

// ── Bot → Dashboard ───────────────────────────────────────────────────────────

export interface PoolDetectedEvent {
  timestamp:    number;
  signature:    string;
  ammId:        string;
  tokenMint:    string;
  liquiditySol: number;
  deployer:     string;
  openTime:     number;
}

export interface PoolFilteredEvent {
  timestamp: number;
  ammId:     string;
  tokenMint: string;
  reason:    string;
  category:  FilterCategory;
}

export interface TradeExecutedEvent {
  timestamp:      number;
  signature:      string;
  tokenMint:      string;
  inputSol:       number;
  outputTokens:   string;
  priceImpactPct: string;
  routeSummary:   string;
  dryRun:         boolean;
  elapsedMs:      number;
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

export interface WalletInfoEvent {
  address: string;
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

export type BotStatus = 'running' | 'stopped' | 'error';

export interface BotStatusEvent {
  status: BotStatus;
  uptime: number;
  dryRun: boolean;
  stats: {
    txSeen:         number;
    init2Found:     number;
    parsedOk:       number;
    parseErrors:    number;
    duplicates:     number;
    poolsFiltered:  number;
    tradesExecuted: number;
    tradesClosed:   number;
  };
}

// ── Dashboard → Bot ───────────────────────────────────────────────────────────

export interface StartBotEvent {
  dryRun?:    boolean;
  /** Demo-simulatie snelheid: 1 | 5 | 10. Indien ingesteld wordt DemoSimulator gebruikt i.p.v. RaydiumListener. */
  demoSpeed?: number;
}

export interface UpdateConfigEvent {
  key:   string;
  value: string;
}

// ── Socket event-maps ─────────────────────────────────────────────────────────

export interface ServerToClientEvents {
  pool_detected:  (data: PoolDetectedEvent)  => void;
  pool_filtered:  (data: PoolFilteredEvent)  => void;
  trade_executed: (data: TradeExecutedEvent) => void;
  trade_closed:   (data: TradeClosedEvent)   => void;
  bot_log:        (data: BotLogEvent)        => void;
  balance_update: (data: BalanceUpdateEvent) => void;
  bot_status:     (data: BotStatusEvent)     => void;
  credit_stats:    (data: CreditStatsEvent)   => void;
  dry_run_status:  (data: DryRunStatusEvent)  => void;
  config_data:     (data: Record<string, string>) => void;
}

export interface ClientToServerEvents {
  start_bot:      (data?: StartBotEvent)    => void;
  stop_bot:       ()                        => void;
  update_config:  (data: UpdateConfigEvent) => void;
  request_status: ()                        => void;
  get_config:     ()                        => void;
}
