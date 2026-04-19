/**
 * demo-simulator.ts
 *
 * Genereert synthetische pool-events voor demo/DRY RUN modus.
 * Vervangt de RaydiumListener zodat de demo niet afhankelijk is van
 * echte marktactiviteit. Filter-logica wordt gesimuleerd in-memory
 * (geen RPC/API calls) zodat de filter-parameters uit de UI wel effect hebben.
 *
 * Snelheid:
 *   1x  → 1 pool per 15s
 *   5x  → 1 pool per 3s
 *   10x → 1 pool per 1,5s
 */

import { config }    from './config';
import { logger }    from './logger';
import { eventBus }  from './event-bus';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { WSOL_MINT } from './constants';
import type { ListenerStats } from './listener';
import type { FilterCategory } from './socket-types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomBase58(length: number): string {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

// ── Interne pool-structuur voor de simulator ─────────────────────────────────

interface SimPool {
  ammId:                string;
  coinMint:             string;
  pcMint:               string;
  deployer:             string;
  signature:            string;
  detectedAt:           number;
  initPcAmountLamports: bigint;
  openTime:             number;
  /** Gesimuleerd deployer tx-aantal (voor filter zonder RPC) */
  simDeployerTxCount:   number;
  /** Gesimuleerd honeypot resultaat */
  simIsHoneypot:        boolean;
  simHoneypotLossPct:   number;
}

// ── Filter-simulatie (in-memory, geen externe calls) ──────────────────────────

type SimFilterResult =
  | { passed: true }
  | { passed: false; reason: string; category: FilterCategory };

function simulateFilter(pool: SimPool): SimFilterResult {
  const liquiditySol = Number(pool.initPcAmountLamports) / LAMPORTS_PER_SOL;

  if (pool.pcMint !== WSOL_MINT) {
    return { passed: false, reason: 'Geen SOL-pair gevonden', category: 'sol_pair' };
  }

  if (liquiditySol < config.filter.minLiquiditySol) {
    return { passed: false, reason: `Te weinig liquiditeit: ${liquiditySol.toFixed(2)} SOL (min: ${config.filter.minLiquiditySol})`, category: 'liquidity' };
  }

  const ageMs = Date.now() - pool.detectedAt;
  if (ageMs > config.filter.maxTokenAgeMs) {
    return { passed: false, reason: `Token te oud: ${(ageMs / 1000).toFixed(0)}s (max: ${config.filter.maxTokenAgeMs / 1000}s)`, category: 'age' };
  }

  if (pool.openTime > 0) {
    const futureMs = pool.openTime * 1000 - Date.now();
    if (futureMs > config.filter.maxOpenTimeFutureMs) {
      return { passed: false, reason: `Open-time te ver in de toekomst: ${(futureMs / 1000).toFixed(0)}s`, category: 'open_time' };
    }
  }

  if (pool.simDeployerTxCount < config.filter.minDeployerTxCount) {
    return { passed: false, reason: `Deployer heeft te weinig transacties: ${pool.simDeployerTxCount} (min: ${config.filter.minDeployerTxCount})`, category: 'deployer' };
  }

  if (config.filter.honeypotCheckEnabled && pool.simIsHoneypot) {
    return { passed: false, reason: `Honeypot: ${pool.simHoneypotLossPct.toFixed(1)}% verlies gesimuleerd`, category: 'honeypot' };
  }

  return { passed: true };
}

// ── DemoSimulator ─────────────────────────────────────────────────────────────

export class DemoSimulator {
  private genTimer:          NodeJS.Timeout | null = null;
  private positionTimers:    NodeJS.Timeout[]      = [];
  private stopped            = false;

  public readonly stats: ListenerStats = {
    txSeen: 0, init2Found: 0, parsedOk: 0, parseErrors: 0, duplicates: 0,
  };

  constructor(private readonly speed: number = 1) {}

  start(): void {
    this.stopped = false;
    const intervalMs = Math.max(500, Math.round(15_000 / this.speed));
    logger.info(`[Demo] Simulator gestart — ${this.speed}x snelheid, interval ${intervalMs}ms`);

    // Eerste pool direct genereren
    void this.tick();
    this.genTimer = setInterval(() => void this.tick(), intervalMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.genTimer) { clearInterval(this.genTimer); this.genTimer = null; }
    this.positionTimers.forEach((t) => clearTimeout(t));
    this.positionTimers = [];
    logger.info('[Demo] Simulator gestopt.');
  }

  restart(): void {
    this.stop();
    this.stopped = false;
    this.start();
  }

  logStats(): void {
    const { txSeen, parsedOk } = this.stats;
    logger.info(`[Demo] Pools gegenereerd: ${txSeen} | trades: ${parsedOk} | gefilterd: ${txSeen - parsedOk}`);
  }

  // ── Privé ────────────────────────────────────────────────────────────────────

