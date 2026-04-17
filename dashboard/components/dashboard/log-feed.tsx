'use client';

import { useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { BotLogEvent } from '@/lib/types';

const levelStyle: Record<BotLogEvent['level'], string> = {
  info:  'text-foreground',
  warn:  'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-muted-foreground',
};

const levelPrefix: Record<BotLogEvent['level'], string> = {
  info:  'INFO ',
  warn:  'WARN ',
  error: 'ERROR',
  debug: 'DBG  ',
};

interface Props {
  logs:      BotLogEvent[];
  className?: string;
}

export function LogFeed({ logs, className }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll naar laatste log
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  return (
    <ScrollArea className={cn('h-72 rounded-md border bg-black/40 p-0 font-mono text-xs', className)}>
      <div className="p-3 space-y-0.5">
        {logs.length === 0 ? (
          <p className="text-muted-foreground">Wachten op log-berichten...</p>
        ) : (
          [...logs].reverse().map((log, i) => (
            <div key={i} className={cn('flex gap-2 leading-5', levelStyle[log.level])}>
              <span className="shrink-0 text-muted-foreground">
                {new Date(log.timestamp).toLocaleTimeString('nl-NL', { hour12: false })}
              </span>
              <span className={cn('shrink-0 font-bold', levelStyle[log.level])}>
                {levelPrefix[log.level]}
              </span>
              <span className="break-all">{log.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
