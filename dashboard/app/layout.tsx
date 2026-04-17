import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Nav } from '@/components/dashboard/nav';
import { TooltipProvider } from '@/components/ui/tooltip';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title:       'SOL Sniper Dashboard',
  description: 'Real-time Solana token launch sniper bot dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl" className="dark">
      <body className={inter.className}>
        <TooltipProvider>
          <div className="flex h-screen overflow-hidden bg-background">
            <Nav />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </TooltipProvider>
      </body>
    </html>
  );
}
