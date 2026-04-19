import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Square, Wallet, Radar, Filter, ShoppingCart, Zap, AlertTriangle, TrendingUp, WifiOff } from 'lucide-react';
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

  const isRunning  = botStatus === 'running';
  const todayMs    = new Date().setHours(0, 0, 0, 0);
  const poolsToday = poolsDetected.filter((p) => p.timestamp >= todayMs).length;
  const filteredToday = filteredEvents.filter((p) => p.timestamp >= todayMs).length;

  return (
    <div className="p-6 space-y-6">
      {/* Disconnect banner */}
      {!connected && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          <WifiOff className="h-4 w-4 shrink-0" />
          Verbinding met bot verbroken — automatisch opnieuw verbinden…
        </div>
      )}

      {/* DRY RUN banner */}
      {dryRun && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          DRY RUN — geen echte transacties
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Monitor</h1>
          <p className="text-sm text-muted-foreground">Real-time bot activiteit</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-1.5 text-emerald-400 border-emerald-400/30">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />LIVE
          </Badge>
          <StatusBadge status={botStatus} connected={connected} />
          <Button
            size="sm"
            variant={isRunning ? 'destructive' : 'default'}
            onClick={isRunning ? stopBot : () => startBot(false)}
            disabled={!connected}
          >
            {isRunning
              ? <><Square className="mr-1.5 h-3.5 w-3.5" /> Stop Bot</>
              : <><Play   className="mr-1.5 h-3.5 w-3.5" /> Start Bot</>
            }
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Wallet className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Wallet Balance</p>
              <p className="text-lg font-bold">{balanceSol.toFixed(4)} SOL</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Radar className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Pools Gedetecteerd</p>
              <p className="text-lg font-bold">{poolsToday}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Filter className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Pools Gefilterd</p>
              <p className="text-lg font-bold">{filteredToday}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <ShoppingCart className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Trades</p>
              <p className="text-lg font-bold">{stats.tradesExecuted} / {closedTrades.length} gesloten</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actieve trades */}
      <Card>
        <CardHeader><CardTitle className="text-base">Actieve Trades</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ActiveTradesTable trades={activeTrades} />
        </CardContent>
      </Card>

      {/* Log feed */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Log Feed</CardTitle>
          <span className="text-xs text-muted-foreground">laatste {logs.length} regels</span>
        </CardHeader>
        <CardContent>
          <LogFeed logs={logs} className="h-[300px]" />
        </CardContent>
      </Card>

      {/* Vandaag + credits */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Pools Vandaag</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><p className="text-muted-foreground text-xs">Gezien</p><p className="font-bold">{stats.txSeen}</p></div>
              <div><p className="text-muted-foreground text-xs">Parsed</p><p className="font-bold">{stats.parsedOk}</p></div>
              <div><p className="text-muted-foreground text-xs">Gefilterd</p><p className="font-bold">{stats.poolsFiltered}</p></div>
              <div><p className="text-muted-foreground text-xs">Trades</p><p className="font-bold">{stats.tradesExecuted}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4" /> Helius Credits</CardTitle></CardHeader>
          <CardContent>
            {creditStats ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><p className="text-muted-foreground text-xs">Gebruikt</p><p className="font-bold">{creditStats.creditsUsed.toLocaleString()}</p></div>
                <div><p className="text-muted-foreground text-xs">Per uur</p><p className="font-bold">{Math.round(creditStats.creditsPerHour).toLocaleString()}</p></div>
                <div><p className="text-muted-foreground text-xs">Berichten</p><p className="font-bold">{creditStats.msgTotal}</p></div>
                <div><p className="text-muted-foreground text-xs">Pass rate</p><p className="font-bold">{creditStats.passRatePct.toFixed(1)}%</p></div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nog geen data</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
