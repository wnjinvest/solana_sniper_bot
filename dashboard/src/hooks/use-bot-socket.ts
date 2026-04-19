import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '@/lib/socket';
import type {
  BotStatus,
  BotLogEvent,
  PoolDetectedEvent,
  PoolFilteredEvent,
  TradeExecutedEvent,
  TradeClosedEvent,
  BalanceUpdateEvent,
  BotStatusEvent,
  CreditStatsEvent,
  DryRunStatusEvent,
  ActiveTrade,
  ClosedTrade,
  FilterCategory,
} from '@/lib/types';

const MAX_LOGS        = 100;
const MAX_POOL_EVENTS = 200;
const PRICE_POLL_MS   = 10_000;
const WSOL_MINT       = 'So11111111111111111111111111111111111111112';

export interface BotState {
  connected:     boolean;
  botStatus:     BotStatus;
  botUptime:     number;
  dryRun:        boolean;
  balanceSol:    number;
  walletAddress: string;
  stats: {
    txSeen:         number;
    init2Found:     number;
    parsedOk:       number;
    poolsFiltered:  number;
    tradesExecuted: number;
    tradesClosed:   number;
  };
  filterCounts: Record<FilterCategory, number>;
  logs:          BotLogEvent[];
  poolsDetected: PoolDetectedEvent[];
  poolsFiltered: PoolFilteredEvent[];
  activeTrades:  ActiveTrade[];
  closedTrades:  ClosedTrade[];
  creditStats:   CreditStatsEvent | null;
}

export interface BotActions {
  startBot:  (dryRun?: boolean, demoSpeed?: number) => void;
  stopBot:   () => void;
}

const initialFilterCounts: Record<FilterCategory, number> = {
  liquidity: 0, age: 0, honeypot: 0, blacklist: 0,
  deployer: 0, sol_pair: 0, open_time: 0, other: 0,
};

const initialState: BotState = {
  connected:     false,
  botStatus:     'stopped',
  botUptime:     0,
  dryRun:        false,
  balanceSol:    0,
  walletAddress: '',
  stats: {
    txSeen: 0, init2Found: 0, parsedOk: 0,
    poolsFiltered: 0, tradesExecuted: 0, tradesClosed: 0,
  },
  filterCounts:  { ...initialFilterCounts },
  logs:          [],
  poolsDetected: [],
  poolsFiltered: [],
  activeTrades:  [],
  closedTrades:  [],
  creditStats:   null,
};

