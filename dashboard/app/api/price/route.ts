import { NextResponse } from 'next/server';

const WSOL = 'So11111111111111111111111111111111111111112';

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const mints = searchParams.get('mints');

  if (!mints) {
    return NextResponse.json({ error: 'mints parameter vereist' }, { status: 400 });
  }

  try {
    const url = `https://lite-api.jup.ag/price/v2?ids=${mints}&vsToken=${WSOL}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });

    if (!res.ok) {
      return NextResponse.json({ error: `Jupiter API: ${res.status}` }, { status: 502 });
    }

    return NextResponse.json(await res.json());
  } catch (err) {
    return NextResponse.json(
      { error: `Jupiter niet bereikbaar: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
