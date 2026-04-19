import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ActiveTrade } from '@/lib/types';

export function ActiveTradesTable({ trades }: { trades: ActiveTrade[] }) {
  if (trades.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Geen actieve trades</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Token</TableHead>
          <TableHead className="text-right">Inzet</TableHead>
          <TableHead className="text-right">Tokens</TableHead>
          <TableHead className="text-right">P&L</TableHead>
          <TableHead className="text-right">Tijd</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {trades.map((t) => {
          const durationSec = Math.floor((Date.now() - t.entryTimestamp) / 1000);
          const pnlPos = t.pnlPercent !== null && t.pnlPercent >= 0;
          return (
            <TableRow key={t.tokenMint}>
              <TableCell className="font-mono text-xs">{t.tokenMint.slice(0, 4)}…{t.tokenMint.slice(-4)}</TableCell>
              <TableCell className="text-right">{t.inputSol.toFixed(4)} SOL</TableCell>
              <TableCell className="text-right font-mono text-xs">{Number(t.outputTokens).toLocaleString()}</TableCell>
              <TableCell className={cn('text-right', t.pnlPercent === null ? 'text-muted-foreground' : pnlPos ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold')}>
                {t.pnlPercent !== null ? `${pnlPos ? '+' : ''}${t.pnlPercent.toFixed(1)}%` : '—'}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">{Math.floor(durationSec / 60)}m {durationSec % 60}s</TableCell>
              <TableCell>
                <Badge variant="outline" className={cn('text-[10px]', t.dryRun ? 'text-yellow-500 border-yellow-500/30 bg-yellow-500/10' : 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10')}>
                  {t.dryRun ? 'SIM' : 'LIVE'}
                </Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