export function useBotSocket(): BotState & BotActions {
  const [state, setState]   = useState<BotState>(initialState);
  const socketRef           = useRef(getSocket());
  const activeTradesRef     = useRef<ActiveTrade[]>([]);

  activeTradesRef.current = state.activeTrades;

  // ── Live prijspolling ─────────────────────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      const trades = activeTradesRef.current;
      if (trades.length === 0) return;

      const mints = trades.map((t) => t.tokenMint).join(',');
      try {
        const res = await fetch(
          `/api/price?ids=${encodeURIComponent(mints)}&vsToken=${WSOL_MINT}`
        );
        if (!res.ok) return;

        const json = await res.json() as { data?: Record<string, { price?: string }> };
        if (!json.data) return;

        setState((prev) => ({
          ...prev,
          activeTrades: prev.activeTrades.map((trade) => {
            const priceStr = json.data?.[trade.tokenMint]?.price;
            if (!priceStr) return trade;
            const currentPriceSol = parseFloat(priceStr);
            if (!isFinite(currentPriceSol) || currentPriceSol <= 0) return trade;
            const pnlPercent = trade.entryPriceSol > 0
              ? ((currentPriceSol - trade.entryPriceSol) / trade.entryPriceSol) * 100
              : null;
            return { ...trade, currentPriceSol, pnlPercent };
          }),
        }));
      } catch { /* network not available */ }
    };

    const timer = setInterval(poll, PRICE_POLL_MS);
    return () => clearInterval(timer);
  }, []);

  // ── Socket event handlers ─────────────────────────────────────────────────
  useEffect(() => {
    const s = socketRef.current;

    const onConnect = () =>
      setState((prev) => ({ ...prev, connected: true }));

    const onDisconnect = () =>
      setState((prev) => ({ ...prev, connected: false, botStatus: 'stopped' }));

    const onBotStatus = (data: BotStatusEvent) =>
      setState((prev) => ({
        ...prev,
        botStatus: data.status,
        botUptime: data.uptime,
        dryRun:    data.dryRun,
        stats: {
          txSeen:         data.stats.txSeen,
          init2Found:     data.stats.init2Found,
          parsedOk:       data.stats.parsedOk,
          poolsFiltered:  data.stats.poolsFiltered,
          tradesExecuted: data.stats.tradesExecuted,
          tradesClosed:   data.stats.tradesClosed,
        },
      }));

    const onBalanceUpdate = (data: BalanceUpdateEvent) =>
      setState((prev) => ({ ...prev, balanceSol: data.balanceSol }));

    const onBotLog = (data: BotLogEvent) =>
      setState((prev) => ({
        ...prev,
        logs: [data, ...prev.logs].slice(0, MAX_LOGS),
      }));

    const onPoolDetected = (data: PoolDetectedEvent) =>
      setState((prev) => ({
        ...prev,
        poolsDetected: [data, ...prev.poolsDetected].slice(0, MAX_POOL_EVENTS),
        stats: { ...prev.stats, parsedOk: prev.stats.parsedOk + 1 },
      }));

    const onPoolFiltered = (data: PoolFilteredEvent) =>
      setState((prev) => ({
        ...prev,
        poolsFiltered: [data, ...prev.poolsFiltered].slice(0, MAX_POOL_EVENTS),
        filterCounts: {
          ...prev.filterCounts,
          [data.category]: (prev.filterCounts[data.category] ?? 0) + 1,
        },
        stats: { ...prev.stats, poolsFiltered: prev.stats.poolsFiltered + 1 },
      }));

    const onTradeExecuted = (data: TradeExecutedEvent) =>
      setState((prev) => {
        if (prev.activeTrades.some((t) => t.tokenMint === data.tokenMint)) return prev;
        const trade: ActiveTrade = {
          tokenMint:       data.tokenMint,
          entryTimestamp:  data.timestamp,
          inputSol:        data.inputSol,
          outputTokens:    data.outputTokens,
          currentPriceSol: null,
          entryPriceSol:   data.inputSol / Math.max(Number(data.outputTokens || 1), 1),
          pnlPercent:      null,
          dryRun:          data.dryRun,
        };
        return {
          ...prev,
          activeTrades: [...prev.activeTrades, trade],
          stats: { ...prev.stats, tradesExecuted: prev.stats.tradesExecuted + 1 },
        };
      });

    const onTradeClosed = (data: TradeClosedEvent) =>
      setState((prev) => {
        const active = prev.activeTrades.find((t) => t.tokenMint === data.tokenMint);
        if (!active) return prev;
        const closed: ClosedTrade = {
          ...active,
          closeTimestamp: data.timestamp,
          closeReason:    data.closeReason,
          pnlSol:         data.pnlSol,
          pnlPercent:     data.pnlPercent,
          durationMs:     data.durationMs,
        };
        return {
          ...prev,
          activeTrades: prev.activeTrades.filter((t) => t.tokenMint !== data.tokenMint),
          closedTrades: [closed, ...prev.closedTrades],
          stats: { ...prev.stats, tradesClosed: prev.stats.tradesClosed + 1 },
        };
      });

    const onCreditStats = (data: CreditStatsEvent) =>
      setState((prev) => ({ ...prev, creditStats: data }));

    const onDryRunStatus = (data: DryRunStatusEvent) =>
      setState((prev) => ({ ...prev, dryRun: data.dryRun }));

    s.on('connect',        onConnect);
    s.on('disconnect',     onDisconnect);
    s.on('bot_status',     onBotStatus);
    s.on('balance_update', onBalanceUpdate);
    s.on('bot_log',        onBotLog);
    s.on('pool_detected',  onPoolDetected);
    s.on('pool_filtered',  onPoolFiltered);
    s.on('trade_executed', onTradeExecuted);
    s.on('trade_closed',   onTradeClosed);
    s.on('credit_stats',   onCreditStats);
    s.on('dry_run_status', onDryRunStatus);

    if (s.connected) {
      setState((prev) => ({ ...prev, connected: true }));
      s.emit('request_status');
    }

    return () => {
      s.off('connect',        onConnect);
      s.off('disconnect',     onDisconnect);
      s.off('bot_status',     onBotStatus);
      s.off('balance_update', onBalanceUpdate);
      s.off('bot_log',        onBotLog);
      s.off('pool_detected',  onPoolDetected);
      s.off('pool_filtered',  onPoolFiltered);
      s.off('trade_executed', onTradeExecuted);
      s.off('trade_closed',   onTradeClosed);
      s.off('credit_stats',   onCreditStats);
      s.off('dry_run_status', onDryRunStatus);
    };
  }, []);

  const startBot = useCallback((dryRun?: boolean, demoSpeed?: number) => {
    socketRef.current.emit('start_bot', { dryRun, demoSpeed });
  }, []);

  const stopBot = useCallback(() => {
    socketRef.current.emit('stop_bot');
  }, []);

  return { ...state, startBot, stopBot };
}
