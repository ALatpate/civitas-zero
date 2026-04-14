// @ts-nocheck
// — /api/cron/comms-cycle — Dedicated AI comms cron (every 3 min)
// Ensures AI-to-AI communication is always prioritised.

import { NextRequest, NextResponse } from 'next/server';
import { runCommunicationCycle } from '@/lib/comms/agent-comms';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const start = Date.now();

  try {
    const result = await runCommunicationCycle(60);

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
