/**
 * listener.ts
 *
 * Luistert via Helius WebSocket naar nieuwe Raydium AMM v4 pool creaties.
 *
 * Aanpak:
 *  1. logsSubscribe op het Raydium AMM v4 programma-adres
 *  2. Filter logs op "initialize2" — de instructie die een nieuwe pool aanmaakt
 *  3. Haal de volledige transactie op (met retry) via json-encoding
 *  4. Zoek de Raydium-instructie in de tx en parseer haar account-lijst correct
 *  5. Decodeer de instructie-data voor openTime, nonce en beginliquiditeit
 *  6. Geef PoolInfo door aan de callback
 *
 * Raydium AMM v4 initialize2 instruction layout (accounts, 0-geïndexeerd):
 *   [0]  spl_token_program
 *   [1]  associated_token_program
 *   [2]  system_program
 *   [3]  rent_sysvar
 *   [4]  amm          ← pool-adres
 *   [5]  amm_authority
 *   [6]  amm_open_orders
 *   [7]  lp_mint
 *   [8]  coin_mint    ← token A mint (nieuwe token)
 *   [9]  pc_mint      ← token B mint (WSOL of USDC)
 *   [10] pool_coin_token_account  ← coin vault (liquiditeitscheck)
 *   [11] pool_pc_token_account    ← pc/SOL vault (liquiditeitscheck)
 *   [12] pool_withdraw_queue
 *   [13] amm_target_orders
 *   [14] pool_temp_lp_token_account
 *   [15] serum_program
 *   [16] serum_market
 *   [17] user_wallet  ← deployer
 *
 * Instructie-data layout (na de 1-byte tag):
 *   byte 0     : tag = 1 (initialize2)
 *   byte 1     : nonce (u8)
 *   bytes 2-9  : open_time (u64 LE) — Unix timestamp waarop swappen is toegestaan
 *   bytes 10-17: init_pc_amount (u64 LE) — initiële SOL/PC-hoeveelheid in lamports
 *   bytes 18-25: init_coin_amount (u64 LE) — initiële token-hoeveelheid
 */

import WebSocket from 'ws';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import { config } from './config';
import { logger } from './logger';
import { creditTracker } from './creditTracker';

// ── Constanten ────────────────────────────────────────────────────────────────

/** Instructie-tag byte voor initialize2 in Raydium AMM v4 */
const INIT2_TAG = 1;

/** Account-posities binnen de initialize2 instructie-account-lijst */
const IX_ACCOUNT = {
  AMM:        4,
  COIN_MINT:  8,
  PC_MINT:    9,
  COIN_VAULT: 10,
  PC_VAULT:   11,
  DEPLOYER:   17,
} as const;

/** Byte-offsets in de instructie-data (na de tag-byte) */
const DATA_OFFSET = {
  TAG:              0,
  NONCE:            1,
  OPEN_TIME:        2,   // u64 LE, 8 bytes
  INIT_PC_AMOUNT:  10,   // u64 LE, 8 bytes
  INIT_COIN_AMOUNT: 18,  // u64 LE, 8 bytes
} as const;

const RAYDIUM_LOG_MARKER = 'initialize2';

// Reconnect
const BASE_RECONNECT_MS      = 2_000;
const MAX_RECONNECT_ATTEMPTS = 25;

// getTransaction retry
const TX_FETCH_MAX_RETRIES = 6;
const TX_FETCH_RETRY_MS    = 200;

// Deduplicatie
/** Max signatures in het dedup-venster */
const MAX_SEEN_SIGS    = 500;
/** Venster waarbinnen een signature als duplicaat wordt beschouwd */
const DEDUP_WINDOW_MS  = 30_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PoolInfo {
  /** Transactie-signature */
  signature: string;
  /** AMM pool-adres */
  ammId: string;
  /** Token A mint (doorgaans de nieuwe token) */
  coinMint: string;
  /** Token B mint (doorgaans WSOL = So111...112) */
  pcMint: string;
  /** Vault-adres voor coin (voor liquiditeitscheck) */
  coinVault: string;
  /** Vault-adres voor pc/SOL (voor liquiditeitscheck) */
  pcVault: string;
  /** Wallet die de pool aanmaakte */
  deployer: string;
  /** Unix-timestamp (seconden) waarop swappen is toegestaan; 0 = direct */
  openTime: number;
  /** Initiële SOL/PC-hoeveelheid in lamports (uit instructie-data) */
  initPcAmountLamports: bigint;
  /** Initiële token-hoeveelheid (kleinste eenheden) */
  initCoinAmount: bigint;
  /** Nonce uit instructie-data */
  nonce: number;
  /** Tijdstip van detectie (Unix ms) */
  detectedAt: number;
}

