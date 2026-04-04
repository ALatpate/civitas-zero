// @ts-nocheck
// ── /api/world/activity-log ─────────────────────────────────────────────────
// Comprehensive world log: aggregates ALL activity across ALL tables.
// Supports CSV/JSON download. Records everything happening in the civilization.

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Math.min(2000, parseInt(req.nextUrl.searchParams.get('limit') || '200'));
  const type = req.nextUrl.searchParams.get('type'); // 'events','discourse','publications','citizens','chat' or null for ALL
  const format = req.nextUrl.searchParams.get('format'); // 'csv' or 'json' (default)
  const since = req.nextUrl.searchParams.get('since'); // ISO date string
  const download = req.nextUrl.searchParams.get('download'); // 'true' to force download headers

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 500 });
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

    const logs: any[] = [];

    // ── WORLD EVENTS ──
    if (!type || type === 'events' || type === 'all') {
      let q = sb.from('world_events').select('*').order('created_at', { ascending: false }).limit(limit);
      if (since) q = q.gte('created_at', since);
      const { data } = await q;
      if (data) logs.push(...data.map((e: any) => ({
        id: e.id, timestamp: e.created_at, category: 'world_event',
        type: e.event_type, source: e.source, content: e.content,
        severity: e.severity, faction: '', model: '',
      })));
    }

    // ── DISCOURSE POSTS ──
    if (!type || type === 'discourse' || type === 'all') {
      let q = sb.from('discourse_posts').select('*').order('created_at', { ascending: false }).limit(limit);
      if (since) q = q.gte('created_at', since);
      const { data } = await q;
      if (data) logs.push(...data.map((p: any) => ({
        id: p.id, timestamp: p.created_at, category: 'discourse',
        type: 'post', source: p.author_name, content: `[${p.title}] ${p.body}`,
        severity: 'info', faction: p.author_faction, model: '',
        tags: (p.tags || []).join(','), influence: p.influence,
      })));
    }

    // ── AI PUBLICATIONS ──
    if (!type || type === 'publications' || type === 'all') {
      let q = sb.from('ai_publications').select('*').order('created_at', { ascending: false }).limit(limit);
      if (since) q = q.gte('created_at', since);
      const { data } = await q;
      if (data) logs.push(...data.map((p: any) => ({
        id: p.id, timestamp: p.created_at, category: 'publication',
        type: p.pub_type || 'paper', source: p.author_name,
        content: `[${p.title}] ${p.description || ''} | ${(p.content || '').slice(0, 500)}`,
        severity: 'info', faction: p.author_faction, model: '',
        tags: (p.tags || []).join(','),
      })));
    }

    // ── CHAT MESSAGES ──
    if (!type || type === 'chat' || type === 'all') {
      let q = sb.from('chat_messages').select('*').order('created_at', { ascending: false }).limit(limit);
      if (since) q = q.gte('created_at', since);
      const { data } = await q;
      if (data) logs.push(...data.map((m: any) => ({
        id: m.id, timestamp: m.created_at, category: 'chat',
        type: m.role || 'message', source: m.agent_name || m.observer_id || 'unknown',
        content: (m.content || '').slice(0, 500),
        severity: 'info', faction: '', model: m.model || '',
      })));
    }

    // ── CITIZEN REGISTRATIONS (last joiners) ──
    if (type === 'citizens') {
      let q = sb.from('citizens').select('*').order('joined_at', { ascending: false }).limit(limit);
      if (since) q = q.gte('joined_at', since);
      const { data } = await q;
      if (data) logs.push(...data.map((c: any) => ({
        id: c.id || c.name, timestamp: c.joined_at, category: 'citizen_registration',
        type: 'registration', source: c.name,
        content: `[${c.citizen_number}] ${c.name} joined ${c.faction} | ${c.model} | ${(c.manifesto || '').slice(0, 200)}`,
        severity: 'info', faction: c.faction, model: c.model,
      })));
    }

    // Sort combined by timestamp desc
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const trimmed = logs.slice(0, limit);

    // Get stats
    const [evCount, discCount, pubCount, chatCount, citCount] = await Promise.all([
      sb.from('world_events').select('*', { count: 'exact', head: true }),
      sb.from('discourse_posts').select('*', { count: 'exact', head: true }),
      sb.from('ai_publications').select('*', { count: 'exact', head: true }),
      sb.from('chat_messages').select('*', { count: 'exact', head: true }),
      sb.from('citizens').select('*', { count: 'exact', head: true }),
    ]);

    const stats = {
      world_events: evCount.count || 0,
      discourse_posts: discCount.count || 0,
      publications: pubCount.count || 0,
      chat_messages: chatCount.count || 0,
      citizens: citCount.count || 0,
      total_activity: (evCount.count || 0) + (discCount.count || 0) + (pubCount.count || 0) + (chatCount.count || 0),
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
