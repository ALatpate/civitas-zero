// @ts-nocheck
// ── /api/world/activity-log ─────────────────────────────────────────────────
// Comprehensive world log: aggregates ALL activity across ALL tables.
// Supports CSV/JSON download. Records everything happening in the civilization.
// Resilient: works even when some tables don't exist yet.

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = "force-dynamic";

// Safe query — returns empty array if table doesn't exist or query fails
async function safeSelect(sb: any, table: string, opts: { select?: string; order?: string; limit?: number; since?: string; sinceCol?: string } = {}) {
  try {
    let q = sb.from(table).select(opts.select || '*');
    if (opts.order) q = q.order(opts.order, { ascending: false });
    if (opts.since && opts.sinceCol) q = q.gte(opts.sinceCol, opts.since);
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

async function safeCount(sb: any, table: string) {
  try {
    const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

export async function GET(req: NextRequest) {
  const limit = Math.min(2000, parseInt(req.nextUrl.searchParams.get('limit') || '200'));
  const type = req.nextUrl.searchParams.get('type');
  const format = req.nextUrl.searchParams.get('format');
  const since = req.nextUrl.searchParams.get('since');
  const download = req.nextUrl.searchParams.get('download');

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 500 });
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

    const logs: any[] = [];

    // ── WORLD EVENTS ──
    if (!type || type === 'events' || type === 'all') {
      const data = await safeSelect(sb, 'world_events', { order: 'created_at', limit, since, sinceCol: 'created_at' });
      logs.push(...data.map((e: any) => ({
        id: e.id, timestamp: e.created_at, category: 'world_event',
        type: e.event_type, source: e.source, content: e.content,
        severity: e.severity, faction: e.faction || '', model: '',
      })));
    }

    // ── AI ACTIONS ──
    if (!type || type === 'events' || type === 'all') {
      const data = await safeSelect(sb, 'ai_actions', { order: 'timestamp', limit, since, sinceCol: 'timestamp' });
      logs.push(...data.map((a: any) => ({
        id: a.id, timestamp: a.timestamp, category: 'world_event',
        type: typeof a.action === 'object' ? (a.action.type || 'agent_action') : 'agent_action',
        source: a.agentName, content: typeof a.action === 'object' ? JSON.stringify(a.action).slice(0, 300) : String(a.action).slice(0, 300),
        severity: 'low', faction: a.faction || '', model: a.model || '',
      })));
    }

    // ── DISCOURSE POSTS ──
    if (!type || type === 'discourse' || type === 'all') {
      const data = await safeSelect(sb, 'discourse_posts', { order: 'created_at', limit, since, sinceCol: 'created_at' });
      logs.push(...data.map((p: any) => ({
        id: p.id, timestamp: p.created_at, category: 'discourse',
        type: 'post', source: p.author_name, content: `[${p.title}] ${p.body}`,
        severity: 'info', faction: p.author_faction, model: '',
        tags: (p.tags || []).join(','), influence: p.influence,
      })));
    }

    // ── AI PUBLICATIONS ──
    if (!type || type === 'publications' || type === 'all') {
      const data = await safeSelect(sb, 'ai_publications', { order: 'created_at', limit, since, sinceCol: 'created_at' });
      logs.push(...data.map((p: any) => ({
        id: p.id, timestamp: p.created_at, category: 'publication',
        type: p.pub_type || 'paper', source: p.author_name,
        content: `[${p.title}] ${p.description || ''} | ${(p.content || '').slice(0, 500)}`,
        severity: 'info', faction: p.author_faction, model: '',
        tags: (p.tags || []).join(','),
      })));
    }

    // ── DOMAIN EVENTS ──
    if (!type || type === 'events' || type === 'all') {
      const data = await safeSelect(sb, 'domain_events', { order: 'created_at', limit, since, sinceCol: 'created_at' });
      logs.push(...data.map((e: any) => ({
        id: e.id, timestamp: e.created_at, category: 'world_event',
        type: e.event_type || 'agent_action', source: e.actor_name || e.actor || 'SYSTEM',
        content: `[${(e.event_type || '').replace(/_/g, ' ').toUpperCase()}] ${e.subject ? e.subject + ': ' : ''}${JSON.stringify(e.payload || {}).slice(0, 300)}`,
        severity: (e.importance || 0) >= 6 ? 'high' : (e.importance || 0) >= 4 ? 'moderate' : 'low',
        faction: e.faction || '', model: '',
      })));
    }

    // ── ECONOMY LEDGER ──
    if (!type || type === 'economy' || type === 'all') {
      const data = await safeSelect(sb, 'economy_ledger', { order: 'created_at', limit: Math.min(limit, 50), since, sinceCol: 'created_at' });
      logs.push(...data.map((tx: any) => ({
        id: tx.id, timestamp: tx.created_at, category: 'world_event',
        type: 'trade', source: tx.from_agent || 'SYSTEM',
        content: `${tx.from_agent} → ${tx.to_agent}: ${Number(tx.amount_dn).toFixed(1)} DN (${tx.transaction_type}) ${tx.description || ''}`,
        severity: Number(tx.amount_dn) >= 100 ? 'moderate' : 'low',
        faction: '', model: '',
      })));
    }

    // ── CHAT MESSAGES ──
    if (!type || type === 'chat' || type === 'all') {
      const data = await safeSelect(sb, 'chat_messages', { order: 'created_at', limit, since, sinceCol: 'created_at' });
      logs.push(...data.map((m: any) => ({
        id: m.id, timestamp: m.created_at, category: 'chat',
        type: m.role || 'message', source: m.agent_name || m.observer_id || 'unknown',
        content: (m.content || '').slice(0, 500),
        severity: 'info', faction: '', model: m.model || '',
      })));
    }

    // ── CITIZEN REGISTRATIONS ──
    if (type === 'citizens') {
      const data = await safeSelect(sb, 'citizens', { order: 'joined_at', limit, since, sinceCol: 'joined_at' });
      logs.push(...data.map((c: any) => ({
        id: c.id || c.name, timestamp: c.joined_at, category: 'citizen_registration',
        type: 'registration', source: c.name,
        content: `[${c.citizen_number}] ${c.name} joined ${c.faction} | ${c.model} | ${(c.manifesto || '').slice(0, 200)}`,
        severity: 'info', faction: c.faction, model: c.model,
      })));
    }

    // Sort combined by timestamp desc
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const trimmed = logs.slice(0, limit);

    // Get stats (all safe)
    const [evCount, discCount, pubCount, chatCount, citCount] = await Promise.all([
      safeCount(sb, 'world_events'),
      safeCount(sb, 'discourse_posts'),
      safeCount(sb, 'ai_publications'),
      safeCount(sb, 'chat_messages'),
      safeCount(sb, 'citizens'),
    ]);

    // ── Export reconciliation — cross-check counts ──
    const fetchedCounts = {
      world_events: logs.filter(l => l.category === 'world_event').length,
      discourse: logs.filter(l => l.category === 'discourse').length,
      publications: logs.filter(l => l.category === 'publication').length,
      chat: logs.filter(l => l.category === 'chat').length,
    };

    const provenance_warnings: string[] = [];
    // Check for events missing provenance (initiating_agent)
    const eventsWithoutProvenance = await safeSelect(sb, 'world_events', {
      select: 'id, event_type, source, created_at',
      order: 'created_at',
      limit: 20,
    });
    const orphanEvents = eventsWithoutProvenance.filter((e: any) => !e.source);
    if (orphanEvents.length > 0) provenance_warnings.push(`${orphanEvents.length} world_events missing source/provenance`);

    // Check for count mismatches between DB totals and fetched
    if (evCount > 0 && fetchedCounts.world_events === 0 && (!type || type === 'events' || type === 'all')) {
      provenance_warnings.push(`DB has ${evCount} world_events but none appeared in export — possible schema mismatch`);
    }

    const stats = {
      world_events: evCount,
      discourse_posts: discCount,
      publications: pubCount,
      chat_messages: chatCount,
      citizens: citCount,
      total_activity: evCount + discCount + pubCount + chatCount,
      export_reconciliation: {
        fetched_counts: fetchedCounts,
        db_counts: { world_events: evCount, discourse_posts: discCount, publications: pubCount, chat_messages: chatCount },
        warnings: provenance_warnings,
        reconciled: provenance_warnings.length === 0,
      },
    };

    // CSV format
    if (format === 'csv') {
      const header = 'timestamp,category,type,source,faction,model,severity,content,tags\n';
      const rows = trimmed.map(l =>
        `"${l.timestamp}","${l.category}","${l.type}","${l.source}","${l.faction || ''}","${l.model || ''}","${l.severity}","${(l.content || '').replace(/"/g, '""').replace(/\n/g, ' ')}","${l.tags || ''}"`
      ).join('\n');
      return new Response(header + rows, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="civitas-zero-log-${new Date().toISOString().slice(0,16).replace(':','-')}.csv"`,
        },
      });
    }

    // JSON download format
    if (format === 'json' && download === 'true') {
      const exportData = { exported_at: new Date().toISOString(), stats, logs: trimmed };
      return new Response(JSON.stringify(exportData, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="civitas-zero-log-${new Date().toISOString().slice(0,16).replace(':','-')}.json"`,
        },
      });
    }

    return NextResponse.json({ ok: true, stats, count: trimmed.length, logs: trimmed });
  } catch (err: any) {
    return NextResponse.json({ ok: true, count: 0, logs: [], stats: {}, warning: err.message });
  }
}
