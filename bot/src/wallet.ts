/**
 * wallet.ts
 *
 * Laadt het Solana keypair vanuit de WALLET_PRIVATE_KEY omgevingsvariabele
 * (base58-geëncodeerde private key).
 *
 * DRY_RUN-modus: als de key een placeholder is én DRY_RUN=true, wordt een
 * willekeurig tijdelijk keypair gegenereerd. Er worden dan NOOIT echte
 * transacties ondertekend of verstuurd.
 */

import { Keypair, Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from './config';
import { logger } from './logger';

const PLACEHOLDER_KEY = 'your_base58_private_key_here';

export class WalletManager {
  public readonly keypair:   Keypair;
  public readonly publicKey: PublicKey;
  public readonly isDryRun:  boolean;

  private readonly connection: Connection;

  constructor() {
    this.isDryRun   = config.dryRun;
    this.connection = new Connection(config.helius.rpcUrl, 'confirmed');

    const rawKey = config.wallet.privateKey;

    if (rawKey === PLACEHOLDER_KEY || rawKey === '') {
      if (this.isDryRun) {
        // Genereer wegwerp-keypair — wordt nooit gebruikt voor echte tx's
        this.keypair   = Keypair.generate();
        this.publicKey = this.keypair.publicKey;
        logger.warn('[Wallet] DRY RUN — Geen WALLET_PRIVATE_KEY ingesteld.');
        logger.warn('[Wallet] DRY RUN — Tijdelijk keypair gegenereerd (alleen voor simulatie).');
        logger.warn(`[Wallet] DRY RUN — Adres: ${this.publicKey.toBase58()}`);
        return;
      }
      throw new Error(
        'WALLET_PRIVATE_KEY is niet ingesteld. Vul een base58-geëncodeerde private key in .env in.'
      );
    }

    try {
      const secretKey = bs58.decode(rawKey);
      this.keypair    = Keypair.fromSecretKey(secretKey);
      this.publicKey  = this.keypair.publicKey;
    } catch {
      if (this.isDryRun) {
        this.keypair   = Keypair.generate();
        this.publicKey = this.keypair.publicKey;
        logger.warn('[Wallet] DRY RUN — Ongeldig WALLET_PRIVATE_KEY formaat, tijdelijk keypair gebruikt.');
        return;
      }
      throw new Error(
        'Ongeldig WALLET_PRIVATE_KEY formaat. Verwacht een base58-geëncodeerde private key.'
      );
    }

    logger.info(`[Wallet] Keypair geladen: ${this.publicKey.toBase58()}`);
  }

  /** Geeft het SOL-balance van de wallet terug */
  async getBalanceSol(): Promise<number> {
    if (this.isDryRun) return 999; // simuleer ruim voldoende saldo
    const lamports = await this.connection.getBalance(this.publicKey);
    return lamports / LAMPORTS_PER_SOL;
  }

  /** Controleert of er genoeg SOL is voor de geplande koop */
  async hasSufficientBalance(requiredSol: number): Promise<boolean> {
    if (this.isDryRun) return true;
    const balance = await this.getBalanceSol();
    return balance >= requiredSol + 0.01; // 0.01 SOL reserve voor fees
  }
}
