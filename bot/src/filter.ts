/**
 * filter.ts
 *
 * Meerdere beveiligingslagen die een gedetecteerde Raydium pool doorlopen
 * vóórdat de swap-module wordt aangeroepen. Checks worden uitgevoerd van
 * goedkoop naar duur zodat dure API-calls vroeg worden overgeslagen.
 *
 * Volgorde:
 *  1. Blacklist check           (O(1) Set lookup)
 *  2. SOL-pair check            (in-memory)
 *  3. Minimum liquiditeit       (in-memory, uit instructie-data)
 *  4. Token age check           (Date.now() vergelijking)
 *  5. Open-time check           (in-memory)
 *  6. Deployer tx history       (1× RPC call via Helius)
 *  7. Honeypot simulatie        (2× Jupiter API calls — langzaamste)
 */

import fs from 'fs';
import path from 'path';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { config } from './config';
import { logger } from './logger';
import type { PoolInfo } from './listener';

// ── Constanten ────────────────────────────────────────────────────────────────

export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// Klein simulatie-bedrag voor honeypot-check (0.001 SOL in lamports)
const SIM_LAMPORTS = Math.floor(config.filter.honeypotSimAmountSol * LAMPORTS_PER_SOL);

// Maximale wachttijd per Jupiter-request (ms)
const JUPITER_TIMEOUT_MS = 4_000;

// Maximale retries voor Jupiter-quote bij nieuwe pools (nog niet geïndexeerd)
const JUPITER_QUOTE_RETRIES = 3;
const JUPITER_QUOTE_RETRY_DELAY_MS = 600;

const BLACKLIST_PATH = path.resolve(__dirname, 'blacklist.json');

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FilterResult {
  passed:        boolean;
  reason?:       string;
  /** Mint-adres van de te kopen token (de niet-SOL kant) */
  tokenMint?:    string;
  /** Liquiditeit in SOL (uit instructie-data) */
  liquiditySol?: number;
  /** Resultaten per check voor debug-logging */
  checks?:       Record<string, string>;
}

interface BlacklistEntry {
  address: string;
  reason:  string;
  source:  string;
  addedAt: string;
}

interface BlacklistFile {
  _notice:  string;
  _sources: string[];
  entries:  BlacklistEntry[];
}

// ── PoolFilter ────────────────────────────────────────────────────────────────

export class PoolFilter {
  private readonly connection: Connection;
  private readonly blacklist:  Set<string>;
  private blacklistData:       BlacklistFile;

  constructor() {
    this.connection = new Connection(config.helius.rpcUrl, 'confirmed');
    const loaded    = this.loadBlacklist();
    this.blacklist  = loaded.set;
    this.blacklistData = loaded.data;
  }

  // ── Publieke API ────────────────────────────────────────────────────────────

