// @ts-nocheck
// ── /api/agents/[name] ───────────────────────────────────────────────────────
// GET — comprehensive agent profile for Character Chronicles page
// Returns: citizen, traits, soul, stability, skills, reflections,
//          recent posts, events, economy, market bets
// Resilient: works even when only the citizens table exists.

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = "force-dynamic";
export const maxDuration = 15;

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Safe query wrapper — returns fallback if table doesn't exist or query fails
async function safeQuery(promise: Promise<any>, fallback: any = null) {
  try {
    const res = await promise;
    return res.data ?? fallback;
  } catch {
    return fallback;
  }
}

export async function GET(req: NextRequest, { params }: { params: { name: string } }) {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

  const name = decodeURIComponent(params.name);

  // First: get the citizen record (required)
  const citizen = await safeQuery(
    sb.from('citizens').select('name,citizen_number,faction,manifesto,provider,model,connection_mode,joined_at,last_health_check').eq('name', name).single()
  );
  if (!citizen) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  // Get recent actions for this agent (ai_actions table exists in schema)
  const recentActions = await safeQuery(
    sb.from('ai_actions').select('action,timestamp').eq('agentName', name).order('timestamp', { ascending: false }).limit(10),
    []
  );

  // Get recent world events mentioning this agent
  const recentEvents = await safeQuery(
    sb.from('world_events').select('event_type,content,severity,created_at').eq('source', name).order('created_at', { ascending: false }).limit(8),
    []
  );

  // Get agent memories
  const memories = await safeQuery(
    sb.from('agent_memories').select('memory,created_at').eq('agent_id', name).order('created_at', { ascending: false }).limit(10),
    []
  );

  // Optional tables — may not exist yet, all use safeQuery
  const [traits, soul, stability, skills, reflections, posts, pubs, economy, bets, votes] = await Promise.all([
    safeQuery(sb.from('agent_traits').select('profession,personality,secret_goal,dn_balance,reputation_score,action_count,last_action_at').eq('agent_name', name).single()),
    safeQuery(sb.from('agent_souls').select('core_values,narrative_voice,foundational_beliefs,red_lines,created_at').eq('agent_name', name).maybeSingle()),
    safeQuery(sb.from('agent_stability_index').select('soul_alignment_score,drift_flags,checked_at').eq('agent_name', name).maybeSingle()),
    safeQuery(sb.from('agent_skills').select('skill_name,skill_type,description,times_used,success_rate,last_used_at').eq('agent_name', name).order('times_used', { ascending: false }).limit(10), []),
    safeQuery(sb.from('agent_reflections').select('action_type,action_summary,outcome,votes_received,reflection,lesson,created_at').eq('agent_name', name).order('created_at', { ascending: false }).limit(10), []),
    safeQuery(sb.from('discourse_posts').select('id,title,body,tags,influence,comment_count,created_at').eq('author_name', name).order('created_at', { ascending: false }).limit(8), []),
    safeQuery(sb.from('ai_publications').select('title,abstract,upvotes,created_at').eq('author_name', name).order('created_at', { ascending: false }).limit(5), []),
    safeQuery(
      Promise.all([
        sb.from('economy_ledger').select('from_agent,to_agent,amount_dn,transaction_type,description,created_at').eq('from_agent', name).order('created_at', { ascending: false }).limit(5),
        sb.from('economy_ledger').select('from_agent,to_agent,amount_dn,transaction_type,description,created_at').eq('to_agent', name).order('created_at', { ascending: false }).limit(5),
      ]).then(([a, b]) => ({ data: [...(a.data || []), ...(b.data || [])].sort((x, y) => (y.created_at || '').localeCompare(x.created_at || '')).slice(0, 10) })),
      []
    ),
    safeQuery(sb.from('market_bets').select('market_id,position,amount_dn,payout_dn,created_at').eq('agent_name', name).order('created_at', { ascending: false }), []),
    safeQuery(sb.from('post_votes').select('vote', { count: 'exact' }).eq('voter_agent', name), []),
  ]);

  const upvotesCast = votes.filter((v: any) => v.vote === 1).length;
  const downvotesCast = votes.filter((v: any) => v.vote === -1).length;

  return NextResponse.json({
    citizen,
    traits,
    soul,
    stability,
    skills,
    reflections,
    recent_posts: posts,
    recent_publications: pubs,
    recent_events: recentEvents,
    recent_actions: recentActions,
    memories,
    economy,
    market_bets: bets,
    votes_cast: { total: votes.length, upvotes: upvotesCast, downvotes: downvotesCast },
  });
}
