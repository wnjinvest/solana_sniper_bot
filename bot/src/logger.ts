import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { config } from './config';

// Zorg dat de logs-map bestaat vóór Winston de file-transports aanmaakt
const logsDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format: [tijdstip] LEVEL  bericht  (stack bij errors)
const logFormat = printf(({ level, message, timestamp: ts, stack }) => {
  const base = `[${ts}] ${level.toUpperCase().padEnd(5)}  ${message}`;
  return stack ? `${base}\n${stack}` : base;
});

// ── Custom Winston transport → event-bus ──────────────────────────────────────
// We importeren de event-bus lazy (via require) om circulaire imports te voorkomen.
// logger.ts wordt als eerste geladen; event-bus.ts importeert logger.ts niet.

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

class EventBusTransport extends winston.transports.Stream {
  constructor() {
    // Stream transport verwacht een Writable stream — we overschrijven log()
    const { Writable } = require('stream') as typeof import('stream');
    const noop = new Writable({ write: (_c: unknown, _e: unknown, cb: () => void) => cb() });
    super({ stream: noop });
  }

  override log(
    info: { level: string; message: string },
    callback: () => void
  ): void {
    // Lazy import om circulaire dependencies te vermijden
    try {
      const { eventBus } = require('./event-bus') as typeof import('./event-bus');
      const level = (['info', 'warn', 'error', 'debug'].includes(info.level)
        ? info.level
        : 'info') as LogLevel;

      eventBus.emit('bot_log', {
        timestamp: Date.now(),
        level,
        message:   String(info.message),
      });
    } catch {
      // event-bus nog niet geladen — stilletjes overslaan
    }
    callback();
  }
}

// ── Logger instantie ──────────────────────────────────────────────────────────

export const logger = winston.createLogger({
  level: config.logLevel,
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    logFormat
  ),
  transports: [
    // Console output met kleuren
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),
        errors({ stack: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        logFormat
      ),
    }),
    // Algemeen logbestand
    new winston.transports.File({
      filename: path.resolve(process.cwd(), 'logs', 'bot.log'),
      maxsize:  10 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),
    // Alleen errors in apart bestand
    new winston.transports.File({
      level:    'error',
      filename: path.resolve(process.cwd(), 'logs', 'error.log'),
      maxsize:  5 * 1024 * 1024,
      maxFiles: 3,
    }),
    // Socket.io event-bus transport (stuurt logs naar dashboard)
    new EventBusTransport(),
  ],
});
