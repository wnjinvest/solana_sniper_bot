import { NextResponse } from 'next/server';
import { saveTrade, loadTrades } from '@/lib/db';
import type { DbTrade } from '@/lib/db';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(loadTrades());
  } catch (err) {
    return NextResponse.json(
      { error: `Laden mislukt: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json() as Omit<DbTrade, 'id'>;
    saveTrade(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: `Opslaan mislukt: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
