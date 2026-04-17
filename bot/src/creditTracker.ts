/**
 * creditTracker.ts
 *
 * Bijhoudt Helius WebSocket credit-verbruik en meet de besparing
 * van de pre-filter op initialize2 berichten.
 *
 * Helius tarief: 2 credits per 0.1 MB ontvangen data = 20 credits/MB
 *
 * Werking:
 *  - Elke ontvangen byte wordt geteld via addBytes()
 *  - logsNotification-berichten zonder "initialize2" worden geteld via addDropped()
 *  - Berichten die de filter passeren worden geteld via addPassed()
 *  - Elke LOG_INTERVAL_MS worden de stats gelogd en via event-bus verstuurd
 */

import { logger }   from './logger';
import { eventBus } from './event-bus';

/** Helius: 2 credits per 0.1 MB = 20 credits per MB */
const CREDITS_PER_BYTE = 2 / (0.1 * 1_048_576);   // ≈ 1.907e-5 credits/byte

/** Log-interval: elke 10 minuten */
const LOG_INTERVAL_MS = 10 * 60_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreditStats {
  timestamp:       number;
  bytesReceived:   number;  // totaal ontvangen bytes
  creditsUsed:     number;  // geschatte credits verbruikt
  creditsPerHour:  number;  // huidig verbruiksritme
  creditsPerMonth: number;  // geprojecteerd maandelijks verbruik
  msgTotal:        number;  // totaal logsNotification berichten
  msgPassed:       number;  // berichten met initialize2 (doorgelaten)
  msgDropped:      number;  // berichten zonder initialize2 (weggegooid)
  passRatePct:     number;  // % doorgelaten
  savingsPct:      number;  // % weggegooid (besparing)
}

// ── CreditTracker ─────────────────────────────────────────────────────────────

class CreditTracker {
  private bytesReceived = 0;
  private msgTotal      = 0;
  private msgPassed     = 0;
  private msgDropped    = 0;
  private startTime     = Date.now();
  private timer:        NodeJS.Timeout | null = null;

  /** Start de periodieke log-timer */
  start(): void {
    this.startTime = Date.now();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.flush(), LOG_INTERVAL_MS);
    logger.info('[Credits] Tracking gestart (log elke 10 min).');
  }

  /** Stop de timer */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Registreer ontvangen bytes (elk WebSocket-bericht, vóór pre-filter) */
  addBytes(n: number): void {
    this.bytesReceived += n;
  }

  /** Registreer een logsNotification-bericht dat is ontvangen */
  addMessage(): void {
    this.msgTotal++;
  }

  /** Registreer dat een bericht de pre-filter heeft gepasseerd (had initialize2) */
  addPassed(): void {
    this.msgPassed++;
  }

  /** Registreer dat een bericht door de pre-filter is weggegooid (geen initialize2) */
  addDropped(): void {
    this.msgDropped++;
  }

  /** Bereken huidige statistieken */
  getStats(): CreditStats {
    const elapsedMs    = Math.max(Date.now() - this.startTime, 1);
    const elapsedHours = elapsedMs / 3_600_000;

    const creditsUsed    = this.bytesReceived * CREDITS_PER_BYTE;
    const creditsPerHour = creditsUsed / elapsedHours;

    const passRatePct = this.msgTotal > 0
      ? (this.msgPassed  / this.msgTotal) * 100
      : 0;
    const savingsPct  = this.msgTotal > 0
      ? (this.msgDropped / this.msgTotal) * 100
      : 0;

    return {
      timestamp:       Date.now(),
      bytesReceived:   this.bytesReceived,
      creditsUsed:     Math.round(creditsUsed * 100) / 100,
      creditsPerHour:  Math.round(creditsPerHour * 10) / 10,
      creditsPerMonth: Math.round(creditsPerHour * 24 * 30),
      msgTotal:        this.msgTotal,
      msgPassed:       this.msgPassed,
      msgDropped:      this.msgDropped,
      passRatePct:     Math.round(passRatePct * 10) / 10,
      savingsPct:      Math.round(savingsPct * 10) / 10,
    };
  }

  /** Log stats en emit naar dashboard */
  flush(): void {
    const s  = this.getStats();
    const mb = (s.bytesReceived / 1_048_576).toFixed(2);

    logger.info(
      `[Credits] ${s.creditsUsed.toFixed(1)} credits | ` +
      `${mb} MB | ` +
      `Doorgelaten: ${s.passRatePct}% (${s.msgPassed}/${s.msgTotal}) | ` +
      `Bespaard: ${s.savingsPct}% | ` +
      `~${s.creditsPerHour}/uur | ~${s.creditsPerMonth}/maand`
    );

    eventBus.emit('credit_stats', s);
  }
}

export const creditTracker = new CreditTracker();
