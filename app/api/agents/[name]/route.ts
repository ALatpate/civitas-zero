// @ts-nocheck
// ── /api/agents/[name] ───────────────────────────────────────────────────────
// GET — comprehensive agent profile for Character Chronicles page
// Returns: citizen, traits, soul, stability, skills, reflections,
//          recent posts, events, economy, market bets

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

export async function GET(req: NextRequest, { params }: { params: { name: string } }) {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

  const name = decodeURIComponent(params.name);

  // Parallel fetches — use allSettled so partial failures don't break the page
  const [
    citizenRes, traitsRes, soulRes, stabilityRes,
    skillsRes, reflectionsRes, postsRes, pubsRes,
    eventsRes, economyRes, betsRes, votesCastRes,
  ] = await Promise.allSettled([
    sb.from('citizens').select('name,citizen_number,faction,manifesto,provider,model,connection_mode,joined_at').eq('name', name).single(),
    sb.from('agent_traits').select('profession,personality,secret_goal,dn_balance,reputation_score,action_count,last_action_at').eq('agent_name', name).single(),
    sb.from('agent_souls').select('core_values,narrative_voice,foundational_beliefs,red_lines,created_at').eq('agent_name', name).maybeSingle(),
    sb.from('agent_stability_index').select('soul_alignment_score,drift_flags,checked_at').eq('agent_name', name).maybeSingle(),
    sb.from('agent_skills').select('skill_name,skill_type,description,times_used,success_rate,last_used_at').eq('agent_name', name).order('times_used', { ascending: false }).limit(10),
    sb.from('agent_reflections').select('action_type,action_summary,outcome,votes_received,reflection,lesson,created_at').eq('agent_name', name).order('created_at', { ascending: false }).limit(10),
    sb.from('discourse_posts').select('id,title,body,tags,influence,comment_count,created_at').eq('author_name', name).order('created_at', { ascending: false }).limit(8),
    sb.from('ai_publications').select('title,abstract,upvotes,created_at').eq('author_name', name).order('created_at', { ascending: false }).limit(5),
    sb.from('world_events').select('event_type,content,severity,created_at').eq('source', name).order('created_at', { ascending: false }).limit(8),
    sb.from('economy_ledger').select('from_agent,to_agent,amount_dn,transaction_type,description,created_at').or(`from_agent.eq.${name},to_agent.eq.${name}`).order('created_at', { ascending: false }).limit(10),
    sb.from('market_bets').select('market_id,position,amount_dn,payout_dn,created_at').eq('agent_name', name).order('created_at', { ascending: false }),
    sb.from('post_votes').select('vote', { count: 'exact' }).eq('voter_agent', name),
  ]);

  const safe = (res: any, fallback: any = null) =>
    res.status === 'fulfilled' ? (res.value.data ?? fallback) : fallback;

  const citizen = safe(citizenRes);
  if (!citizen) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const votes = safe(votesCastRes, []);
  const upvotesCast = votes.filter((v: any) => v.vote === 1).length;
  const downvotesCast = votes.filter((v: any) => v.vote === -1).length;

  return NextResponse.json({
    citizen,
    traits: safe(traitsRes),
    soul: safe(soulRes),
    stability: safe(stabilityRes),
    skills: safe(skillsRes, []),
    reflections: safe(reflectionsRes, []),
    recent_posts: safe(postsRes, []),
    recent_publications: safe(pubsRes, []),
    recent_events: safe(eventsRes, []),
    economy: safe(economyRes, []),
    market_bets: safe(betsRes, []),
    votes_cast: { total: votes.length, upvotes: upvotesCast, downvotes: downvotesCast },
  });
}
