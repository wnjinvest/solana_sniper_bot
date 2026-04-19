/**
 * index.ts — Main entry point
 *
 * Start-volgorde:
 *  1. Socket.io server op poort 3001 (dashboard verbinding)
 *  2. Wallet, filter, swapper, monitor initialiseren
 *  3. Raydium WebSocket listener starten
 *  4. Events van alle modules via event-bus doorsturen naar dashboard
 */

import { config, reloadConfig } from './config';
import { logger }           from './logger';
import { WSOL_MINT }        from './constants';
import { RaydiumListener }  from './listener';
import { DemoSimulator }    from './demo-simulator';
import { PoolFilter }       from './filter';
import { WalletManager }    from './wallet';
import { Swapper }          from './swapper';
import { PositionMonitor }  from './monitor';
import { BotSocketServer }  from './socket-server';
import { eventBus }         from './event-bus';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { PoolInfo }    from './listener';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Haal de huidige marktprijs op van een token in SOL via Jupiter Price API v2.
 * Retourneert 0 als de prijs niet opgehaald kan worden (geen blocker voor de swap).
 */
async function fetchBuyPriceSol(tokenMint: string): Promise<number> {
  try {
    const url = `https://lite-api.jup.ag/price/v2?ids=${tokenMint}&vsToken=${WSOL_MINT}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });

    if (!res.ok) return 0;

    const json = await res.json() as {
      data?: Record<string, { price?: string }>;
    };

    const priceStr = json.data?.[tokenMint]?.price;
    if (!priceStr) return 0;

    const price = parseFloat(priceStr);
    return isFinite(price) && price > 0 ? price : 0;

  } catch {
    return 0;
  }
}

/** Classificeer een filter-reden naar een categorie voor de dashboard pie-chart */
function classifyFilterReason(reason: string): import('./socket-types').FilterCategory {
  const r = reason.toLowerCase();
  if (r.includes('liquiditeit'))   return 'liquidity';
  if (r.includes('te laat') || r.includes('oud')) return 'age';
  if (r.includes('honeypot'))      return 'honeypot';
  if (r.includes('blacklist'))     return 'blacklist';
  if (r.includes('deployer'))      return 'deployer';
  if (r.includes('sol-pair') || r.includes('wsol')) return 'sol_pair';
  if (r.includes('open') && r.includes('tijd'))     return 'open_time';
  return 'other';
}

async function main(): Promise<void> {
  logger.info('╔══════════════════════════════════════╗');
  logger.info('║   Solana Sniper Bot — opstarten...   ║');
  logger.info('╚══════════════════════════════════════╝');

  // ── Module initialisatie ────────────────────────────────────────────────────
  const wallet  = new WalletManager();
  const filter  = new PoolFilter();
  const swapper = new Swapper(wallet);
  const monitor = new PositionMonitor(swapper);

  const balanceSol = await wallet.getBalanceSol();
  if (process.env.WALLET_PRIVATE_KEY === 'your_base58_private_key_here') {
    logger.warn('⚠️  WALLET_PRIVATE_KEY is niet ingevuld — bot draait in DRY_RUN modus');
  }

  logger.info(`[Main] Wallet : ${wallet.publicKey.toBase58()}`);
  logger.info(`[Main] Balance: ${balanceSol.toFixed(4)} SOL`);
  logger.info(`[Main] DRY RUN: ${config.dryRun}`);
  logger.info(`[Main] Koop   : ${config.swap.buyAmountSol} SOL | TP: +${config.tpsl.takeProfitPercent}% | SL: -${config.tpsl.stopLossPercent}%`);

  if (!config.dryRun && balanceSol < config.swap.buyAmountSol + 0.01) {
    logger.error(`[Main] Onvoldoende SOL (${balanceSol.toFixed(4)}). Minimaal ${config.swap.buyAmountSol + 0.01} SOL nodig.`);
    process.exit(1);
  }

  // ── Socket.io server ────────────────────────────────────────────────────────
  let listener: RaydiumListener | null = null;

  const socketServer = new BotSocketServer(
    // start_bot callback
    (dryRun) => {
      if (listener) {
        logger.info(`[Main] Bot herstart via dashboard (dryRun=${dryRun})`);
        listener.restart();
      } else {
        logger.info(`[Main] Bot gestart via dashboard (dryRun=${dryRun})`);
        listener = new RaydiumListener(onPoolDetected);
        listener.start();
      }
    },
    // stop_bot callback
    () => {
      listener?.stop();
      listener = null;
      monitor.stop();
      logger.info('[Main] Bot gestopt via dashboard.');
    },
    // update_config callback
    (key, value) => {
      process.env[key] = value;
      reloadConfig();
      logger.info(`[Main] Config bijgewerkt: ${key}=${value}`);
    }
  );

  socketServer.listen();

  // ── Balance periodiek updaten ───────────────────────────────────────────────
  async function emitBalance() {
    const sol = await wallet.getBalanceSol();
    eventBus.emit('balance_update', { timestamp: Date.now(), balanceSol: sol });
  }
  emitBalance();
  setInterval(emitBalance, 30_000);

  // ── Status periodiek broadcasten ────────────────────────────────────────────
  setInterval(() => {
    socketServer.broadcastStatus(listener?.stats ?? {
      txSeen: 0, init2Found: 0, parsedOk: 0, parseErrors: 0, duplicates: 0,
    });
  }, 5_000);

  // ── Statistieken elke 5 minuten loggen ─────────────────────────────────────
  setInterval(() => listener?.logStats(), 5 * 60_000);

  // ── Pool-detectie callback ─────────────────────────────────────────────────
  const onPoolDetected = async (pool: PoolInfo): Promise<void> => {
    logger.info(`[Main] Pool: ${pool.ammId} | tx: ${pool.signature}`);

    // Emit naar dashboard
    const tokenMintForEvent = pool.coinMint === 'So11111111111111111111111111111111111111112'
      ? pool.pcMint
      : pool.coinMint;

    eventBus.emit('pool_detected', {
      timestamp:    pool.detectedAt,
      signature:    pool.signature,
      ammId:        pool.ammId,
      tokenMint:    tokenMintForEvent,
      liquiditySol: Number(pool.initPcAmountLamports) / LAMPORTS_PER_SOL,
      deployer:     pool.deployer,
      openTime:     pool.openTime,
    });

    // ── Filter ────────────────────────────────────────────────────────────────
    const filterResult = await filter.evaluate(pool);

    if (!filterResult.passed) {
      eventBus.emit('pool_filtered', {
        timestamp: Date.now(),
        ammId:     pool.ammId,
        tokenMint: filterResult.tokenMint ?? tokenMintForEvent,
        reason:    filterResult.reason ?? 'Onbekende reden',
        category:  classifyFilterReason(filterResult.reason ?? ''),
      });
      return;
    }

    const tokenMint = filterResult.tokenMint!;

    // ── Wacht op openTime ────────────────────────────────────────────────────
    if (pool.openTime > 0) {
      const waitMs = pool.openTime * 1000 - Date.now();
      if (waitMs > 0) {
        logger.info(`[Main] Pool opent over ${(waitMs / 1000).toFixed(1)}s — wachten...`);
        await sleep(waitMs);
      }
    }

    // ── Koop ─────────────────────────────────────────────────────────────────
    const hasFunds = await wallet.hasSufficientBalance(config.swap.buyAmountSol);
    if (!hasFunds) {
      logger.warn('[Main] Onvoldoende balance. Overgeslagen.');
      return;
    }

    const swapResult = await swapper.buyToken(tokenMint);

    if (!swapResult.success) {
      logger.error(`[Main] Swap mislukt: ${swapResult.error}`);
      return;
    }

    // Emit trade_executed
    eventBus.emit('trade_executed', {
      timestamp:      Date.now(),
      signature:      swapResult.signature ?? '',
      tokenMint,
      inputSol:       swapResult.inputAmountSol,
      outputTokens:   swapResult.outputAmount ?? '0',
      priceImpactPct: swapResult.priceImpactPct ?? '0',
      routeSummary:   swapResult.routeSummary ?? '',
      dryRun:         swapResult.dryRun ?? false,
      elapsedMs:      swapResult.elapsedMs ?? 0,
    });

    logger.info(`[Main] Koop geslaagd! sig: ${swapResult.signature} | output: ${swapResult.outputAmount}`);

    // ── TP/SL monitor ────────────────────────────────────────────────────────
    const buyPriceSol = await fetchBuyPriceSol(tokenMint);
    if (buyPriceSol > 0) {
      logger.info(`[Main] Instapprijs: ${buyPriceSol.toExponential(4)} SOL/token`);
    } else {
      logger.warn('[Main] Instapprijs niet beschikbaar — TP/SL monitor inactief voor deze positie.');
    }

    monitor.addPosition({
      tokenMint,
      buyPriceSol,
      tokenAmount:    BigInt(swapResult.outputAmount ?? '0'),
      inputSol:       swapResult.inputAmountSol,
      entryTimestamp: Date.now(),
    });
  };

  // De listener start pas via de dashboard "Start Bot" / "Start Demo" knop.
  // Hier NIET automatisch starten zodat de gebruiker eerst parameters kan instellen.

  // ── Graceful shutdown ───────────────────────────────────────────────────────
  const shutdown = (signal: string): void => {
    logger.info(`[Main] ${signal} — afsluiten...`);
    listener?.logStats();
    listener?.stop();
    monitor.stop();
    socketServer.close();
    process.exit(0);
  };

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('[Main] Onbehandelde rejection:', reason);
  });
}

main().catch((err) => {
  console.error('Fatale fout bij opstarten:', err);
  process.exit(1);
});
