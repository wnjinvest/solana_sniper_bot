import dotenv from 'dotenv';
import path from 'path';

// Laad .env vanuit de project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Ontbrekende verplichte omgevingsvariabele: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const config = {
  // Helius
  helius: {
    apiKey:  requireEnv('HELIUS_API_KEY'),
    rpcUrl:  requireEnv('HELIUS_RPC_URL'),
    wsUrl:   requireEnv('HELIUS_WS_URL'),
  },

  // Wallet
  wallet: {
    privateKey: requireEnv('WALLET_PRIVATE_KEY'),
  },

  // Jupiter
  // lite-api.jup.ag is de fallback wanneer quote-api.jup.ag niet bereikbaar is
  jupiter: {
    apiUrl: optionalEnv('JUPITER_API_URL', 'https://lite-api.jup.ag/swap/v1'),
  },

  // Raydium
  raydium: {
    ammProgramId: optionalEnv(
      'RAYDIUM_AMM_PROGRAM_ID',
      '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'
    ),
  },

  // Swap
  swap: {
    buyAmountSol:             parseFloat(optionalEnv('BUY_AMOUNT_SOL', '0.05')),
    slippageBps:              parseInt(optionalEnv('SLIPPAGE_BPS', '300'), 10),
    priorityFeeMicroLamports: parseInt(optionalEnv('PRIORITY_FEE_MICRO_LAMPORTS', '100000'), 10),
    maxRetries:               parseInt(optionalEnv('SWAP_MAX_RETRIES', '3'), 10),
    retryDelayMs:             parseInt(optionalEnv('SWAP_RETRY_DELAY_MS', '500'), 10),
  },

  // Take Profit / Stop Loss
  tpsl: {
    takeProfitPercent: parseFloat(optionalEnv('TAKE_PROFIT_PERCENT', '50')),
    stopLossPercent:   parseFloat(optionalEnv('STOP_LOSS_PERCENT', '20')),
    monitorIntervalMs: parseInt(optionalEnv('MONITOR_INTERVAL_MS', '5000'), 10),
  },

  // Filtering
  filter: {
    // Liquiditeit
    minLiquiditySol:     parseFloat(optionalEnv('MIN_LIQUIDITY_SOL', '5')),
    minTokenSupply:      parseFloat(optionalEnv('MIN_TOKEN_SUPPLY', '1000000')),

    // Token age: pools ouder dan deze waarde worden overgeslagen (te laat om te snipen)
    maxTokenAgeMs:       parseInt(optionalEnv('MAX_TOKEN_AGE_MS', '60000'), 10),

    // Pool open-time: pools die langer dan dit in de toekomst openen worden overgeslagen
    maxOpenTimeFutureMs: parseInt(optionalEnv('MAX_OPEN_TIME_FUTURE_MS', '600000'), 10),

    // Deployer history
    minDeployerTxCount:  parseInt(optionalEnv('MIN_DEPLOYER_TX_COUNT', '10'), 10),

    // Honeypot simulatie
    honeypotCheckEnabled:  optionalEnv('HONEYPOT_CHECK_ENABLED', 'true') === 'true',
    honeypotSimAmountSol:  parseFloat(optionalEnv('HONEYPOT_SIM_AMOUNT_SOL', '0.001')),
    honeypotMaxLossPct:    parseFloat(optionalEnv('HONEYPOT_MAX_LOSS_PCT', '20')),
    honeypotSimSlippageBps: parseInt(optionalEnv('HONEYPOT_SIM_SLIPPAGE_BPS', '500'), 10),
  },

  // Dry run — simuleert alles maar stuurt GEEN echte transacties
  dryRun: optionalEnv('DRY_RUN', 'false') === 'true',

  // Logging
  logLevel: optionalEnv('LOG_LEVEL', 'info'),
} as const;
