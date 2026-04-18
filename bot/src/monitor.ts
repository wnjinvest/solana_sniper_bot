/**
 * monitor.ts
 *
 * Take Profit / Stop Loss monitor.
 * Checkt op een interval de huidige tokenprijs via Jupiter's price API
 * en voert een sell-swap uit als de TP of SL drempel bereikt is.
 */

import { config } from './config';
import { logger } from './logger';
import { eventBus } from './event-bus';
import type { Swapper } from './swapper';

export interface Position {
  tokenMint:       string;
  buyPriceSol:     number; // prijs per token op moment van koop (in SOL)
  tokenAmount:     bigint; // aantal gekochte tokens (in kleinste eenheden)
  inputSol:        number; // hoeveel SOL besteed bij aankoop
  entryTimestamp:  number;
}

export class PositionMonitor {
  private positions = new Map<string, Position>();
  private timer:     NodeJS.Timeout | null = null;

  constructor(private readonly swapper: Swapper) {}

  /** Voeg een nieuwe positie toe aan de monitor */
  addPosition(position: Position): void {
    this.positions.set(position.tokenMint, position);
    logger.info(
      `[Monitor] Positie toegevoegd: ${position.tokenMint} | koopprijs: ${position.buyPriceSol} SOL`
    );

    // Start de timer als hij nog niet loopt
    if (!this.timer) {
      this.startMonitoring();
    }
  }

  /** Start de periodieke prijs-check */
  startMonitoring(): void {
    logger.info(`[Monitor] Start monitoring (interval: ${config.tpsl.monitorIntervalMs}ms)`);

    this.timer = setInterval(() => {
      this.checkAllPositions().catch((err) => {
        logger.error('[Monitor] Fout bij check positions:', err);
      });
    }, config.tpsl.monitorIntervalMs);
  }

  /** Stop de monitor */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('[Monitor] Gestopt.');
  }

  // ── Privé ───────────────────────────────────────────────────────────────────

  private async checkAllPositions(): Promise<void> {
    for (const [mint, position] of this.positions) {
      await this.checkPosition(mint, position);
    }
  }

  private async checkPosition(mint: string, position: Position): Promise<void> {
    try {
      const currentPriceSol = await this.fetchPriceSol(mint);
      if (currentPriceSol === null) return;

      // Sla over als de instapprijs nog niet is ingevuld (vermijd NaN)
      if (position.buyPriceSol === 0) {
        logger.debug(`[Monitor] ${mint} | buyPriceSol=0, sla P&L check over`);
        return;
      }

      const pnlPercent =
        ((currentPriceSol - position.buyPriceSol) / position.buyPriceSol) * 100;

      logger.debug(
        `[Monitor] ${mint} | prijs: ${currentPriceSol.toFixed(8)} SOL | P&L: ${pnlPercent.toFixed(2)}%`
      );

      if (pnlPercent >= config.tpsl.takeProfitPercent) {
        logger.info(
          `[Monitor] TAKE PROFIT geraakt voor ${mint} (+${pnlPercent.toFixed(2)}%). Verkopen...`
        );
        await this.closePosition(mint, position, 'take_profit', pnlPercent);

      } else if (pnlPercent <= -config.tpsl.stopLossPercent) {
        logger.info(
          `[Monitor] STOP LOSS geraakt voor ${mint} (${pnlPercent.toFixed(2)}%). Verkopen...`
        );
        await this.closePosition(mint, position, 'stop_loss', pnlPercent);
      }

    } catch (error) {
      logger.error(`[Monitor] Fout bij checken positie ${mint}:`, error);
    }
  }

  private async closePosition(
    mint:       string,
    position:   Position,
    reason:     'take_profit' | 'stop_loss',
    pnlPercent: number,
  ): Promise<void> {
    // Verwijder positie direct om dubbele sells te voorkomen
    this.positions.delete(mint);

    const durationMs = Date.now() - position.entryTimestamp;
    const pnlSol     = position.inputSol * (pnlPercent / 100);

    // ── Voer echte verkoop uit ──────────────────────────────────────────────
    const result = await this.swapper.sellToken(mint, position.tokenAmount);

    if (result.success) {
      logger.info(
        `[Monitor] Positie gesloten (${reason}): ${mint} | ` +
        `P&L: ${pnlPercent.toFixed(2)}% / ${pnlSol.toFixed(4)} SOL | ` +
        `duur: ${(durationMs / 1000).toFixed(1)}s`
      );
    } else {
      logger.error(
        `[Monitor] Verkoop mislukt voor ${mint}: ${result.error ?? 'onbekende fout'}`
      );
    }

    // ── Emit trade_closed naar dashboard ────────────────────────────────────
    eventBus.emit('trade_closed', {
      timestamp:   Date.now(),
      tokenMint:   mint,
      closeReason: reason,
      pnlPercent,
      pnlSol,
      durationMs,
    });

    // Stop timer als er geen posities meer zijn
    if (this.positions.size === 0) {
      this.stop();
    }
  }

  /**
   * Haal de huidige prijs op via Jupiter's price API v2, met retry-logica.
   * Geeft de prijs in SOL per token terug, of null na alle pogingen.
   */
  private async fetchPriceSol(mint: string): Promise<number | null> {
    const MAX_RETRIES    = 3;
    const RETRY_DELAY_MS = 1_000;
    const WSOL = 'So11111111111111111111111111111111111111112';
    const url  = `https://lite-api.jup.ag/price/v2?ids=${mint}&vsToken=${WSOL}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });

        if (!res.ok) {
          if (attempt < MAX_RETRIES) { await sleep(RETRY_DELAY_MS); continue; }
          break;
        }

        const json = await res.json() as {
          data?: Record<string, { price?: string }>;
        };

        const priceStr = json.data?.[mint]?.price;
        if (!priceStr) return null;

        const price = parseFloat(priceStr);
        return isFinite(price) && price > 0 ? price : null;

      } catch {
        if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
      }
    }

    logger.warn(`[Monitor] Prijs niet beschikbaar voor ${mint.slice(0, 8)}... na ${MAX_RETRIES} pogingen — TP/SL check overgeslagen`);
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
