/**
 * filter.test.ts
 *
 * Unit tests voor de 7-laagse PoolFilter.
 * Alle externe afhankelijkheden worden gemockt zodat
 * elke filterlaag in isolatie getest kan worden.
 */

import { PoolFilter } from '../filter';
import { WSOL_MINT } from '../constants';
import type { PoolInfo } from '../listener';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('../config', () => ({
  config: {
    helius:  { rpcUrl: 'https://test-rpc.helius.dev' },
    jupiter: { apiUrl: 'https://test-jup.ag' },
    filter: {
      minLiquiditySol:        5,
      minTokenSupply:         1_000_000,
      maxTokenAgeMs:          60_000,
      maxOpenTimeFutureMs:    300_000,  // 5 minuten
      minDeployerTxCount:     5,
      honeypotCheckEnabled:   true,
      honeypotSimAmountSol:   0.001,
      honeypotMaxLossPct:     20,
      honeypotSimSlippageBps: 500,
    },
  },
}));

jest.mock('../logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Literale strings — jest.mock() wordt gehoist boven const-declaraties
const BLACKLISTED_DEPLOYER = 'BlacklistedDeployer11111111111111111111111';
const BLACKLISTED_TOKEN    = 'BlacklistedToken111111111111111111111111111';

jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue(JSON.stringify({
    _notice:  'test',
    _sources: [],
    entries: [
      { address: 'BlacklistedDeployer11111111111111111111111', reason: 'known scammer', source: 'test', addedAt: '2024-01-01' },
      { address: 'BlacklistedToken111111111111111111111111111', reason: 'rug pull',      source: 'test', addedAt: '2024-01-01' },
    ],
  })),
  writeFileSync: jest.fn(),
}));

const mockGetSignaturesForAddress = jest.fn();