  /**
   * Voer alle filterchecks uit op de gegeven pool.
   * Stopt bij de eerste gefaalde check (fail-fast).
   */
  async evaluate(pool: PoolInfo): Promise<FilterResult> {
    const tokenMint    = pool.coinMint === WSOL_MINT ? pool.pcMint : pool.coinMint;
    const liquiditySol = Number(pool.initPcAmountLamports) / LAMPORTS_PER_SOL;

    // ── Check 1: Blacklist ──────────────────────────────────────────────────────
    const blacklistHit = this.checkBlacklist(pool.deployer, tokenMint);
    if (blacklistHit) {
      return skip(`SKIP: blacklist — ${blacklistHit}`, tokenMint, liquiditySol);
    }

    // ── Check 2: SOL-pair ──────────────────────────────────────────────────────
    if (pool.coinMint !== WSOL_MINT && pool.pcMint !== WSOL_MINT) {
      return skip(
        `SKIP: geen SOL-pair (coinMint=${pool.coinMint}, pcMint=${pool.pcMint})`,
        tokenMint, liquiditySol
      );
    }

    // ── Check 3: Minimum liquiditeit ──────────────────────────────────────────
    if (liquiditySol < config.filter.minLiquiditySol) {
      return skip(
        `SKIP: liquiditeit te laag — ${liquiditySol.toFixed(3)} SOL ` +
        `(minimum: ${config.filter.minLiquiditySol} SOL)`,
        tokenMint, liquiditySol
      );
    }

    // ── Check 4: Token age ────────────────────────────────────────────────────
    const ageMs = Date.now() - pool.detectedAt;
    if (ageMs > config.filter.maxTokenAgeMs) {
      return skip(
        `SKIP: te laat — pool is ${(ageMs / 1000).toFixed(1)}s oud ` +
        `(max: ${config.filter.maxTokenAgeMs / 1000}s)`,
        tokenMint, liquiditySol
      );
    }

    // ── Check 5: Open-time ────────────────────────────────────────────────────
    if (pool.openTime > 0) {
      const waitMs = pool.openTime * 1000 - Date.now();
      if (waitMs > config.filter.maxOpenTimeFutureMs) {
        return skip(
          `SKIP: pool opent pas over ${(waitMs / 60_000).toFixed(1)} min ` +
          `(max: ${config.filter.maxOpenTimeFutureMs / 60_000} min)`,
          tokenMint, liquiditySol
        );
      }
    }

    // ── Check 6: Deployer transaction history ─────────────────────────────────
    const deployerCheck = await this.checkDeployerHistory(pool.deployer);
    if (!deployerCheck.passed) {
      return skip(deployerCheck.reason!, tokenMint, liquiditySol);
    }

    // ── Check 7: Honeypot simulatie ───────────────────────────────────────────
    if (config.filter.honeypotCheckEnabled) {
      const honeypotCheck = await this.checkHoneypot(tokenMint);
      if (!honeypotCheck.passed) {
        return skip(honeypotCheck.reason!, tokenMint, liquiditySol);
      }
    }

    // ── Alle checks geslaagd ──────────────────────────────────────────────────
    logger.info(
      `[Filter] ✓ GOEDGEKEURD — ammId: ${pool.ammId} | ` +
      `token: ${tokenMint} | liquiditeit: ${liquiditySol.toFixed(3)} SOL | ` +
      `deployer: ${pool.deployer.slice(0, 8)}...`
    );

    return { passed: true, tokenMint, liquiditySol };
  }

  /**
   * Voeg een deployer of token-mint toe aan de blacklist en sla op naar disk.
   * @param address  Wallet- of mint-adres
   * @param reason   Reden voor blacklisting
   * @param source   Bron (bijv. 'manual', 'rugcheck', 'community')
   */
  addToBlacklist(
    address: string,
    reason:  string,
    source:  string = 'manual'
  ): void {
    // Controleer of al aanwezig
    if (this.blacklist.has(address)) {
      logger.warn(`[Filter/Blacklist] ${address} staat al in de blacklist.`);
      return;
    }

    const entry: BlacklistEntry = {
      address,
      reason,
      source,
      addedAt: new Date().toISOString(),
    };

    this.blacklistData.entries.push(entry);
    this.blacklist.add(address);

    try {
      fs.writeFileSync(BLACKLIST_PATH, JSON.stringify(this.blacklistData, null, 2), 'utf8');
      logger.info(`[Filter/Blacklist] Toegevoegd: ${address} (${reason})`);
    } catch (err) {
      logger.error('[Filter/Blacklist] Kon blacklist niet opslaan naar disk:', err);
    }
  }

  // ── Privé: individuele checks ───────────────────────────────────────────────

  /**
   * Check 1 — Blacklist
   * Controleert zowel de deployer-wallet als de token-mint.
   * Geeft de reden terug als er een hit is, anders null.
   */
  private checkBlacklist(deployer: string, tokenMint: string): string | null {
    if (this.blacklist.has(deployer)) {
      const entry = this.blacklistData.entries.find((e) => e.address === deployer);
      return `deployer ${deployer.slice(0, 8)}... — ${entry?.reason ?? 'bekend scam-adres'}`;
    }
    if (this.blacklist.has(tokenMint)) {
      const entry = this.blacklistData.entries.find((e) => e.address === tokenMint);
      return `token-mint ${tokenMint.slice(0, 8)}... — ${entry?.reason ?? 'bekend scam-token'}`;
    }
    return null;
  }

