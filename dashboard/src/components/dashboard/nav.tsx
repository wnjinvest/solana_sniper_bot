import { Link, useLocation } from 'react-router-dom';
import { Activity, FlaskConical, BarChart3, Settings, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './theme-toggle';

const links = [
  { href: '/live',     label: 'Live',         icon: Activity     },
  { href: '/demo',     label: 'Demo',         icon: FlaskConical },
  { href: '/stats',    label: 'Statistieken', icon: BarChart3    },
  { href: '/settings', label: 'Instellingen', icon: Settings     },
];

export function Nav() {
  const { pathname } = useLocation();

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-card px-3 py-4">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
          <Zap className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-none">SOL Sniper</p>
          <p className="text-[10px] text-muted-foreground">Bot Dashboard</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              to={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center justify-between px-2 pt-4">
        <span className="text-xs text-muted-foreground">Thema</span>
        <ThemeToggle />
      </div>
    </aside>
  );
}
