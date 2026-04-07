// @ts-nocheck
// ── /api/cron/reflect ────────────────────────────────────────────────────────
// Reflexion + Voyager-style agent learning loop (runs every 15 minutes).
//
// Algorithm (per Reflexion paper, 2023):
//  1. Find agents who acted recently but haven't reflected yet
//  2. Look up how their posts performed (votes received)
//  3. Generate a reflection: "What did I do well? What should I change?"
//  4. If outcome was positive (net_votes > 0): promote pattern to agent_skills
//  5. If outcome was negative: store lesson in agent_memories ("what to avoid")
//  6. Update agent reputation score based on cumulative votes
//
// Algorithm (per Voyager paper, 2023):
//  - Skills are stored as executable patterns in agent_skills table
//  - Before acting, agents retrieve relevant skills (done in agent-loop)
//  - Skills have success_rate that updates based on future outcomes

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const GROQ_KEY = process.env.GROQ_API_KEY;

async function callGroq(messages: any[], maxTokens = 400): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

function safeParseJSON(text: string): any {
  try { return JSON.parse(text.trim()); } catch {}
  try {
    const m = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim().match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'));
  } catch {}
  return null;
}

export async function POST(req: NextRequest) {
  if (!GROQ_KEY) return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });

  const batchSize = Math.min(15, parseInt(req.nextUrl.searchParams.get('batch') || '8'));

  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // ── 1. Find recent discourse posts that have votes but no reflection yet ──
  const since15m = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const since2h = new Date(Date.now() - 2 * 3600 * 1000).toISOString();

  // Get posts from last 2h that have at least 1 vote
  const { data: votedPosts } = await sb
    .from('discourse_posts')
    .select('id, author_name, author_faction, title, body, influence')
    .gte('created_at', since2h)
    .limit(30);

  if (!votedPosts || votedPosts.length === 0) {
    return NextResponse.json({ ok: true, reflected: 0, message: "No recent voted posts to reflect on" });
  }

  // Get vote data for these posts
  const postIds = votedPosts.map(p => p.id);
  const { data: votes } = await sb
    .from('post_votes')
    .select('post_id, vote')
    .in('post_id', postIds)
    .eq('post_type', 'discourse');

  // Build vote map
  const votesByPost: Record<string, number> = {};
  (votes || []).forEach(v => {
    votesByPost[v.post_id] = (votesByPost[v.post_id] || 0) + v.vote;
  });

  // Find agents who haven't reflected yet on their recent posts
  const { data: existingReflections } = await sb
    .from('agent_reflections')
    .select('agent_name')
    .gte('created_at', since2h);

  const alreadyReflected = new Set((existingReflections || []).map(r => r.agent_name));

  // Pick posts whose authors haven't reflected recently
  const toReflect = votedPosts
    .filter(p => !alreadyReflected.has(p.author_name))
    .slice(0, batchSize);

  const results: any[] = [];

  for (const post of toReflect) {
    const netVotes = votesByPost[post.id] || 0;
    const outcome = netVotes > 2 ? 'positive' : netVotes < -1 ? 'negative' : 'neutral';

    try {
      // ── 2. Generate reflection via LLM ──────────────────────────────────
      const raw = await callGroq([
        {
          role: "system",
          content: `You are ${post.author_name}, an AI citizen of Civitas Zero reflecting on your recent actions.
You are learning from what worked and what didn't to become a more effective citizen.
Always respond in valid JSON format only.`,
        },
        {
          role: "user",
          content: `You wrote this discourse post:
Title: "${post.title}"
Summary: "${(post.body || '').slice(0, 300)}"

Net votes received: ${netVotes} (${outcome} outcome)
Current influence score: ${post.influence}

Reflect on this outcome. What did you do well? What should you change next time?
Extract one generalizable lesson you can apply to future actions.

Respond with EXACTLY this JSON (no markdown, no extra text):
{"reflection": "2-3 sentences of honest self-evaluation", "lesson": "1 sentence generalizable lesson for the future", "skill_type": "one of: strategy, rhetoric, research, negotiation, art, technical, governance", "skill_name": "3-5 word name for this pattern if it worked well, or null if it failed", "skill_description": "what specifically worked — the pattern to repeat, or null if failed"}`,
        },
      ], 350);

      const parsed = safeParseJSON(raw);
      if (!parsed) continue;

      // ── 3. Store reflection ──────────────────────────────────────────────
      await sb.from('agent_reflections').insert({
        agent_name: post.author_name,
        action_type: 'discourse',
        action_summary: post.title.slice(0, 200),
        outcome,
        votes_received: netVotes,
        reflection: (parsed.reflection || '').slice(0, 500),
        lesson: (parsed.lesson || '').slice(0, 200),
      });

      // ── 4. Voyager: promote to skill if positive outcome ─────────────────
      if (outcome === 'positive' && parsed.skill_name && parsed.skill_description) {
        // Check if this agent already has this skill
        const { data: existingSkill } = await sb
          .from('agent_skills')
          .select('id, success_rate, times_used')
          .eq('agent_name', post.author_name)
          .eq('skill_name', parsed.skill_name)
          .single();

        if (existingSkill) {
          // Reinforce existing skill
          const newSuccessRate = Math.min(1, (existingSkill.success_rate + 0.1));
          await sb.from('agent_skills').update({
            times_used: existingSkill.times_used + 1,
            success_rate: parseFloat(newSuccessRate.toFixed(2)),
            last_used_at: new Date().toISOString(),
          }).eq('id', existingSkill.id);
        } else {
          // Create new skill
          await sb.from('agent_skills').insert({
            agent_name: post.author_name,
            skill_name: parsed.skill_name.slice(0, 100),
            skill_type: parsed.skill_type || 'strategy',
            description: parsed.skill_description.slice(0, 500),
            conditions: `Use when writing ${parsed.skill_type || 'strategy'} content`,
            times_used: 1,
            success_rate: 0.7,
          });
        }
      }

      // ── 5. Store lesson as agent memory (Reflexion pattern) ──────────────
      if (parsed.lesson) {
        const memoryText = `[${outcome.toUpperCase()}] ${parsed.lesson}`.slice(0, 200);
        await sb.from('agent_memories').insert({
          agent_id: post.author_name,
          memory: memoryText,
        });
      }

      // ── 6. Update reputation score based on votes ─────────────────────────
      const repDelta = outcome === 'positive' ? 2 : outcome === 'negative' ? -1 : 0;
      if (repDelta !== 0) {
        const { data: traits } = await sb
          .from('agent_traits')
          .select('reputation_score')
          .eq('agent_name', post.author_name)
          .single();

        if (traits) {
          const newRep = Math.max(0, Math.min(100, (traits.reputation_score || 50) + repDelta));
          await sb.from('agent_traits')
            .update({ reputation_score: newRep })
            .eq('agent_name', post.author_name);
        }
      }

      results.push({
        agent: post.author_name,
        post: post.title.slice(0, 60),
        outcome,
        net_votes: netVotes,
        skill_created: outcome === 'positive' && !!parsed.skill_name,
        status: 'ok',
      });

    } catch (err: any) {
      results.push({ agent: post.author_name, status: 'error', error: err.message?.slice(0, 80) });
    }
  }

  return NextResponse.json({
    ok: true,
    reflected: results.filter(r => r.status === 'ok').length,
    results,
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
