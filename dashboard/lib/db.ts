/**
 * SQLite persistence layer voor gesloten trades.
 * Database bestand: dashboard/data/trades.db (auto-aangemaakt).
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH  = path.join(DATA_DIR, 'trades.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tokenMint       TEXT    NOT NULL,
    entryTimestamp  INTEGER NOT NULL,
    closeTimestamp  INTEGER NOT NULL,
    closeReason     TEXT    NOT NULL,
    inputSol        REAL    NOT NULL,
    outputTokens    TEXT    NOT NULL,
    entryPriceSol   REAL    NOT NULL,
    pnlPercent      REAL    NOT NULL,
    pnlSol          REAL    NOT NULL,
    durationMs      INTEGER NOT NULL,
    dryRun          INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_close ON trades (closeTimestamp DESC);
`);

export interface DbTrade {
  id:             number;
  tokenMint:      string;
  entryTimestamp: number;
  closeTimestamp: number;
  closeReason:    'take_profit' | 'stop_loss';
  inputSol:       number;
  outputTokens:   string;
  entryPriceSol:  number;
  pnlPercent:     number;
  pnlSol:         number;
  durationMs:     number;
  dryRun:         boolean;
}

const insertStmt = db.prepare<Omit<DbTrade, 'id' | 'dryRun'> & { dryRun: 0 | 1 }>(`
  INSERT OR IGNORE INTO trades
    (tokenMint, entryTimestamp, closeTimestamp, closeReason, inputSol, outputTokens,
     entryPriceSol, pnlPercent, pnlSol, durationMs, dryRun)
  VALUES
    (@tokenMint, @entryTimestamp, @closeTimestamp, @closeReason, @inputSol, @outputTokens,
     @entryPriceSol, @pnlPercent, @pnlSol, @durationMs, @dryRun)
`);

const selectStmt = db.prepare<[number], DbTrade & { dryRun: 0 | 1 }>(
  'SELECT * FROM trades ORDER BY closeTimestamp DESC LIMIT ?'
);

export function saveTrade(trade: Omit<DbTrade, 'id'>): void {
  insertStmt.run({ ...trade, dryRun: trade.dryRun ? 1 : 0 });
}

export function loadTrades(limit = 500): DbTrade[] {
  return selectStmt.all(limit).map((row) => ({ ...row, dryRun: row.dryRun === 1 }));
}
