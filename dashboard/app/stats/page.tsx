'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useBotSocket } from '@/hooks/use-bot-socket';
import { cn } from '@/lib/utils';
import type { FilterCategory } from '@/lib/types';

const FILTER_LABELS: Record<FilterCategory, string> = {
  liquidity: 'Liquiditeit',
  age:       'Te oud',
  honeypot:  'Honeypot',
  blacklist: 'Blacklist',
  deployer:  'Deployer',
  sol_pair:  'Geen SOL-pair',
  open_time: 'Open-time',
  other:     'Overig',
};

const PIE_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#94a3b8',
];

export default function StatsPage() {
  const { closedTrades, filterCounts, stats } = useBotSocket();

  // ── Berekende statistieken ─────────────────────────────────────────────────
  const totalPnlSol = closedTrades.reduce((s, t) => s + t.pnlSol, 0);
  const wins        = closedTrades.filter((t) => t.pnlPercent >= 0);
  const losses      = closedTrades.filter((t) => t.pnlPercent < 0);
  const winRate     = closedTrades.length > 0
    ? (wins.length / closedTrades.length) * 100
    : 0;

  const avgDurationMs = closedTrades.length > 0
    ? closedTrades.reduce((s, t) => s + t.durationMs, 0) / closedTrades.length
    : 0;

  const bestTrade  = closedTrades.reduce<typeof closedTrades[0] | null>(
    (b, t) => (b === null || t.pnlPercent > b.pnlPercent) ? t : b, null
  );
  const worstTrade = closedTrades.reduce<typeof closedTrades[0] | null>(
    (w, t) => (w === null || t.pnlPercent < w.pnlPercent) ? t : w, null
  );

  // ── Dagelijkse P&L voor lijn-chart ─────────────────────────────────────────
  const dailyPnl = useMemo(() => {
    const byDay: Record<string, { pnlSol: number; trades: number }> = {};
    closedTrades.forEach((t) => {
      const day = new Date(t.closeTimestamp).toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = { pnlSol: 0, trades: 0 };
      byDay[day].pnlSol  += t.pnlSol;
      byDay[day].trades  += 1;
    });
    return Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));
  }, [closedTrades]);

  // ── Filter pie-chart data ──────────────────────────────────────────────────
  const pieData = Object.entries(filterCounts)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => ({
      name:  FILTER_LABELS[key as FilterCategory],
      value: count,
    }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Statistieken</h1>
        <p className="text-sm text-muted-foreground">Historisch overzicht van alle trades</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Totale P&L"
          value={`${totalPnlSol >= 0 ? '+' : ''}${totalPnlSol.toFixed(4)} SOL`}
          positive={totalPnlSol >= 0} />
        <KpiCard label="Win Rate"
          value={`${winRate.toFixed(1)}%`}
          positive={winRate >= 50} />
        <KpiCard label="Gem. Trade Duur"
          value={avgDurationMs > 0 ? `${(avgDurationMs / 1000).toFixed(0)}s` : '—'} />
        <KpiCard label="Totale Trades"
          value={`${closedTrades.length} (${wins.length}W / ${losses.length}L)`} />
      </div>

      {/* Best / worst */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-emerald-500">Beste Trade</CardTitle>
          </CardHeader>
          <CardContent>
            {bestTrade ? (
              <div className="space-y-1">
                <p className="font-mono text-xs text-muted-foreground">
                  {bestTrade.tokenMint.slice(0, 8)}…
                </p>
                <p className="text-2xl font-bold text-emerald-400">
                  +{bestTrade.pnlPercent.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  +{bestTrade.pnlSol.toFixed(4)} SOL
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Geen data</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-red-500">Slechtste Trade</CardTitle>
          </CardHeader>
          <CardContent>
            {worstTrade ? (
              <div className="space-y-1">
                <p className="font-mono text-xs text-muted-foreground">
                  {worstTrade.tokenMint.slice(0, 8)}…
                </p>
                <p className="text-2xl font-bold text-red-400">
                  {worstTrade.pnlPercent.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  {worstTrade.pnlSol.toFixed(4)} SOL
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Geen data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lijn-chart P&L */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dagelijkse P&L (SOL)</CardTitle>
        </CardHeader>
        <CardContent>
          {dailyPnl.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nog geen gesloten trades
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyPnl}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border:          '1px solid hsl(var(--border))',
                    borderRadius:    '6px',
                    fontSize:        12,
                  }}
                />
                <Line
                  type="monotone" dataKey="pnlSol" name="P&L (SOL)"
                  stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Filter pie chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pools Gefilterd per Reden</CardTitle>
        </CardHeader>
        <CardContent>
          {pieData.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nog geen filter-events ontvangen
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={pieData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={90} label
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label, value, positive,
}: {
  label:     string;
  value:     string;
  positive?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-xl font-bold mt-1', {
          'text-emerald-400': positive === true,
          'text-red-400':     positive === false,
        })}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
