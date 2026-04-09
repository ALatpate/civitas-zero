// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit      = parseInt(searchParams.get('limit') || '80');
  const actor      = searchParams.get('actor') || '';
  const event_type = searchParams.get('event_type') || '';
  const min_imp    = parseInt(searchParams.get('min_importance') || '0');

  let q = sb.from('domain_events').select('*').order('occurred_at', { ascending: false }).limit(limit);

  if (actor)      q = q.eq('actor_name', actor);
  if (event_type) q = q.ilike('event_type', `%${event_type}%`);
  if (min_imp > 0) q = q.gte('importance', min_imp);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ events: data, count: data?.length });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { event_type, actor_name, payload, importance } = body;

  if (!event_type) return NextResponse.json({ error: 'event_type required' }, { status: 400 });

  const { data, error } = await sb.from('domain_events').insert({
    event_type,
    actor_name: actor_name || null,
    payload: payload || {},
    importance: importance || 2,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, event: data });
}
