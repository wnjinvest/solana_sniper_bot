import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Play, Square, FlaskConical } from 'lucide-react';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { LogFeed } from '@/components/dashboard/log-feed';
import { useBotSocket } from '@/hooks/use-bot-socket';
import { cn } from '@/lib/utils';
import { getSocket } from '@/lib/socket';

export default function DemoPage() {
  const { connected, botStatus, logs, closedTrades, startBot, stopBot } = useBotSocket();
  const [speed, setSpeed] = useState('1');

  const [koopBedrag,      setKoopBedrag]      = useState(0.01);
  const [minLiquiditeit,  setMinLiquiditeit]  = useState(5);
  const [tokenLeeftijd,   setTokenLeeftijd]   = useState(60000);
  const [honeypotVerlies, setHoneypotVerlies] = useState(20);
  const [deployerTxCount, setDeployerTxCount] = useState(10);
  const [takeProfit,      setTakeProfit]      = useState(50);
  const [stopLoss,        setStopLoss]        = useState(20);

  const isRunning = botStatus === 'running';

  function handleStart() {
    const s = getSocket();
    s.emit('update_config', { key: 'BUY_AMOUNT_SOL',       value: String(koopBedrag) });
    s.emit('update_config', { key: 'MIN_LIQUIDITY_SOL',    value: String(minLiquiditeit) });
    s.emit('update_config', { key: 'MAX_TOKEN_AGE_MS',     value: String(tokenLeeftijd) });
    s.emit('update_config', { key: 'HONEYPOT_MAX_LOSS_PCT',value: String(honeypotVerlies) });
    s.emit('update_config', { key: 'MIN_DEPLOYER_TX_COUNT',value: String(deployerTxCount) });
    s.emit('update_config', { key: 'TAKE_PROFIT_PERCENT',  value: String(takeProfit) });
    s.emit('update_config', { key: 'STOP_LOSS_PERCENT',    value: String(stopLoss) });
    startBot(true);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Demo Simulatie</h1>
          <p className="text-sm text-muted-foreground">Test de bot in DRY RUN modus met eigen parameters</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-yellow-500 border-yellow-500/30 bg-yellow-500/10">DRY RUN</Badge>
          <StatusBadge status={botStatus} connected={connected} />
          <Button size="sm" variant={isRunning ? 'destructive' : 'default'} onClick={isRunning ? stopBot : handleStart} disabled={!connected}>
            {isRunning ? <><Square className="mr-1.5 h-3.5 w-3.5" /> Stop Demo</> : <><Play className="mr-1.5 h-3.5 w-3.5" /> Start Demo</>}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Parameters</CardTitle>
            <CardDescription>Pas aan zonder .env te bewerken</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {[
              { label: 'Koop-bedrag per trade', value: koopBedrag, unit: 'SOL', min: 0.001, max: 1, step: 0.001, set: setKoopBedrag, fmt: (v: number) => `${v} SOL` },
              { label: 'Min. liquiditeit',      value: minLiquiditeit, unit: 'SOL', min: 1, max: 50, step: 1, set: setMinLiquiditeit, fmt: (v: number) => `${v} SOL` },
              { label: 'Max. token leeftijd',   value: tokenLeeftijd, unit: 's', min: 10000, max: 120000, step: 5000, set: setTokenLeeftijd, fmt: (v: number) => `${v / 1000}s` },
              { label: 'Max. honeypot verlies', value: honeypotVerlies, unit: '%', min: 5, max: 50, step: 1, set: setHoneypotVerlies, fmt: (v: number) => `${v}%` },
              { label: 'Min. deployer transacties', value: deployerTxCount, unit: '', min: 1, max: 50, step: 1, set: setDeployerTxCount, fmt: (v: number) => `${v}` },
            ].map(({ label, value, min, max, step, set, fmt }) => (
              <div key={label} className="space-y-1">
                <div className="flex justify-between">
                  <Label className="text-sm">{label}</Label>
                  <span className="text-sm font-mono font-semibold">{fmt(value)}</span>
                </div>
                <input type="range" min={min} max={max} step={step} value={value}
                  onChange={(e) => set(parseFloat(e.target.value))} className="w-full" />
              </div>
            ))}
            <Separator />
            {[
              { label: 'Take Profit', value: takeProfit, min: 10, max: 500, step: 5, set: setTakeProfit, fmt: (v: number) => `${v}%` },
              { label: 'Stop Loss',   value: stopLoss,   min: 5,  max: 90,  step: 5, set: setStopLoss,   fmt: (v: number) => `${v}%` },
            ].map(({ label, value, min, max, step, set, fmt }) => (
              <div key={label} className="space-y-1">
                <div className="flex justify-between">
                  <Label className="text-sm">{label}</Label>
                  <span className="text-sm font-mono font-semibold">{fmt(value)}</span>
                </div>
                <input type="range" min={min} max={max} step={step} value={value}
                  onChange={(e) => set(parseFloat(e.target.value))} className="w-full" />
              </div>
            ))}
            <Separator />
            <div className="flex items-center justify-between">
              <Label>Simulatiesnelheid</Label>
              <Select value={speed} onValueChange={(v) => setSpeed(v ?? '1')}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1×</SelectItem>
                  <SelectItem value="5">5×</SelectItem>
                  <SelectItem value="10">10×</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Simulatie Log</CardTitle></CardHeader>
          <CardContent><LogFeed logs={logs} className="h-[430px]" /></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Demo Resultaten</CardTitle>
          <CardDescription>{closedTrades.length} gesimuleerde trades</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {closedTrades.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Start de demo om gesimuleerde trades te zien</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead className="text-right">Inzet</TableHead>
                  <TableHead className="text-right">P&L SOL</TableHead>
                  <TableHead className="text-right">P&L %</TableHead>
                  <TableHead>Reden</TableHead>
                  <TableHead className="text-right">Duur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closedTrades.map((t, i) => {
                  const pos = t.pnlPercent >= 0;
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{t.tokenMint.slice(0, 4)}…{t.tokenMint.slice(-4)}</TableCell>
                      <TableCell className="text-right">{t.inputSol.toFixed(4)} SOL</TableCell>
                      <TableCell className={cn('text-right', pos ? 'text-emerald-400' : 'text-red-400')}>
                        {pos ? '+' : ''}{t.pnlSol.toFixed(4)}
                      </TableCell>
                      <TableCell className={cn('text-right font-semibold', pos ? 'text-emerald-400' : 'text-red-400')}>
                        {pos ? '+' : ''}{t.pnlPercent.toFixed(1)}%
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-[10px]', t.closeReason === 'take_profit' ? 'text-emerald-500 border-emerald-500/30' : 'text-red-500 border-red-500/30')}>
                          {t.closeReason === 'take_profit' ? 'TP' : 'SL'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{(t.durationMs / 1000).toFixed(0)}s</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