  private async tick(): Promise<void> {
    if (this.stopped) return;

    const pool = this.generatePool();
    this.stats.txSeen++;
    this.stats.init2Found++;

    const liquiditySol = Number(pool.initPcAmountLamports) / LAMPORTS_PER_SOL;

    eventBus.emit('pool_detected', {
      timestamp:    pool.detectedAt,
      signature:    pool.signature,
      ammId:        pool.ammId,
      tokenMint:    pool.coinMint,
      liquiditySol,
      deployer:     pool.deployer,
      openTime:     pool.openTime,
    });

    const filterResult = simulateFilter(pool);

    if (!filterResult.passed) {
      eventBus.emit('pool_filtered', {
        timestamp: Date.now(),
        ammId:     pool.ammId,
        tokenMint: pool.coinMint,
        reason:    filterResult.reason,
        category:  filterResult.category,
      });
      return;
    }

    this.stats.parsedOk++;

    const inputSol     = config.swap.buyAmountSol;
    const outputTokens = String(Math.floor(rand(1_000_000, 1_000_000_000)));

    eventBus.emit('trade_executed', {
      timestamp:      Date.now(),
      signature:      randomBase58(88),
      tokenMint:      pool.coinMint,
      inputSol,
      outputTokens,
      priceImpactPct: rand(0.1, 3).toFixed(3),
      routeSummary:   'WSOL → TOKEN via Raydium AMM v4 (SIM)',
      dryRun:         true,
      elapsedMs:      Math.floor(rand(200, 900)),
    });

    // Sluit positie na gesimuleerde hold-tijd
    const baseHoldMs = rand(8_000, 45_000);
    const holdMs     = Math.max(500, baseHoldMs / this.speed);

    const t = setTimeout(() => {
      if (!this.stopped) this.closePosition(pool.coinMint, inputSol, holdMs * this.speed);
    }, holdMs);
    this.positionTimers.push(t);
  }

  private closePosition(tokenMint: string, inputSol: number, durationMs: number): void {
    // 38% TP, 62% SL — realistisch voor nieuwe token sniping
    const isTP = Math.random() < 0.38;

    const pnlPercent = isTP
      ? rand(config.tpsl.takeProfitPercent * 0.85, config.tpsl.takeProfitPercent * 1.2)
      : -rand(config.tpsl.stopLossPercent * 0.7, config.tpsl.stopLossPercent * 1.1);

    eventBus.emit('trade_closed', {
      timestamp:   Date.now(),
      tokenMint,
      closeReason: isTP ? 'take_profit' : 'stop_loss',
      pnlPercent,
      pnlSol:      inputSol * (pnlPercent / 100),
      durationMs,
    });
  }

  /**
   * Genereert een synthetische pool met gerandomiseerde eigenschappen.
   * Verdeling zodat filter-parameters effect hebben op het percentage trades:
   *   ~25% faalt liquiditeit
   *   ~15% faalt age
   *   ~10% faalt deployer tx count
   *   ~8%  faalt honeypot
   *   ~5%  geen SOL-pair
   *   ~37% passeert alles → trade
   */
  private generatePool(): SimPool {
    const r = Math.random();

    // Basis: alles passeert
    let liquiditySol        = rand(config.filter.minLiquiditySol * 1.2, config.filter.minLiquiditySol * 10);
    let pcMint              = WSOL_MINT;
    let ageTooOld           = false;
    let simDeployerTxCount  = Math.floor(rand(config.filter.minDeployerTxCount, config.filter.minDeployerTxCount * 5));
    let simIsHoneypot       = false;
    let simHoneypotLossPct  = 0;

    if (r < 0.25) {
      // Fail: liquiditeit te laag
      liquiditySol = rand(0.1, config.filter.minLiquiditySol * 0.95);
    } else if (r < 0.40) {
      // Fail: token te oud
      ageTooOld = true;
    } else if (r < 0.50) {
      // Fail: deployer te weinig transacties
      simDeployerTxCount = Math.floor(rand(0, Math.max(1, config.filter.minDeployerTxCount - 1)));
    } else if (r < 0.58) {
      // Fail: honeypot
      simIsHoneypot      = true;
      simHoneypotLossPct = rand(config.filter.honeypotMaxLossPct + 1, 60);
    } else if (r < 0.63) {
      // Fail: geen SOL-pair
      pcMint = randomBase58(44);
    }
    // else: passeert alles

    const detectedAt = ageTooOld
      ? Date.now() - config.filter.maxTokenAgeMs * rand(1.1, 2)
      : Date.now() - rand(0, config.filter.maxTokenAgeMs * 0.6);

    return {
      ammId:                randomBase58(44),
      coinMint:             randomBase58(44),
      pcMint,
      deployer:             randomBase58(44),
      signature:            randomBase58(88),
      detectedAt,
      initPcAmountLamports: BigInt(Math.floor(liquiditySol * LAMPORTS_PER_SOL)),
      openTime:             0,
      simDeployerTxCount,
      simIsHoneypot,
      simHoneypotLossPct,
    };
  }
}