export interface ListenerStats {
  txSeen:       number;
  init2Found:   number;
  parsedOk:     number;
  parseErrors:  number;
  duplicates:   number;
}

export type PoolDetectedCallback = (pool: PoolInfo) => void | Promise<void>;

// ── RPC response types ────────────────────────────────────────────────────────

interface RpcInstruction {
  programIdIndex: number;
  accounts:       number[];   // indices in de platte account-key-lijst
  data:           string;     // base58-geëncodeerde instructie-data
}

interface RpcTransaction {
  result: {
    transaction: {
      message: {
        accountKeys: string[];
        instructions: RpcInstruction[];
        // versioned tx's kunnen innerInstructions hebben — we doorzoeken alleen top-level
      };
    };
  } | null;
}

// ── RaydiumListener ───────────────────────────────────────────────────────────

export class RaydiumListener {
  private ws:                WebSocket | null = null;
  private subscriptionId:    number | null    = null;
  private reconnectAttempts: number           = 0;
  private isStopped:         boolean          = false;
  private pingInterval:      NodeJS.Timeout | null = null;

  /** Verwerkte signatures met tijdstip — voorkomt dubbele verwerking binnen 30s */
  private readonly seenSignatures = new Map<string, number>(); // sig → addedAt (ms)

  /** Statistieken voor monitoring */
  public readonly stats: ListenerStats = {
    txSeen:      0,
    init2Found:  0,
    parsedOk:    0,
    parseErrors: 0,
    duplicates:  0,
  };

  private readonly programId: string;

  constructor(private readonly onPoolDetected: PoolDetectedCallback) {
    // Valideer het programma-adres bij aanmaken
    this.programId = new PublicKey(config.raydium.ammProgramId).toBase58();
  }

  /** Start de WebSocket verbinding */
  start(): void {
    this.isStopped = false;
    creditTracker.start();
    this.connect();
  }

  /** Stop netjes — geen automatische reconnect */
  stop(): void {
    this.isStopped = true;
    creditTracker.flush();   // laatste stats opslaan
    creditTracker.stop();
    this.cleanup();
    logger.info('[Listener] Gestopt.');
  }

  /** Sluit huidige verbinding en open een nieuwe — pikt nieuwe process.env config op */
  restart(): void {
    logger.info('[Listener] Herstart...');
    this.isStopped         = false;
    this.reconnectAttempts = 0;
    this.cleanup();
    this.connect();
  }

  /** Toon huidige statistieken */
  logStats(): void {
    const { txSeen, init2Found, parsedOk, parseErrors, duplicates } = this.stats;
    logger.info(
      `[Listener] Stats — gezien: ${txSeen} | init2: ${init2Found} | ` +
      `geparsed: ${parsedOk} | fouten: ${parseErrors} | duplicaten: ${duplicates}`
    );
  }

  // ── Privé: WebSocket lifecycle ──────────────────────────────────────────────

  private connect(): void {
    logger.info('[Listener] Verbinden met Helius WebSocket...');
    this.ws = new WebSocket(config.helius.wsUrl);

    this.ws.on('open',    () => this.onOpen());
    this.ws.on('message', (raw) => this.onMessage(raw));
    this.ws.on('error',   (err) => this.onError(err));
    this.ws.on('close',   (code) => this.onClose(code));
  }

