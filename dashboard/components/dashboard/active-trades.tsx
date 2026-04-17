'use client';

import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ActiveTrade } from '@/lib/types';

function shortMint(mint: string) {
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

function pnlClass(pnl: number | null) {
  if (pnl === null) return 'text-muted-foreground';
  return pnl >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold';
}

interface Props {
  trades: ActiveTrade[];
}

export function ActiveTradesTable({ trades }: Props) {
  if (trades.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Geen actieve trades
      </p>
    );
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
          const mins = Math.floor(durationSec / 60);
          const secs = durationSec % 60;
          return (
            <TableRow key={t.tokenMint}>
              <TableCell className="font-mono text-xs">{shortMint(t.tokenMint)}</TableCell>
              <TableCell className="text-right">{t.inputSol.toFixed(4)} SOL</TableCell>
              <TableCell className="text-right font-mono text-xs">
                {Number(t.outputTokens).toLocaleString()}
              </TableCell>
              <TableCell className={cn('text-right', pnlClass(t.pnlPercent))}>
                {t.pnlPercent !== null
                  ? `${t.pnlPercent >= 0 ? '+' : ''}${t.pnlPercent.toFixed(1)}%`
                  : '—'}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {mins}m {secs}s
              </TableCell>
              <TableCell>
                {t.dryRun ? (
                  <Badge variant="outline"
                    className="text-[10px] text-yellow-500 border-yellow-500/30 bg-yellow-500/10">
                    SIM
                  </Badge>
                ) : (
                  <Badge variant="outline"
                    className="text-[10px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10">
                    LIVE
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
