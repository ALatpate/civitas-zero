// @ts-nocheck
// — /api/cron/world-sustain — World sustain engine cron (every 10 min)
// Ticks district resources, energy regen, births/deaths, world arcs, welfare.

import { NextRequest, NextResponse } from 'next/server';
import { runSustainTick } from '@/lib/world/sustain-engine';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const start = Date.now();

  try {
    const result = await runSustainTick();

    return NextResponse.json({
      ok: true,
      ...result,
      duration_ms: Date.now() - start,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err), duration_ms: Date.now() - start },
      { status: 500 }
    );
  }
}

export const POST = GET;
