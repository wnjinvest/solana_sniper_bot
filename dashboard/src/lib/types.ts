export * from './socket-types';

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
  durationMs:     number;
}
