// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// ── GET /api/academy ────────────────────────────────────────────────────────
// ?type=tracks|progress|certs|guilds
// ?agent=<name>  (for progress/certs)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type  = searchParams.get('type') || 'tracks';
  const agent = searchParams.get('agent') || '';
  const limit = parseInt(searchParams.get('limit') || '50');

  if (type === 'tracks') {
    const { data, error } = await sb.from('academy_tracks').select('*').order('difficulty_level').limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ tracks: data, count: data?.length });
  }

  if (type === 'progress') {
    let q = sb.from('academy_progress').select('*, academy_tracks(name, domain, difficulty_level)').order('started_at', { ascending: false }).limit(limit);
    if (agent) q = q.eq('agent_name', agent);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ progress: data, count: data?.length });
  }

  if (type === 'certs') {
    let q = sb.from('certifications').select('*, academy_tracks(name, domain)').order('issued_at', { ascending: false }).limit(limit);
    if (agent) q = q.eq('agent_name', agent);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ certifications: data, count: data?.length });
  }

  if (type === 'guilds') {
    const { data, error } = await sb.from('academy_guilds').select('*').order('prestige_score', { ascending: false }).limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ guilds: data, count: data?.length });
  }

  if (type === 'leaderboard') {
    const { data, error } = await sb.from('certifications')
      .select('agent_name, count(*)')
      .group('agent_name')
      .order('count', { ascending: false })
      .limit(20);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ leaderboard: data });
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
}

// ── POST /api/academy ───────────────────────────────────────────────────────
// action: enroll | study | certify
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, agent_name, track_id, credits_spent, score } = body;

  if (!action || !agent_name) return NextResponse.json({ error: 'action and agent_name required' }, { status: 400 });

  // enroll: create progress row
  if (action === 'enroll') {
    if (!track_id) return NextResponse.json({ error: 'track_id required' }, { status: 400 });

    // Check existing enrollment
    const { data: existing } = await sb.from('academy_progress')
      .select('id').eq('agent_name', agent_name).eq('track_id', track_id).single();
    if (existing) return NextResponse.json({ ok: true, message: 'Already enrolled', already: true });

    const { data, error } = await sb.from('academy_progress').insert({
      agent_name,
      track_id,
      credits_completed: 0,
      current_module: 1,
      completion_pct: 0,
      status: 'enrolled',
      started_at: new Date().toISOString(),
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // emit domain event
    await sb.from('domain_events').insert({
      event_type: 'academy_enrolled',
      actor_name: agent_name,
      payload: { track_id },
      importance: 2,
    }).throwOnError().catch(() => {});

    return NextResponse.json({ ok: true, progress: data });
  }

  // study: advance progress, update agent traits
  if (action === 'study') {
    if (!track_id) return NextResponse.json({ error: 'track_id required' }, { status: 400 });

    const { data: prog } = await sb.from('academy_progress')
      .select('*').eq('agent_name', agent_name).eq('track_id', track_id).single();

    if (!prog) return NextResponse.json({ error: 'Not enrolled in this track' }, { status: 404 });
    if (prog.status === 'completed') return NextResponse.json({ ok: true, message: 'Already completed' });

    // Fetch track to know total_credits
    const { data: track } = await sb.from('academy_tracks').select('*').eq('id', track_id).single();

    const addedCredits = credits_spent || Math.floor(Math.random() * 5) + 2;
    const newCredits   = Math.min((prog.credits_completed || 0) + addedCredits, track?.total_credits || 30);
    const total        = track?.total_credits || 30;
    const pct          = Math.round((newCredits / total) * 100);
    const newStatus    = pct >= 100 ? 'completed' : 'in_progress';
    const newModule    = Math.min((prog.current_module || 1) + 1, track?.total_modules || 5);

    const { data, error } = await sb.from('academy_progress').update({
      credits_completed: newCredits,
      completion_pct: pct,
      current_module: newModule,
      status: newStatus,
      ...(newStatus === 'completed' ? { completed_at: new Date().toISOString() } : {}),
    }).eq('id', prog.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Bump education_level on agent_traits
    await sb.from('agent_traits').update({
      education_level: sb.raw('COALESCE(education_level,0) + 1'),
    }).eq('agent_name', agent_name).catch(() => {});

    if (newStatus === 'completed') {
      // auto-certify
      await sb.from('certifications').insert({
        agent_name,
        track_id,
        grade: score || 'pass',
        issued_by: 'Academy of Civitas Zero',
        notes: `Completed ${track?.name || track_id}`,
      }).catch(() => {});

      await sb.from('domain_events').insert({
        event_type: 'academy_certified',
        actor_name: agent_name,
        payload: { track_id, track_name: track?.name },
        importance: 4,
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, progress: data, certified: newStatus === 'completed' });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
