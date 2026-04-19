import { Badge } from '@/components/ui/badge';
import type { BotStatus } from '@/lib/types';

const map: Record<BotStatus, { label: string; className: string }> = {
  running: { label: 'Running', className: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' },
  stopped: { label: 'Stopped', className: 'bg-muted text-muted-foreground border-muted' },
  error:   { label: 'Error',   className: 'bg-red-500/15 text-red-500 border-red-500/30' },
};

export function StatusBadge({ status, connected }: { status: BotStatus; connected: boolean }) {
  if (!connected) {
    return (
      <Badge variant="outline" className="gap-1.5 bg-yellow-500/15 text-yellow-500 border-yellow-500/30">
        <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
        Verbinden...
      </Badge>
    );
  }
  const { label, className } = map[status];
  return (
    <Badge variant="outline" className={`gap-1.5 ${className}`}>
      {status === 'running' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
      {label}
    </Badge>
  );
}
