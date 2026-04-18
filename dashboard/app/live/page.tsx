'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Play, Square, Wallet, Radar, Filter,
  ShoppingCart, Zap, AlertTriangle, TrendingUp, WifiOff,
} from 'lucide-react';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { LogFeed } from '@/components/dashboard/log-feed';
import { ActiveTradesTable } from '@/components/dashboard/active-trades';
import { useBotSocket } from '@/hooks/use-bot-socket';
import { cn } from '@/lib/utils';

export default function LivePage() {
  const {
    connected, botStatus, dryRun, balanceSol,
    stats, logs, activeTrades, closedTrades,
    poolsDetected, poolsFiltered: filteredEvents,
    creditStats,
    startBot, stopBot,
  } = useBotSocket();

  const isRunning = botStatus === 'running';

  // ── Vandaag-statistieken ───────────────────────────────────────────────────
  const todayMs     = new Date().setHours(0, 0, 0, 0);
  const poolsToday  = poolsDetected.filter((p) => p.timestamp >= todayMs).length;
  const filteredToday = filteredEvents.filter((p) => p.timestamp >= todayMs).length;

  // ── Gesimuleerde P&L ───────────────────────────────────────────────────────
  const simTrades  = closedTrades.filter((t) => t.dryRun);
  const simPnlSol  = simTrades.reduce((s, t) => s + t.pnlSol, 0);
  const simWins    = simTrades.filter((t) => t.pnlPercent >= 0).length;
  const simWinRate = simTrades.length > 0
    ? Math.round((simWins / simTrades.length) * 100)
    : null;

  return (
    <div className="p-6 space-y-5">

      {/* ── Socket disconnect banner ──────────────────────────────────────── */}
      {!connected && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/40
                        bg-red-500/10 px-4 py-2.5">
          <WifiOff className="h-4 w-4 shrink-0 text-red-500" />
          <span className="text-sm font-medium text-red-500">
            Verbinding met bot verbroken — automatisch opnieuw verbinden…
          </span>
        </div>
      )}

      {/* ── DRY RUN banner ────────────────────────────────────────────────── */}
      {dryRun && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-500/40
                        bg-yellow-500/10 px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-500" />
          <span className="text-sm font-medium text-yellow-500">
            DRY RUN ACTIEF — Geen echte transacties worden uitgevoerd
          </span>
          <span className="ml-auto hidden text-xs text-yellow-500/60 sm:block">
            Schakel uit via Instellingen → <code>DRY_RUN=false</code>
          </span>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Monitor</h1>
          <p className="text-sm text-muted-foreground">Real-time bot activiteit</p>
        </div>
        <div className="flex items-center gap-2">
          {/* DRY RUN / LIVE mode indicator */}
          <ModeIndicator dryRun={dryRun} />
          <StatusBadge status={botStatus} connected={connected} />
          <Button
            size="sm"
            variant={isRunning ? 'destructive' : 'default'}
            onClick={() => isRunning ? stopBot() : startBot(dryRun)}
            disabled={!connected}
          >
            {isRunning
              ? <><Square className="mr-1.5 h-3.5 w-3.5" /> Stop Bot</>
              : <><Play  className="mr-1.5 h-3.5 w-3.5" /> Start Bot</>}
          </Button>
        </div>
      </div>

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
          label="Wallet Balance"
          value={`${balanceSol.toFixed(4)} SOL`}
        />
        <StatCard
          icon={<Radar className="h-4 w-4 text-muted-foreground" />}
          label="Pools Gedetecteerd"
          value={stats.parsedOk.toString()}
        />
        <StatCard
          icon={<Filter className="h-4 w-4 text-muted-foreground" />}
          label="Pools Gefilterd"
          value={stats.poolsFiltered.toString()}
        />
        <StatCard
          icon={<ShoppingCart className="h-4 w-4 text-muted-foreground" />}
          label="Trades"
          value={`${stats.tradesExecuted} / ${stats.tradesClosed} gesloten`}
        />
      </div>

      {/* ── Actieve trades ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Actieve Trades</CardTitle>
            {activeTrades.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {activeTrades.length}
              </Badge>
            )}
            {dryRun && activeTrades.length > 0 && (
              <Badge variant="outline"
                className="text-xs text-yellow-500 border-yellow-500/30 bg-yellow-500/10">
                gesimuleerd
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ActiveTradesTable trades={activeTrades} />
        </CardContent>
      </Card>

      {/* ── Log feed ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Log Feed</CardTitle>
            <span className="text-xs text-muted-foreground">laatste {logs.length} regels</span>
          </div>
        </CardHeader>
        <CardContent>
          <LogFeed logs={logs} />
        </CardContent>
      </Card>

      {/* ── Samenvatting onderaan ──────────────────────────────────────────── */}
      <div className={cn(
        'grid gap-4',
        dryRun ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'
      )}>

        {/* Pools vandaag */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Radar className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Pools Vandaag</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Gedetecteerd</p>
                <p className="text-2xl font-bold">{poolsToday}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Gefilterd</p>
                <p className="text-2xl font-bold text-muted-foreground">{filteredToday}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Credit tracker */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              <CardTitle className="text-base">Helius Credits</CardTitle>
              {creditStats && (
                <Badge variant="outline"
                  className="ml-auto text-xs text-green-500 border-green-500/30 bg-green-500/10">
                  {creditStats.savingsPct}% bespaard
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {creditStats ? (
              <div className="grid grid-cols-2 gap-3">
                <CreditRow label="Credits/uur"  value={creditStats.creditsPerHour.toFixed(1)} />
                <CreditRow label="Credits/maand" value={creditStats.creditsPerMonth.toLocaleString()} />
                <CreditRow
                  label="Doorgelaten"
                  value={`${creditStats.passRatePct}%`}
                  sub={`${creditStats.msgPassed}/${creditStats.msgTotal}`}
                />
                <CreditRow
                  label="Bespaard"
                  value={`${creditStats.savingsPct}%`}
                  sub={`${creditStats.msgDropped} geskipt`}
                  highlight
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Wachten op eerste update (elke 10 min)…</p>
            )}
          </CardContent>
        </Card>

        {/* Gesimuleerde P&L — alleen zichtbaar bij DRY RUN */}
        {dryRun && (
          <Card className="border-yellow-500/20 bg-yellow-500/5">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-yellow-500" />
                <CardTitle className="text-base text-yellow-500">Gesimuleerde P&L</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {simTrades.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen gesloten simulaties</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Totaal P&L</p>
                    <p className={cn(
                      'text-2xl font-bold',
                      simPnlSol >= 0 ? 'text-emerald-400' : 'text-red-400'
                    )}>
                      {simPnlSol >= 0 ? '+' : ''}{simPnlSol.toFixed(4)}
                      <span className="text-sm font-normal text-muted-foreground ml-1">SOL</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Win Rate</p>
                    <p className="text-2xl font-bold">
                      {simWinRate !== null ? `${simWinRate}%` : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">{simTrades.length} trades</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

function ModeIndicator({ dryRun }: { dryRun: boolean }) {
  return dryRun ? (
    <Badge variant="outline"
      className="gap-1.5 text-yellow-500 border-yellow-500/30 bg-yellow-500/10">
      <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
      DRY RUN
    </Badge>
  ) : (
    <Badge variant="outline"
      className="gap-1.5 text-emerald-500 border-emerald-500/30 bg-emerald-500/10">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      LIVE
    </Badge>
  );
}

function StatCard({
  icon, label, value,
}: {
  icon:  React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        {icon}
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CreditRow({
  label, value, sub, highlight,
}: {
  label:      string;
  value:      string;
  sub?:       string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-base font-semibold leading-tight', highlight && 'text-green-500')}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
