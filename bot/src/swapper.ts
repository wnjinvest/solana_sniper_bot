/**
 * swapper.ts
 *
 * Voert SOL → token swaps uit via Jupiter Aggregator v6.
 *
 * DRY_RUN=true  → haalt een echte quote op maar ondertekent/stuurt NIETS
 * DRY_RUN=false → echte on-chain transactie met retry-logica
 *
 * Uitvoeringstijden worden gelogd op elke stap zodat latency-knelpunten
 * zichtbaar zijn (cruciaal voor sniper-optimalisatie).
 *
 * Retry-strategie:
 *  - Gooit een Error (netwerk/timeout/build-fout) → retry
 *  - Retourneert SwapResult met success=false en een signature → NIET retrien
 *    (de tx is al op chain geland en gefaald; opnieuw sturen helpt niet)
 */

import {
  Connection,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { config } from './config';
import { logger } from './logger';
import { WSOL_MINT } from './constants';
import type { WalletManager } from './wallet';

// ── Constanten ────────────────────────────────────────────────────────────────

/** Timeout voor Jupiter API-calls (ms) */
const JUPITER_API_TIMEOUT_MS = 5_000;

/** Timeout voor wachten op transactie-confirmatie (ms) */
const CONFIRM_TIMEOUT_MS = 30_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SwapResult {
  success:          boolean;
  /** true wanneer DRY_RUN=true — er is GEEN echte transactie uitgevoerd */
  dryRun?:          boolean;
  signature?:       string;
  inputAmountSol:   number;
  /** Tokens ontvangen (in kleinste eenheden, als string vanwege bigint) */
  outputAmount?:    string;
  priceImpactPct?:  string;
  /** Beschrijving van de Jupiter-route (bijv. "WSOL → BONK via Raydium") */
  routeSummary?:    string;
  /** Totale uitvoeringstijd in ms */
  elapsedMs?:       number;
  error?:           string;
  /** Pogingnummer waarop succes behaald werd */
  attempt?:         number;
}

// ── Swapper ───────────────────────────────────────────────────────────────────

export class Swapper {
  private readonly connection:    Connection;
  private readonly jupiterApiUrl: string;

  constructor(private readonly wallet: WalletManager) {
    this.connection    = new Connection(config.helius.rpcUrl, 'confirmed');
    this.jupiterApiUrl = config.jupiter.apiUrl;
  }

  /**
   * Koop outputMint met SOL.
   * In DRY_RUN-modus wordt alleen een quote opgehaald, geen tx verstuurd.
   *
   * @param outputMint  Mint-adres van de te kopen token
   * @param amountSol   Hoeveel SOL te besteden (default: config.swap.buyAmountSol)
   */
  async buyToken(
    outputMint: string,
    amountSol:  number = config.swap.buyAmountSol
  ): Promise<SwapResult> {
    const t0             = Date.now();
    const amountLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

    // ── DRY RUN ───────────────────────────────────────────────────────────────
    if (config.dryRun) {
      return this.executeDryRun(outputMint, amountSol, amountLamports, t0);
    }

    // ── LIVE — retry-lus ──────────────────────────────────────────────────────
    const maxRetries = config.swap.maxRetries;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(
        `[Swapper] Poging ${attempt}/${maxRetries}: ` +
        `${amountSol} SOL → ${outputMint.slice(0, 8)}...`
      );

      try {
        const result = await this.attemptBuy(outputMint, amountLamports, amountSol, attempt);

        result.elapsedMs = Date.now() - t0;

        if (result.success) {
          logger.info(`[Swapper] Geslaagd in ${result.elapsedMs}ms (poging ${attempt})`);
          return result;
        }

        // On-chain failure (signature aanwezig) → niet retrien
        logger.error(
          `[Swapper] On-chain fout: ${result.error} | sig: ${result.signature}`
        );
        result.attempt = attempt;
        return result;

      } catch (err) {
        // Netwerk/timeout/bouw-fout → retry
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`[Swapper] Poging ${attempt} mislukt: ${msg}`);

        if (attempt < maxRetries) {
          logger.info(`[Swapper] Wacht ${config.swap.retryDelayMs}ms...`);
          await sleep(config.swap.retryDelayMs);
        }
      }
    }

    return {
      success:        false,
      inputAmountSol: amountSol,
      elapsedMs:      Date.now() - t0,
      error:          `Alle ${maxRetries} pogingen mislukt`,
    };
  }

  /**
   * Verkoop tokens voor SOL.
   * In DRY_RUN-modus wordt alleen gesimuleerd, geen tx verstuurd.
   *
   * @param inputMint    Mint-adres van de te verkopen token
   * @param tokenAmount  Hoeveelheid tokens in kleinste eenheden (bigint)
   */
  async sellToken(
    inputMint:   string,
    tokenAmount: bigint,
  ): Promise<SwapResult> {
    const t0       = Date.now();
    const amountRaw = String(tokenAmount);

    if (config.dryRun) {
      logger.info(`[Swapper] DRY RUN — verkoop ${amountRaw} tokens van ${inputMint.slice(0, 8)}... (gesimuleerd)`);
      return {
        success:        true,
        dryRun:         true,
        inputAmountSol: 0,
        outputAmount:   '0',
        elapsedMs:      Date.now() - t0,
      };
    }

    const maxRetries = config.swap.maxRetries;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(
        `[Swapper] Verkoop poging ${attempt}/${maxRetries}: ` +
        `${amountRaw} ${inputMint.slice(0, 8)}... → SOL`
      );

      try {
        const result = await this.attemptSell(inputMint, amountRaw, attempt);

        result.elapsedMs = Date.now() - t0;

        if (result.success) {
          logger.info(`[Swapper] Verkoop geslaagd in ${result.elapsedMs}ms (poging ${attempt})`);
          return result;
        }

        logger.error(
          `[Swapper] Verkoop on-chain fout: ${result.error} | sig: ${result.signature}`
        );
        result.attempt = attempt;
        return result;

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`[Swapper] Verkoop poging ${attempt} mislukt: ${msg}`);

        if (attempt < maxRetries) {
          await sleep(config.swap.retryDelayMs);
        }
      }
    }

    return {
      success:        false,
      inputAmountSol: 0,
      elapsedMs:      Date.now() - t0,
      error:          `Alle ${maxRetries} verkoop-pogingen mislukt`,
    };
  }

  // ── Privé: DRY RUN ──────────────────────────────────────────────────────────

  private async executeDryRun(
    outputMint:      string,
    amountSol:       number,
    amountLamports:  number,
    t0:              number
  ): Promise<SwapResult> {
    logger.info(`[Swapper] ════════════════════════════════════`);
    logger.info(`[Swapper] 🔵  DRY RUN — geen echte transactie`);
    logger.info(`[Swapper] ════════════════════════════════════`);
    logger.info(`[Swapper] Input : ${amountSol} SOL (${amountLamports} lamports)`);
    logger.info(`[Swapper] Output: ${outputMint}`);

    const tQuote = Date.now();
    const quote  = await this.getQuote(WSOL_MINT, outputMint, amountLamports);

    if (!quote) {
      logger.warn('[Swapper] DRY RUN — Geen route beschikbaar via Jupiter voor dit token.');
      return {
        success:        false,
        dryRun:         true,
        inputAmountSol: amountSol,
        elapsedMs:      Date.now() - t0,
        error:          'Geen Jupiter-route beschikbaar',
      };
    }

    logger.info(`[Swapper] Quote opgehaald in ${Date.now() - tQuote}ms`);
    logger.info(`[Swapper] ─────────────────────────────────────`);

    // Quote-details loggen
    const outAmount      = String(quote.outAmount ?? '0');
    const priceImpact    = String(quote.priceImpactPct ?? '?');
    const routeSummary   = buildRouteSummary(quote);
    const inAmountActual = Number(quote.inAmount ?? amountLamports) / LAMPORTS_PER_SOL;

    logger.info(`[Swapper] Ontvangen tokens   : ${outAmount}`);
    logger.info(`[Swapper] Price impact        : ${Number(priceImpact).toFixed(4)}%`);
    logger.info(`[Swapper] Effectief ingezet   : ${inAmountActual.toFixed(6)} SOL`);
    logger.info(`[Swapper] Slippage (bps)      : ${config.swap.slippageBps}`);
    logger.info(`[Swapper] Priority fee        : ${config.swap.priorityFeeMicroLamports} µLamports`);
    logger.info(`[Swapper] Route               : ${routeSummary}`);
    logger.info(`[Swapper] ─────────────────────────────────────`);
    logger.info(`[Swapper] ✓ DRY RUN voltooid — geen transactie verstuurd`);
    logger.info(`[Swapper] Totale tijd         : ${Date.now() - t0}ms`);
    logger.info(`[Swapper] ════════════════════════════════════`);

    return {
      success:        true,
      dryRun:         true,
      inputAmountSol: amountSol,
      outputAmount:   outAmount,
      priceImpactPct: priceImpact,
      routeSummary,
      elapsedMs:      Date.now() - t0,
    };
  }

  // ── Privé: één swap-poging ──────────────────────────────────────────────────

  /**
   * Eén volledige swap-poging. Gooit een Error bij herstelbare fouten
   * (netwerk, timeout, bouw-probleem). Retourneert SwapResult met
   * success=false als de transactie on-chain is gefaald.
   */
  private async attemptBuy(
    outputMint:      string,
    amountLamports:  number,
    amountSol:       number,
    attempt:         number
  ): Promise<SwapResult> {
    const t = { start: Date.now(), quote: 0, build: 0, send: 0 };

    // ── 1. Verse blockhash ophalen ────────────────────────────────────────────
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash('confirmed');

    // ── 2. Jupiter-quote ──────────────────────────────────────────────────────
    t.quote = Date.now();
    const quote = await this.getQuote(WSOL_MINT, outputMint, amountLamports);
    if (!quote) throw new Error('Geen Jupiter-quote beschikbaar');
    logger.debug(`[Swapper] Quote: ${Date.now() - t.quote}ms | out: ${quote.outAmount}`);

    // ── 3. Swap-transactie bouwen ─────────────────────────────────────────────
    t.build = Date.now();
    const tx = await this.buildSwapTransaction(quote);
    if (!tx) throw new Error('Kon swap-transactie niet bouwen via Jupiter /swap');
    logger.debug(`[Swapper] Build: ${Date.now() - t.build}ms`);

    // ── 4. Ondertekenen ───────────────────────────────────────────────────────
    tx.sign([this.wallet.keypair]);

    // ── 5. Versturen (skipPreflight voor maximale snelheid) ───────────────────
    t.send = Date.now();
    const signature = await this.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,   // Preflight kost ~200ms, overgeslagen voor snelheid
      maxRetries:    0,      // Wij beheren retries zelf
    });
    logger.info(`[Swapper] Verstuurd: ${signature} (${Date.now() - t.send}ms)`);

    // ── 6. Wachten op confirmatie ─────────────────────────────────────────────
    const confirmation = await Promise.race([
      this.connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      ),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Confirmatie timeout na ${CONFIRM_TIMEOUT_MS}ms | sig: ${signature}`)),
          CONFIRM_TIMEOUT_MS
        )
      ),
    ]);

    if (confirmation.value.err) {
      // On-chain failure — returen met signature zodat caller NIET retryt
      return {
        success:        false,
        signature,
        inputAmountSol: amountSol,
        attempt,
        error:          `On-chain fout: ${JSON.stringify(confirmation.value.err)}`,
      };
    }

    logger.info(
      `[Swapper] Bevestigd! | sig: ${signature} | ` +
      `output: ${quote.outAmount} | impact: ${quote.priceImpactPct}% | ` +
      `totaal: ${Date.now() - t.start}ms`
    );

    return {
      success:        true,
      signature,
      inputAmountSol: amountSol,
      outputAmount:   String(quote.outAmount ?? ''),
      priceImpactPct: String(quote.priceImpactPct ?? ''),
      routeSummary:   buildRouteSummary(quote),
      attempt,
    };
  }

  // ── Privé: één verkoop-poging ──────────────────────────────────────────────

  private async attemptSell(
    inputMint:  string,
    amountRaw:  string,
    attempt:    number
  ): Promise<SwapResult> {
    const t = { start: Date.now(), quote: 0, build: 0, send: 0 };

    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash('confirmed');

    t.quote = Date.now();
    const quote = await this.getQuote(inputMint, WSOL_MINT, amountRaw);
    if (!quote) throw new Error('Geen Jupiter-quote beschikbaar voor verkoop');
    logger.debug(`[Swapper] Verkoop quote: ${Date.now() - t.quote}ms | out: ${quote.outAmount}`);

    t.build = Date.now();
    const tx = await this.buildSwapTransaction(quote);
    if (!tx) throw new Error('Kon verkoop-transactie niet bouwen via Jupiter /swap');
    logger.debug(`[Swapper] Verkoop build: ${Date.now() - t.build}ms`);

    tx.sign([this.wallet.keypair]);

    t.send = Date.now();
    const signature = await this.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
      maxRetries:    0,
    });
    logger.info(`[Swapper] Verkoop verstuurd: ${signature} (${Date.now() - t.send}ms)`);

    const confirmation = await Promise.race([
      this.connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      ),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Verkoop confirmatie timeout na ${CONFIRM_TIMEOUT_MS}ms | sig: ${signature}`)),
          CONFIRM_TIMEOUT_MS
        )
      ),
    ]);

    if (confirmation.value.err) {
      return {
        success:        false,
        signature,
        inputAmountSol: 0,
        attempt,
        error:          `On-chain fout: ${JSON.stringify(confirmation.value.err)}`,
      };
    }

    const outSol = Number(quote.outAmount ?? 0) / LAMPORTS_PER_SOL;
    logger.info(
      `[Swapper] Verkoop bevestigd! | sig: ${signature} | ` +
      `ontvangen: ${outSol.toFixed(4)} SOL | totaal: ${Date.now() - t.start}ms`
    );

    return {
      success:        true,
      signature,
      inputAmountSol: 0,
      outputAmount:   String(quote.outAmount ?? ''),
      priceImpactPct: String(quote.priceImpactPct ?? ''),
      routeSummary:   buildRouteSummary(quote),
      attempt,
    };
  }

  // ── Privé: Jupiter API ──────────────────────────────────────────────────────

  private async getQuote(
    inputMint:      string,
    outputMint:     string,
    amount:         number | string
  ): Promise<Record<string, unknown> | null> {
    const url = new URL(`${this.jupiterApiUrl}/quote`);
    url.searchParams.set('inputMint',        inputMint);
    url.searchParams.set('outputMint',       outputMint);
    url.searchParams.set('amount',           String(amount));
    url.searchParams.set('slippageBps',      String(config.swap.slippageBps));
    url.searchParams.set('onlyDirectRoutes', 'false');

    try {
      const res = await fetchWithTimeout(url.toString(), {}, JUPITER_API_TIMEOUT_MS);

      if (!res.ok) {
        logger.error(`[Swapper] Jupiter /quote HTTP ${res.status}: ${res.statusText}`);
        return null;
      }

      const json = await res.json() as Record<string, unknown>;

      if (json.error) {
        logger.error(`[Swapper] Jupiter /quote fout: ${json.error}`);
        return null;
      }

      return json;
    } catch (err) {
      throw new Error(`Jupiter /quote timeout of netwerk-fout: ${err}`);
    }
  }

  private async buildSwapTransaction(
    quote: Record<string, unknown>
  ): Promise<VersionedTransaction | null> {
    try {
      const res = await fetchWithTimeout(
        `${this.jupiterApiUrl}/swap`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quoteResponse:             quote,
            userPublicKey:             this.wallet.publicKey.toBase58(),
            wrapAndUnwrapSol:          true,
            dynamicComputeUnitLimit:   true,
            prioritizationFeeLamports: config.swap.priorityFeeMode === 'auto'
              ? { autoMultiplier: config.swap.priorityFeeAutoMultiplier }
              : config.swap.priorityFeeMicroLamports,
          }),
        },
        JUPITER_API_TIMEOUT_MS
      );

      if (!res.ok) {
        logger.error(`[Swapper] Jupiter /swap HTTP ${res.status}`);
        return null;
      }

      const body = await res.json() as { swapTransaction?: string; error?: string };

      if (body.error || !body.swapTransaction) {
        logger.error(`[Swapper] Jupiter /swap fout: ${body.error ?? 'geen swapTransaction'}`);
        return null;
      }

      const txBuffer = Buffer.from(body.swapTransaction, 'base64');
      return VersionedTransaction.deserialize(txBuffer);

    } catch (err) {
      throw new Error(`Jupiter /swap timeout of netwerk-fout: ${err}`);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url:     string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bouw een leesbare route-samenvatting uit een Jupiter-quote.
 * Voorbeeld: "WSOL → BONK via Raydium AMM v4"
 */
function buildRouteSummary(quote: Record<string, unknown>): string {
  try {
    const plan = quote.routePlan as Array<{
      swapInfo?: {
        ammKey?:   string;
        label?:    string;
        inputMint?:  string;
        outputMint?: string;
      };
    }> | undefined;

    if (!plan || plan.length === 0) return 'Onbekende route';

    const labels = plan
      .map((step) => step.swapInfo?.label ?? step.swapInfo?.ammKey?.slice(0, 8) ?? '?')
      .join(' → ');

    return `${plan.length} stap(pen) via: ${labels}`;
  } catch {
    return 'Route niet parseerbaar';
  }
}