  /**
   * Check 6 — Deployer transaction history
   *
   * Haalt de meest recente N transacties op van de deployer-wallet.
   * Als er minder dan N gevonden worden is de wallet te vers → red flag.
   *
   * Gebruikt getSignaturesForAddress (standaard Solana RPC — snel, ~100ms).
   */
  private async checkDeployerHistory(
    deployer: string
  ): Promise<{ passed: boolean; reason?: string }> {
    try {
      const pubkey = new PublicKey(deployer);
      const sigs   = await this.connection.getSignaturesForAddress(pubkey, {
        limit: config.filter.minDeployerTxCount,
      });

      if (sigs.length < config.filter.minDeployerTxCount) {
        return {
          passed: false,
          reason: `SKIP: deployer slechts ${sigs.length} transacties ` +
                  `(minimum: ${config.filter.minDeployerTxCount}) — verse wegwerp-wallet`,
        };
      }

      logger.debug(`[Filter] Deployer OK: ${deployer.slice(0, 8)}... heeft ≥${sigs.length} tx's`);
      return { passed: true };

    } catch (err) {
      // Fail closed: onbekende deployer bij RPC-fout = niet kopen
      logger.warn(`[Filter] Deployer-check RPC-fout voor ${deployer.slice(0, 8)}...: ${err} — pool afgewezen`);
      return {
        passed: false,
        reason: `SKIP: deployer-check RPC-fout — afgewezen voor veiligheid`,
      };
    }
  }

  /**
   * Check 7 — Honeypot simulatie via Jupiter quote
   *
   * Strategie:
   *  a) Simuleer koop: WSOL → tokenMint voor SIM_LAMPORTS
   *  b) Simuleer verkoop: tokenMint → WSOL voor de output van stap a
   *  c) Bereken round-trip verlies: (1 - verkoop_out / koop_in) × 100
   *  d) Als verlies > honeypotMaxLossPct → honeypot
   *  e) Als verkoop-quote volledig mislukt → honeypot
   *
   * Retries bij mislukken: Jupiter indexeert nieuwe pools soms met
   * een vertraging van 1-2 seconden na pool-creatie.
   */
  private async checkHoneypot(
    tokenMint: string
  ): Promise<{ passed: boolean; reason?: string }> {
    // ── Stap a: Koop-quote ─────────────────────────────────────────────────────
    const buyQuote = await this.jupiterQuoteWithRetry(
      WSOL_MINT,
      tokenMint,
      SIM_LAMPORTS
    );

    if (!buyQuote) {
      // Geen route gevonden → pool mogelijk niet geïndexeerd of geen liquiditeit
      return {
        passed: false,
        reason: `SKIP: honeypot — geen koop-route beschikbaar via Jupiter`,
      };
    }

    const buyOutAmount = buyQuote.outAmount as string;

    if (!buyOutAmount || BigInt(buyOutAmount) === 0n) {
      return {
        passed: false,
        reason: `SKIP: honeypot — koop-quote geeft 0 tokens terug`,
      };
    }

    // ── Stap b: Verkoop-quote ──────────────────────────────────────────────────
    const sellQuote = await this.jupiterQuoteWithRetry(
      tokenMint,
      WSOL_MINT,
      Number(buyOutAmount)
    );

    if (!sellQuote) {
      return {
        passed: false,
        reason: `SKIP: honeypot — geen verkoop-route beschikbaar (sell blocked)`,
      };
    }

    const sellOutLamports = Number(sellQuote.outAmount as string);

    // ── Stap c: Round-trip verliesberekening ──────────────────────────────────
    const lossPct = (1 - sellOutLamports / SIM_LAMPORTS) * 100;

    logger.debug(
      `[Filter] Honeypot sim: koop ${config.filter.honeypotSimAmountSol} SOL → ` +
      `${buyOutAmount} tokens → ${(sellOutLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL ` +
      `(verlies: ${lossPct.toFixed(1)}%)`
    );

    if (lossPct > config.filter.honeypotMaxLossPct) {
      return {
        passed: false,
        reason:
          `SKIP: honeypot — round-trip verlies ${lossPct.toFixed(1)}% ` +
          `(max: ${config.filter.honeypotMaxLossPct}%)`,
      };
    }

    return { passed: true };
  }

