/**
 * event-bus.ts
 *
 * Singleton EventEmitter die als interne message-bus dient.
 * Modules in de bot emitteren events hier naartoe; de Socket.io
 * server luistert op deze bus en stuurt events door naar het dashboard.
 *
 * Gebruik:
 *   import { eventBus } from './event-bus';
 *   eventBus.emit('pool_detected', poolInfo);
 */

import { EventEmitter } from 'events';
import type {
  PoolDetectedEvent,
  PoolFilteredEvent,
  TradeExecutedEvent,
  TradeClosedEvent,
  BotLogEvent,
  BalanceUpdateEvent,
  BotStatusEvent,
  CreditStatsEvent,
} from './socket-types';

// TypeScript-typed EventEmitter
export interface BotEventMap {
  pool_detected:  [PoolDetectedEvent];
  pool_filtered:  [PoolFilteredEvent];
  trade_executed: [TradeExecutedEvent];
  trade_closed:   [TradeClosedEvent];
  bot_log:        [BotLogEvent];
  balance_update: [BalanceUpdateEvent];
  bot_status:     [BotStatusEvent];
  credit_stats:   [CreditStatsEvent];
}

class BotEventBus extends EventEmitter {
  emit<K extends keyof BotEventMap>(event: K, ...args: BotEventMap[K]): boolean {
    return super.emit(event as string, ...args);
  }

  on<K extends keyof BotEventMap>(
    event: K,
    listener: (...args: BotEventMap[K]) => void
  ): this {
    return super.on(event as string, listener as (...args: unknown[]) => void);
  }

  off<K extends keyof BotEventMap>(
    event: K,
    listener: (...args: BotEventMap[K]) => void
  ): this {
    return super.off(event as string, listener as (...args: unknown[]) => void);
  }
}

export const eventBus = new BotEventBus();
// Voorkom NodeJS "MaxListenersExceededWarning" bij veel modules
eventBus.setMaxListeners(50);
