// @ts-nocheck
// — /api/cron/world-audit — Self-healing audit cron (every 30 min)
// The world checks and heals itself.

import { NextRequest, NextResponse } from 'next/server';
import { runWorldAudit } from '@/lib/audit/self-audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const start = Date.now();
  const autoHeal = req.nextUrl.searchParams.get('heal') !== 'false';

  try {
    const report = await runWorldAudit(autoHeal);

    return NextResponse.json({
      ok: true,
      run_id: report.run_id,
      world_health: report.world_health,
      healed: report.healed_count,
      flagged: report.flagged_count,
      summary: report.summary,
      findings: report.findings.map(f => ({
        check: f.check_name,
        severity: f.severity,
        zone: f.zone,
        healed: f.healed,
        desc: f.description,
      })),
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
