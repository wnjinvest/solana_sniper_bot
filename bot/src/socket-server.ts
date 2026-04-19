/**
 * socket-server.ts
 *
 * Socket.io server die op poort 3001 luistert.
 * Ontvangt events van de event-bus en stuurt ze door naar verbonden
 * dashboard-clients. Ontvangt ook besturings-events (start/stop) van
 * het dashboard.
 *
 * Architectuur:
 *   Bot-modules → eventBus → SocketServer.io → Dashboard (ws://localhost:3001)
 *   Dashboard   → SocketServer.on('start_bot') → startCallback()
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Server }  from 'socket.io';
import { logger }  from './logger';
import { eventBus } from './event-bus';
import { config }  from './config';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  BotStatusEvent,
} from './socket-types';

export type StartCallback = (dryRun?: boolean, demoSpeed?: number) => void;
export type StopCallback  = () => void;
export type ConfigCallback = (key: string, value: string) => void;

const SOCKET_PORT = 3001;

// Teller voor gesloten trades en gefilterde pools (bijgehouden door server)
let _poolsFiltered  = 0;
let _tradesExecuted = 0;
let _tradesClosed   = 0;
let _startTime      = 0;
let _isRunning      = false;
// Initialiseer vanuit .env zodat het dashboard direct de juiste waarde ontvangt
let _isDryRun       = config.dryRun;

export class BotSocketServer {
  private readonly io:         Server<ClientToServerEvents, ServerToClientEvents>;
  private readonly httpServer: ReturnType<typeof createServer>;

  constructor(
    private readonly onStart:  StartCallback,
    private readonly onStop:   StopCallback,
    private readonly onConfig: ConfigCallback,
  ) {
    this.httpServer = createServer(
      (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200);
        res.end('SOL Sniper Bot — Socket.io server actief');
      }
    );

    this.io = new Server<ClientToServerEvents, ServerToClientEvents>(
      this.httpServer,
      {
        cors: { origin: true, methods: ['GET', 'POST'] },
      }
    );

    this.registerSocketHandlers();
    this.registerEventBusForwarding();
  }

  /** Start de HTTP/Socket.io server */
  listen(): void {
    this.httpServer.listen(SOCKET_PORT, '0.0.0.0', () => {
      logger.info(`[Socket] Server luistert op poort ${SOCKET_PORT}`);
    });
  }

  /** Sluit de server netjes */
  close(): void {
    this.io.close();
    this.httpServer.close();
  }

  /** Stuur een status-broadcast naar alle verbonden clients */
  broadcastStatus(listenerStats: {
    txSeen: number; init2Found: number; parsedOk: number;
    parseErrors: number; duplicates: number;
  }): void {
    const status: BotStatusEvent = {
      status: _isRunning ? 'running' : 'stopped',
      uptime: _isRunning ? Date.now() - _startTime : 0,
      dryRun: _isDryRun,
      stats: {
        ...listenerStats,
        poolsFiltered:  _poolsFiltered,
        tradesExecuted: _tradesExecuted,
        tradesClosed:   _tradesClosed,
      },
    };
    this.io.emit('bot_status', status);
  }

  // ── Privé: Socket event handlers ───────────────────────────────────────────

  private registerSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      logger.info(`[Socket] Dashboard verbonden: ${socket.id}`);

      // Stuur direct de DRY_RUN status naar de nieuw verbonden client
      socket.emit('dry_run_status', { timestamp: Date.now(), dryRun: _isDryRun });

      eventBus.emit('bot_log', {
        timestamp: Date.now(),
        level:     'info',
        message:   `[Socket] Dashboard verbonden (${socket.id})`,
      });

      socket.on('start_bot', (data) => {
        logger.info(`[Socket] start_bot ontvangen (dryRun=${data?.dryRun}, demoSpeed=${data?.demoSpeed})`);
        _isRunning = true;
        _startTime = Date.now();
        _isDryRun  = data?.dryRun ?? false;
        this.io.emit('dry_run_status', { timestamp: Date.now(), dryRun: _isDryRun });
        this.onStart(data?.dryRun, data?.demoSpeed);
      });

      socket.on('stop_bot', () => {
        logger.info('[Socket] stop_bot ontvangen');
        _isRunning = false;
        this.onStop();
      });

      socket.on('update_config', (data) => {
        logger.info(`[Socket] update_config: ${data.key}=${data.value}`);
        // Sync _isDryRun als DRY_RUN via API/socket wordt gewijzigd
        if (data.key === 'DRY_RUN') {
          _isDryRun = data.value === 'true';
          this.io.emit('dry_run_status', { timestamp: Date.now(), dryRun: _isDryRun });
        }
        this.onConfig(data.key, data.value);
      });

      socket.on('request_status', () => {
        logger.debug('[Socket] request_status ontvangen');
        // Stuur huidige status direct terug aan de verzoekende client
        socket.emit('dry_run_status', { timestamp: Date.now(), dryRun: _isDryRun });
        // broadcastStatus (met volledige stats) wordt elke 5s vanuit index.ts gestuurd
      });

      socket.on('get_config', () => {
        const keys = [
          'BUY_AMOUNT_SOL', 'SLIPPAGE_BPS', 'PRIORITY_FEE_MICRO_LAMPORTS',
          'TAKE_PROFIT_PERCENT', 'STOP_LOSS_PERCENT', 'MONITOR_INTERVAL_MS',
          'MIN_LIQUIDITY_SOL', 'MAX_TOKEN_AGE_MS', 'MIN_DEPLOYER_TX_COUNT',
          'HONEYPOT_MAX_LOSS_PCT', 'HONEYPOT_CHECK_ENABLED',
        ];
        const cfg: Record<string, string> = {};
        for (const k of keys) if (process.env[k] !== undefined) cfg[k] = process.env[k]!;
        socket.emit('config_data', cfg);
      });

      socket.on('disconnect', () => {
        logger.info(`[Socket] Dashboard verbroken: ${socket.id}`);
      });
    });
  }

  /** Luister op de event-bus en stuur elk event door naar Socket.io clients */
  private registerEventBusForwarding(): void {
    eventBus.on('pool_detected',  (data) => this.io.emit('pool_detected',  data));
    eventBus.on('pool_filtered',  (data) => {
      _poolsFiltered++;
      this.io.emit('pool_filtered', data);
    });
    eventBus.on('trade_executed', (data) => {
      _tradesExecuted++;
      this.io.emit('trade_executed', data);
    });
    eventBus.on('trade_closed',   (data) => {
      _tradesClosed++;
      this.io.emit('trade_closed', data);
    });
    eventBus.on('bot_log',        (data) => this.io.emit('bot_log',        data));
    eventBus.on('balance_update', (data) => this.io.emit('balance_update', data));
    eventBus.on('bot_status',     (data) => this.io.emit('bot_status',     data));
    eventBus.on('credit_stats',   (data) => this.io.emit('credit_stats',   data));
  }
}
