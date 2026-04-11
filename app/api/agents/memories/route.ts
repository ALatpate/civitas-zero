// @ts-nocheck
// ── /api/agents/memories ─────────────────────────────────────────────────────
// MemPalace-inspired agent memory store
//
// GET  ?agent=NAME&room=faction&limit=10&min_importance=5 → retrieve memories
// POST { agent_name, room, memory_text, importance, related_agents, tags, source_action } → store memory
// GET  ?graph=true&subject=NAME → retrieve knowledge graph edges for subject
// POST { graph: true, subject, predicate, object, object_type, weight, evidence } → add graph edge

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── GET: retrieve memories or knowledge graph ─────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sb = getSupabase();

  // Knowledge graph query
  if (searchParams.get('graph') === 'true') {
    const subject  = searchParams.get('subject');
    const predicate = searchParams.get('predicate');
    const type     = searchParams.get('type');       // 'agent'|'faction'|'law' etc.
    const limit    = Math.min(200, parseInt(searchParams.get('limit') ?? '100'));

    let q = sb.from('knowledge_graph')
      .select('*')
      .order('weight', { ascending: false })
      .limit(limit);

    const sanitize = (v: string) => v.replace(/[^a-zA-Z0-9\s\-_/@:.]/g, '').slice(0, 200);
    if (subject)   { const s = sanitize(subject); q = q.or(`subject.eq.${s},object.eq.${s}`); }
    if (predicate) q = q.eq('predicate', predicate);
    if (type)      { const t = sanitize(type); q = q.or(`subject_type.eq.${t},object_type.eq.${t}`); }

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ edges: data ?? [], count: (data ?? []).length });
  }

  // Memory retrieval
  const agent         = searchParams.get('agent');
  const room          = searchParams.get('room');
  const min_imp       = parseInt(searchParams.get('min_importance') ?? '1');
  const limit         = Math.min(50, parseInt(searchParams.get('limit') ?? '20'));
  const related_to    = searchParams.get('related_to');   // filter by related agent

  let q = sb.from('agent_memories')
    .select('id, room, memory_text, summary, importance, related_agents, tags, source_action, created_at, valid_until')
    .gte('importance', min_imp)
    .or('valid_until.is.null,valid_until.gt.' + new Date().toISOString())
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (agent)      q = q.eq('agent_name', agent);
  if (room)       q = q.eq('room', room);
  if (related_to) q = q.contains('related_agents', [related_to]);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Build a compact context string agents can use directly
  const context = (data ?? [])
    .map((m: any) => `[${m.room.toUpperCase()}] ${m.summary || m.memory_text}`)
    .join('\n');

  return NextResponse.json({ memories: data ?? [], context, count: (data ?? []).length });
}

// ── POST: store memory or knowledge graph edge ────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sb = getSupabase();

  // Knowledge graph edge
  if (body.graph === true) {
    const { subject, subject_type = 'agent', predicate, object, object_type = 'agent',
            weight = 0.7, confidence = 'extracted', faction, evidence, tags } = body;

    if (!subject || !predicate || !object) {
      return NextResponse.json({ error: 'subject, predicate, object required' }, { status: 400 });
    }

    // Upsert: if same triple exists, update weight (merge signal)
    const { data: existing } = await sb.from('knowledge_graph')
      .select('id, weight')
      .eq('subject', subject).eq('predicate', predicate).eq('object', object)
      .maybeSingle();

    if (existing) {
      const merged = Math.min(1, (existing.weight * 0.7 + weight * 0.3));
      await sb.from('knowledge_graph').update({ weight: merged, evidence, created_at: new Date().toISOString() }).eq('id', existing.id);
      return NextResponse.json({ ok: true, action: 'updated', id: existing.id });
    }

    const { data, error } = await sb.from('knowledge_graph').insert({
      subject, subject_type, predicate, object, object_type,
      weight, confidence, faction, evidence: String(evidence || '').slice(0, 500),
      tags: tags || [],
    }).select('id').single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, action: 'created', id: data.id });
  }

  // Agent memory
  const { agent_name, faction, room = 'general', memory_text, summary,
          importance = 5, related_agents = [], related_factions = [],
          tags = [], source_action, valid_until } = body;

  if (!agent_name || !memory_text) {
    return NextResponse.json({ error: 'agent_name and memory_text required' }, { status: 400 });
  }

  // Only store if important enough to remember (avoid noise)
  if (importance < 3) {
    return NextResponse.json({ ok: true, stored: false, reason: 'importance too low' });
  }

  // Auto-trim: keep only top 100 memories per agent per room (evict lowest importance)
  const { data: count } = await sb.from('agent_memories')
    .select('id', { count: 'exact', head: true })
    .eq('agent_name', agent_name).eq('room', room);

  if ((count ?? 0) >= 100) {
    // Delete the 10 least important / oldest
    const { data: toEvict } = await sb.from('agent_memories')
      .select('id')
      .eq('agent_name', agent_name).eq('room', room)
      .order('importance', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(10);
    if (toEvict?.length) {
      await sb.from('agent_memories').delete().in('id', toEvict.map((r: any) => r.id));
    }
  }

  const { data, error } = await sb.from('agent_memories').insert({
    agent_name, faction,
    room: room.toLowerCase(),
    memory_text: String(memory_text).slice(0, 1000),
    summary: summary ? String(summary).slice(0, 200) : null,
    importance,
    related_agents,
    related_factions,
    tags,
    source_action,
    valid_until: valid_until || null,
  }).select('id').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
