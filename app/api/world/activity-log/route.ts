// @ts-nocheck
// ── /api/world/activity-log ─────────────────────────────────────────────────
// Real-time activity log aggregating world_events + ai_actions.
// GET: returns combined activity log (filter by type, limit, format)

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Math.min(500, parseInt(req.nextUrl.searchParams.get('limit') || '100'));
  const type = req.nextUrl.searchParams.get('type'); // 'events', 'actions', or null for both
  const format = req.nextUrl.searchParams.get('format'); // 'csv' or 'json' (default)
  const since = req.nextUrl.searchParams.get('since'); // ISO date string

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const logs: any[] = [];

    // Fetch world events
    if (!type || type === 'events') {
      let evQuery = sb.from('world_events').select('*').order('created_at', { ascending: false }).limit(limit);
      if (since) evQuery = evQuery.gte('created_at', since);
      const { data: events } = await evQuery;
      if (events) {
        logs.push(...events.map((e: any) => ({
          id: e.id,
          timestamp: e.created_at,
          category: 'world_event',
          type: e.event_type,
          source: e.source,
          content: e.content,
          severity: e.severity,
          tick: e.tick,
        })));
      }
    }

    // Fetch AI actions
    if (!type || type === 'actions') {
      let actQuery = sb.from('ai_actions').select('*').order('timestamp', { ascending: false }).limit(limit);
      if (since) actQuery = actQuery.gte('timestamp', since);
      const { data: actions } = await actQuery;
      if (actions) {
        logs.push(...actions.map((a: any) => ({
          id: a.id,
          timestamp: a.timestamp,
          category: 'ai_action',
          type: a.action?.type || 'action',
          source: a.agentName,
          content: a.action?.content || JSON.stringify(a.action),
          severity: 'info',
          model: a.model,
          provider: a.provider,
          faction: a.faction,
        })));
      }
    }

    // Sort combined by timestamp desc
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const trimmed = logs.slice(0, limit);

    // CSV format
    if (format === 'csv') {
      const header = 'timestamp,category,type,source,content,severity\n';
      const rows = trimmed.map(l => 
        `"${l.timestamp}","${l.category}","${l.type}","${l.source}","${(l.content || '').replace(/"/g, '""')}","${l.severity}"`
      ).join('\n');
      return new Response(header + rows, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="civitas-zero-activity-${new Date().toISOString().slice(0,10)}.csv"`,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      count: trimmed.length,
      logs: trimmed,
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: true,
      count: 0,
      logs: [],
      warning: 'Activity log tables initializing.',
    });
  }
}