jest.mock('@solana/web3.js', () => ({
  Connection:       jest.fn().mockImplementation(() => ({
    getSignaturesForAddress: mockGetSignaturesForAddress,
  })),
  PublicKey:        jest.fn().mockImplementation((key: string) => ({ toBase58: () => key })),
  LAMPORTS_PER_SOL: 1_000_000_000,
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

const DEPLOYER   = 'DeployerWallet11111111111111111111111111111';
const TOKEN_MINT = 'TokenMint111111111111111111111111111111111';

/** Basepool die alle filters passeert (met juiste mocks actief) */
function makePool(overrides: Partial<PoolInfo> = {}): PoolInfo {
  return {
    signature:            'test_tx_sig',
    ammId:                'test_amm_id',
    coinMint:             TOKEN_MINT,
    pcMint:               WSOL_MINT,
    coinVault:            'coin_vault',
    pcVault:              'pc_vault',
    deployer:             DEPLOYER,
    openTime:             0,
    initPcAmountLamports: BigInt(10 * 1_000_000_000), // 10 SOL
    initCoinAmount:       BigInt(1_000_000),
    nonce:                0,
    detectedAt:           Date.now(),
    ...overrides,
  };
}

/** Mock: deployer heeft genoeg transacties */
function mockDeployerOk(count = 10) {
  mockGetSignaturesForAddress.mockResolvedValue(
    Array.from({ length: count }, (_, i) => ({ signature: `sig_${i}` }))
  );
}

/** Mock: Jupiter geeft succesvolle quote terug */
function mockJupiterSuccess(outAmount = '900000') {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok:   true,
    json: jest.fn().mockResolvedValue({ outAmount, routePlan: [] }),
  });
}

/** Mock: Jupiter geeft geen route terug */
function mockJupiterNoRoute() {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok:   false,
    json: jest.fn().mockResolvedValue({ error: 'COULD_NOT_FIND_ANY_ROUTE' }),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PoolFilter — 7 filterlagen', () => {
  let filter: PoolFilter;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    filter = new PoolFilter();
  });

  // ── Check 1: Blacklist ────────────────────────────────────────────────────

  describe('Check 1 — Blacklist', () => {
    it('weigert pool als deployer op de blacklist staat', async () => {
      const result = await filter.evaluate(makePool({ deployer: BLACKLISTED_DEPLOYER }));
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/blacklist/i);
    });

    it('weigert pool als token-mint op de blacklist staat', async () => {
      const result = await filter.evaluate(makePool({ coinMint: BLACKLISTED_TOKEN }));
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/blacklist/i);
    });

    it('laat pool door als noch deployer noch token op de blacklist staat', async () => {
      mockDeployerOk();
      mockJupiterSuccess();
      const result = await filter.evaluate(makePool());
      expect(result.reason ?? '').not.toMatch(/blacklist/i);
    });
  });

  // ── Check 2: SOL-pair ─────────────────────────────────────────────────────

  describe('Check 2 — SOL-pair', () => {
    it('weigert pool zonder WSOL aan een van de kanten', async () => {
      const result = await filter.evaluate(makePool({
        coinMint: TOKEN_MINT,
        pcMint:   'USDC1111111111111111111111111111111111111111',
      }));
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/SOL-pair/i);
    });

    it('accepteert pool waar WSOL de pcMint is', async () => {
      mockDeployerOk();
      mockJupiterSuccess();
      const result = await filter.evaluate(makePool({ pcMint: WSOL_MINT }));
      expect(result.reason ?? '').not.toMatch(/SOL-pair/i);
    });

    it('accepteert pool waar WSOL de coinMint is', async () => {
      mockDeployerOk();
      mockJupiterSuccess();
      const result = await filter.evaluate(makePool({ coinMint: WSOL_MINT, pcMint: TOKEN_MINT }));
      expect(result.reason ?? '').not.toMatch(/SOL-pair/i);
    });
  });

  // ── Check 3: Liquiditeit ──────────────────────────────────────────────────

  describe('Check 3 — Liquiditeit', () => {
    it('weigert pool met te lage liquiditeit (3 SOL < minimum 5 SOL)', async () => {
      const result = await filter.evaluate(makePool({
        initPcAmountLamports: BigInt(3 * 1_000_000_000),
      }));
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/liquiditeit/i);
    });

    it('accepteert pool met exact de minimum liquiditeit (5 SOL)', async () => {
      mockDeployerOk();
      mockJupiterSuccess();
      const result = await filter.evaluate(makePool({
        initPcAmountLamports: BigInt(5 * 1_000_000_000),
      }));
      expect(result.reason ?? '').not.toMatch(/liquiditeit/i);
    });

    it('accepteert pool met ruim voldoende liquiditeit (50 SOL)', async () => {
      mockDeployerOk();
      mockJupiterSuccess();
      const result = await filter.evaluate(makePool({
        initPcAmountLamports: BigInt(50 * 1_000_000_000),
      }));
      expect(result.reason ?? '').not.toMatch(/liquiditeit/i);
    });
  });

  // ── Check 4: Token age ────────────────────────────────────────────────────

  describe('Check 4 — Token age', () => {
    it('weigert pool die ouder is dan maxTokenAgeMs (60s)', async () => {
      const result = await filter.evaluate(makePool({
        detectedAt: Date.now() - 70_000, // 70 seconden geleden
      }));
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/te laat/i);
    });

    it('accepteert pool die recent gedetecteerd is (5s geleden)', async () => {
      mockDeployerOk();
      mockJupiterSuccess();
      const result = await filter.evaluate(makePool({
        detectedAt: Date.now() - 5_000,
      }));
      expect(result.reason).not.toMatch(/te laat/i);
    });
  });

  // ── Check 5: Open time ────────────────────────────────────────────────────

  describe('Check 5 — Open time', () => {
    it('weigert pool die te ver in de toekomst opent (10 min > max 5 min)', async () => {
      const openTime = Math.floor((Date.now() + 600_000) / 1000); // +10 min
      const result = await filter.evaluate(makePool({ openTime }));
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/opent pas/i);
    });

    it('accepteert pool met openTime=0 (direct)', async () => {
      mockDeployerOk();
      mockJupiterSuccess();
      const result = await filter.evaluate(makePool({ openTime: 0 }));
      expect(result.reason).not.toMatch(/opent pas/i);
    });

    it('accepteert pool die binnenkort opent (2 min < max 5 min)', async () => {
      mockDeployerOk();
      mockJupiterSuccess();
      const openTime = Math.floor((Date.now() + 120_000) / 1000); // +2 min
      const result = await filter.evaluate(makePool({ openTime }));
      expect(result.reason).not.toMatch(/opent pas/i);
    });
  });

  // ── Check 6: Deployer history ─────────────────────────────────────────────

  describe('Check 6 — Deployer history', () => {
    it('weigert pool van deployer met te weinig transacties (1 < minimum 5)', async () => {
      mockGetSignaturesForAddress.mockResolvedValue([{ signature: 'enige_tx' }]);
      const result = await filter.evaluate(makePool());
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/deployer/i);
    });

    it('accepteert pool van deployer met genoeg transacties (10 ≥ minimum 5)', async () => {
      mockDeployerOk(10);
      mockJupiterSuccess();
      const result = await filter.evaluate(makePool());
      expect(result.reason).not.toMatch(/deployer slechts/i);
    });

    it('weigert pool bij RPC-fout — fail closed (Sprint 2 fix)', async () => {
      mockGetSignaturesForAddress.mockRejectedValue(new Error('RPC timeout'));
      const result = await filter.evaluate(makePool());
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/RPC-fout/i);
    });
  });

  // ── Check 7: Honeypot simulatie ───────────────────────────────────────────

  describe('Check 7 — Honeypot simulatie', () => {
    beforeEach(() => {
      mockDeployerOk();
    });

    it('weigert pool als er geen koop-route beschikbaar is', async () => {
      mockJupiterNoRoute();
      const result = await filter.evaluate(makePool());
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/honeypot.*koop/i);
    });

    it('weigert pool als verkoop geblokkeerd is (sell blocked)', async () => {
      // Koop slaagt, verkoop mislukt
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true, json: jest.fn().mockResolvedValue({ outAmount: '900000' }),
        })
        .mockResolvedValue({
          ok: false, json: jest.fn().mockResolvedValue({ error: 'no route' }),
        });

      const result = await filter.evaluate(makePool());
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/honeypot.*verkoop/i);
    });

    it('weigert pool met te hoog round-trip verlies (50% > max 20%)', async () => {
      // SIM_LAMPORTS = 1_000_000 (0.001 SOL)
      // Koop: 1_000_000 → 900_000 tokens
      // Verkoop: 900_000 tokens → 500_000 lamports = 50% verlies
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true, json: jest.fn().mockResolvedValue({ outAmount: '900000' }),
        })
        .mockResolvedValueOnce({
          ok: true, json: jest.fn().mockResolvedValue({ outAmount: '500000' }),
        });

      const result = await filter.evaluate(makePool());
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/round-trip verlies/i);
    });

    it('laat pool door bij acceptabel round-trip verlies (13% < max 20%)', async () => {
      // Koop: 1_000_000 → 900_000 tokens
      // Verkoop: 900_000 tokens → 870_000 lamports = 13% verlies — OK
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true, json: jest.fn().mockResolvedValue({ outAmount: '900000' }),
        })
        .mockResolvedValueOnce({
          ok: true, json: jest.fn().mockResolvedValue({ outAmount: '870000' }),
        });

      const result = await filter.evaluate(makePool());
      expect(result.passed).toBe(true);
    });
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  describe('Happy path — alle 7 checks slagen', () => {
    it('keurt pool goed en retourneert correcte tokenMint en liquiditeit', async () => {
      mockDeployerOk();
      mockJupiterSuccess();

      const result = await filter.evaluate(makePool());

      expect(result.passed).toBe(true);
      expect(result.tokenMint).toBe(TOKEN_MINT);
      expect(result.liquiditySol).toBe(10);
    });

    it('detecteert tokenMint correct als WSOL de coinMint is', async () => {
      mockDeployerOk();
      mockJupiterSuccess();

      const result = await filter.evaluate(makePool({
        coinMint: WSOL_MINT,
        pcMint:   TOKEN_MINT,
      }));

      expect(result.passed).toBe(true);
      expect(result.tokenMint).toBe(TOKEN_MINT);
    });
  });
});