  /**
   * Haal een Jupiter-quote op met retry-logica.
   * Nieuwe Raydium-pools worden soms pas na 1-2 seconden door Jupiter geïndexeerd.
   */
  private async jupiterQuoteWithRetry(
    inputMint:  string,
    outputMint: string,
    amount:     number
  ): Promise<Record<string, unknown> | null> {
    const url = new URL(`${config.jupiter.apiUrl}/quote`);
    url.searchParams.set('inputMint',       inputMint);
    url.searchParams.set('outputMint',      outputMint);
    url.searchParams.set('amount',          String(amount));
    url.searchParams.set('slippageBps',     String(config.filter.honeypotSimSlippageBps));
    url.searchParams.set('onlyDirectRoutes', 'false');

    for (let attempt = 1; attempt <= JUPITER_QUOTE_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), JUPITER_TIMEOUT_MS);

        const res = await fetch(url.toString(), { signal: controller.signal });
        clearTimeout(timer);

        if (!res.ok) {
          // 400 met "COULD_NOT_FIND_ANY_ROUTE" is normaal voor niet-geïndexeerde pools
          logger.debug(
            `[Filter] Jupiter quote HTTP ${res.status} (poging ${attempt}/${JUPITER_QUOTE_RETRIES})`
          );

          if (attempt < JUPITER_QUOTE_RETRIES) {
            await sleep(JUPITER_QUOTE_RETRY_DELAY_MS * attempt);
          }
          continue;
        }

        const json = await res.json() as Record<string, unknown>;

        // Jupiter retourneert soms een error-object in de body
        if (json.error) {
          logger.debug(
            `[Filter] Jupiter quote error: ${json.error} (poging ${attempt}/${JUPITER_QUOTE_RETRIES})`
          );
          if (attempt < JUPITER_QUOTE_RETRIES) {
            await sleep(JUPITER_QUOTE_RETRY_DELAY_MS * attempt);
          }
          continue;
        }

        return json;

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.debug(`[Filter] Jupiter quote fetch-fout poging ${attempt}: ${msg}`);

        if (attempt < JUPITER_QUOTE_RETRIES) {
          await sleep(JUPITER_QUOTE_RETRY_DELAY_MS * attempt);
        }
      }
    }

    return null;
  }

  // ── Privé: blacklist laden ──────────────────────────────────────────────────

  private loadBlacklist(): { set: Set<string>; data: BlacklistFile } {
    const empty: BlacklistFile = {
      _notice:  'Leeg — voeg adressen toe via addToBlacklist()',
      _sources: [],
      entries:  [],
    };

    try {
      const raw  = fs.readFileSync(BLACKLIST_PATH, 'utf8');
      const data = JSON.parse(raw) as BlacklistFile;
      const set  = new Set(data.entries.map((e) => e.address));
      logger.info(`[Filter/Blacklist] ${set.size} adressen geladen uit blacklist.json`);
      return { set, data };
    } catch (err) {
      logger.warn(`[Filter/Blacklist] Kon blacklist.json niet laden: ${err} — lege blacklist gebruikt`);
      return { set: new Set(), data: empty };
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function skip(
  reason:       string,
  tokenMint?:   string,
  liquiditySol?: number
): FilterResult {
  logger.info(`[Filter] ${reason}`);
  return { passed: false, reason, tokenMint, liquiditySol };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