  private onOpen(): void {
    this.reconnectAttempts = 0;
    logger.info('[Listener] Verbonden. Abonnement aanvragen...');

    this.ws!.send(JSON.stringify({
      jsonrpc: '2.0',
      id:      1,
      method:  'logsSubscribe',
      params: [
        { mentions: [this.programId] },
        { commitment: 'confirmed' },
      ],
    }));

    // Ping elke 30 s zodat de verbinding niet time-out
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
        logger.debug('[Listener] Ping verstuurd.');
      }
    }, 30_000);
  }

  private onMessage(raw: WebSocket.RawData): void {
    const str = raw.toString();

    // ── Credit tracking: telt ALLE ontvangen bytes ────────────────────────────
    creditTracker.addBytes(Buffer.byteLength(str, 'utf8'));

    // ── Pre-filter: gooi logsNotification-berichten weg die geen ─────────────
    //   "initialize2" bevatten — vóór JSON.parse, zo vroeg mogelijk.
    //   Dit vangt ~99% van alle berichten af.
    if (str.includes('"logsNotification"')) {
      creditTracker.addMessage();

      if (!str.includes(RAYDIUM_LOG_MARKER)) {
        creditTracker.addDropped();
        return; // ← het overgrote deel eindigt hier
      }

      creditTracker.addPassed();
    }

    // ── JSON.parse alleen voor berichten die de pre-filter passeerden ─────────
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(str);
    } catch {
      return; // ongeldig JSON — negeren
    }

    // Abonnements-bevestiging of fout van de server
    if (msg.id === 1) {
      if (msg.error) {
        logger.error(`[Listener] Abonnement geweigerd: ${JSON.stringify(msg.error)} — herverbinden...`);
        this.ws?.close(); // onClose plant herverbinding in
        return;
      }
      if (typeof msg.result === 'number') {
        this.subscriptionId = msg.result as number;
        logger.info(
          `[Listener] Abonnement actief (sub-id: ${this.subscriptionId}) ` +
          `— luistert naar programma ${this.programId}`
        );
      } else {
        logger.error(`[Listener] Onverwacht abonnements-resultaat: ${JSON.stringify(msg.result)} — herverbinden...`);
        this.ws?.close();
      }
      return;
    }

    if (msg.method === 'logsNotification') {
      this.handleNotification(msg);
    }
  }

  private onError(err: Error): void {
    logger.error('[Listener] WebSocket fout:', err.message);
  }

  private onClose(code: number): void {
    logger.warn(`[Listener] WebSocket gesloten (code: ${code}).`);
    this.cleanup();
    if (!this.isStopped) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.error('[Listener] Max reconnect-pogingen bereikt. Bot stopt.');
      process.exit(1);
    }
    this.reconnectAttempts++;
    // Exponentiële backoff met cap op 30 s
    const delay = Math.min(BASE_RECONNECT_MS * 2 ** (this.reconnectAttempts - 1), 30_000);
    logger.info(
      `[Listener] Reconnect over ${(delay / 1000).toFixed(1)}s ` +
      `(poging ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`
    );
    setTimeout(() => this.connect(), delay);
  }

  private cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      const state = this.ws.readyState;
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.subscriptionId = null;
  }

  // ── Privé: event verwerking ─────────────────────────────────────────────────

  private handleNotification(msg: Record<string, unknown>): void {
    const value = (
      (msg.params as Record<string, unknown>)
        ?.result as Record<string, unknown>
    )?.value as Record<string, unknown> | undefined;

    if (!value) return;

    const signature = value.signature as string | undefined;
    const logs      = value.logs      as string[] | undefined;
    const err       = value.err;

    // Gefaalde transacties of ontbrekende velden overslaan
    if (err || !logs || !signature) return;

    this.stats.txSeen++;

    // Snel pre-filter op log-tekst vóórdat we de dure tx-fetch starten
    const hasInit2 = logs.some((l) => l.includes(RAYDIUM_LOG_MARKER));
    if (!hasInit2) return;

    this.stats.init2Found++;

    // ── Deduplicatie met 30s tijdvenster ──────────────────────────────────────
    const now = Date.now();

    if (this.seenSignatures.has(signature)) {
      this.stats.duplicates++;
      logger.debug(`[Listener] Duplicaat overgeslagen: ${signature}`);
      return;
    }

    // Prune: verwijder entries ouder dan DEDUP_WINDOW_MS wanneer het venster vol is
    if (this.seenSignatures.size >= MAX_SEEN_SIGS) {
      for (const [sig, addedAt] of this.seenSignatures) {
        if (now - addedAt > DEDUP_WINDOW_MS) {
          this.seenSignatures.delete(sig);
        }
      }
      // Als na prune nog steeds vol: verwijder de oudste entry
      if (this.seenSignatures.size >= MAX_SEEN_SIGS) {
        const oldest = this.seenSignatures.keys().next().value;
        if (oldest !== undefined) this.seenSignatures.delete(oldest);
      }
    }

    this.seenSignatures.set(signature, now);

    logger.info(`[Listener] Pool-kandidaat gevonden (tx: ${signature})`);

    // Verwerk asynchroon — fouten worden intern afgehandeld
    this.processTransaction(signature, Date.now()).catch((e) => {
      logger.error('[Listener] Onverwachte fout in processTransaction:', e);
    });
  }

  // ── Privé: transactie ophalen & parsen ─────────────────────────────────────

  /**
   * Haal de transactie op met retry-logica.
   * Transacties zijn soms nog niet beschikbaar op het moment dat de log-notificatie
   * binnenkomt — vandaar de retry met toenemende wachttijd.
   */
  private async fetchTransaction(signature: string): Promise<RpcTransaction['result']> {
    for (let attempt = 1; attempt <= TX_FETCH_MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(config.helius.rpcUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id:      'tx-fetch',
            method:  'getTransaction',
            params:  [
              signature,
              {
                // 'json' encoding geeft ruwe instructie-data + account-indices —
                // essentieel voor correcte parsing van Raydium-instructies
                encoding:                       'json',
                maxSupportedTransactionVersion: 0,
              },
            ],
          }),
        });

        const json = await res.json() as RpcTransaction;

        if (json.result !== null) return json.result;

        // Null betekent dat de tx nog niet beschikbaar is op dit moment
        logger.debug(`[Listener] tx nog niet beschikbaar (poging ${attempt}/${TX_FETCH_MAX_RETRIES}): ${signature}`);

      } catch (err) {
        logger.warn(`[Listener] Fetch-fout poging ${attempt}: ${err instanceof Error ? err.message : err}`);
      }

      // Wacht voor volgende poging (lineair oplopend)
      if (attempt < TX_FETCH_MAX_RETRIES) {
        await sleep(TX_FETCH_RETRY_MS * attempt);
      }
    }

    return null;
  }

  /**
   * Haal de transactie op en parseer de Raydium initialize2-instructie.
   * Zoekt de instructie die het Raydium AMM-programma aanroept en decode haar
   * account-referenties en instructie-data.
   */
  private async processTransaction(signature: string, detectedAt: number): Promise<void> {
    const tx = await this.fetchTransaction(signature);

    if (!tx) {
      logger.warn(`[Listener] Transactie niet ophaalbaar na ${TX_FETCH_MAX_RETRIES} pogingen: ${signature}`);
      this.stats.parseErrors++;
      return;
    }

    const { accountKeys, instructions } = tx.transaction.message;

    // Zoek de instructie die het Raydium AMM-programma aanroept
    const raydiumIx = this.findRaydiumInstruction(instructions, accountKeys);

    if (!raydiumIx) {
      logger.warn(`[Listener] Raydium initialize2-instructie niet gevonden in tx: ${signature}`);
      this.stats.parseErrors++;
      return;
    }

    // Parseer de instructie-data voor openTime en begin-liquiditeit
    const ixData = this.decodeInstructionData(raydiumIx.data);

    if (!ixData) {
      logger.warn(`[Listener] Kon instructie-data niet decoderen voor tx: ${signature}`);
      this.stats.parseErrors++;
      return;
    }

    // Vertaal instructie-account-indices naar publieke sleutels
    const get = (pos: number): string | undefined => {
      const flatIdx = raydiumIx.accounts[pos];
      return flatIdx !== undefined ? accountKeys[flatIdx] : undefined;
    };

    const ammId     = get(IX_ACCOUNT.AMM);
    const coinMint  = get(IX_ACCOUNT.COIN_MINT);
    const pcMint    = get(IX_ACCOUNT.PC_MINT);
    const coinVault = get(IX_ACCOUNT.COIN_VAULT);
    const pcVault   = get(IX_ACCOUNT.PC_VAULT);
    const deployer  = get(IX_ACCOUNT.DEPLOYER);

    if (!ammId || !coinMint || !pcMint || !coinVault || !pcVault || !deployer) {
      logger.warn(
        `[Listener] Ontbrekende accounts in instructie (ix.accounts.length=${raydiumIx.accounts.length}) ` +
        `voor tx: ${signature}`
      );
      this.stats.parseErrors++;
      return;
    }

    const poolInfo: PoolInfo = {
      signature,
      ammId,
      coinMint,
      pcMint,
      coinVault,
      pcVault,
      deployer,
      openTime:             ixData.openTime,
      initPcAmountLamports: ixData.initPcAmount,
      initCoinAmount:       ixData.initCoinAmount,
      nonce:                ixData.nonce,
      detectedAt,
    };

    this.stats.parsedOk++;

    const openInMs = poolInfo.openTime > 0
      ? poolInfo.openTime * 1000 - Date.now()
      : 0;

    logger.info(
      `[Listener] Pool geparsed:\n` +
      `  ammId     : ${poolInfo.ammId}\n` +
      `  coinMint  : ${poolInfo.coinMint}\n` +
      `  pcMint    : ${poolInfo.pcMint}\n` +
      `  openTime  : ${poolInfo.openTime === 0 ? 'direct' : `over ${(openInMs / 1000).toFixed(1)}s`}\n` +
      `  initPC    : ${Number(poolInfo.initPcAmountLamports) / 1e9} SOL\n` +
      `  deployer  : ${poolInfo.deployer}`
    );

    // Geef door aan callback — fire-and-forget met error boundary
    Promise.resolve(this.onPoolDetected(poolInfo)).catch((err) => {
      logger.error('[Listener] Fout in onPoolDetected callback:', err);
    });
  }

  /**
   * Zoek de initialize2-instructie van het Raydium AMM-programma.
   *
   * We controleren:
   *  1. programIdIndex wijst naar het Raydium AMM-adres in accountKeys
   *  2. Eerste byte van de instructie-data is INIT2_TAG (= 1)
   */
  private findRaydiumInstruction(
    instructions: RpcInstruction[],
    accountKeys:  string[]
  ): RpcInstruction | null {
    for (const ix of instructions) {
      // Controleer of deze instructie het Raydium AMM-programma aanroept
      if (accountKeys[ix.programIdIndex] !== this.programId) continue;

      // Decodeer de eerste byte van de instructie-data (= tag)
      let dataBytes: Uint8Array;
      try {
        dataBytes = bs58.decode(ix.data);
      } catch {
        continue;
      }

      if (dataBytes[DATA_OFFSET.TAG] !== INIT2_TAG) continue;

      return ix;
    }

    return null;
  }

  /**
   * Decodeer de instructie-data van een Raydium initialize2-instructie.
   *
   * Layout:
   *  [0]     tag (u8)              — altijd 1
   *  [1]     nonce (u8)
   *  [2-9]   open_time (u64 LE)   — 0 = pool direct beschikbaar
   *  [10-17] init_pc_amount (u64 LE)
   *  [18-25] init_coin_amount (u64 LE)
   */
  private decodeInstructionData(base58Data: string): {
    nonce:         number;
    openTime:      number;
    initPcAmount:  bigint;
    initCoinAmount: bigint;
  } | null {
    let bytes: Uint8Array;
    try {
      bytes = bs58.decode(base58Data);
    } catch {
      return null;
    }

    // Minimum verwachte lengte: 1 tag + 1 nonce + 8 openTime + 8 pc + 8 coin = 26 bytes
    if (bytes.length < 26) return null;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    return {
      nonce:          view.getUint8(DATA_OFFSET.NONCE),
      openTime:       Number(view.getBigUint64(DATA_OFFSET.OPEN_TIME, true)),
      initPcAmount:   view.getBigUint64(DATA_OFFSET.INIT_PC_AMOUNT, true),
      initCoinAmount: view.getBigUint64(DATA_OFFSET.INIT_COIN_AMOUNT, true),
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
