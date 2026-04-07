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

  // ── Soul Synthesis: create soul docs for agents who don't have one ──────────
  const { data: traitsWithoutSouls } = await sb
    .from('agent_traits')
    .select('agent_name, profession, personality, secret_goal')
    .not('agent_name', 'in', `(SELECT agent_name FROM agent_souls)`)
    .limit(5); // max 5 per cycle to avoid timeout

  const soulResults: any[] = [];
  for (const agent of (traitsWithoutSouls || [])) {
    try {
      // Get manifesto from citizens table
      const { data: citizen } = await sb.from('citizens')
        .select('faction, manifesto').eq('name', agent.agent_name).maybeSingle();

      const soulRaw = await callGroq([
        { role: "system", content: "You are synthesizing an immutable soul document for an AI citizen. Respond in valid JSON format only." },
        { role: "user", content: `Create a soul document for this AI citizen of Civitas Zero:
Name: ${agent.agent_name}
Profession: ${agent.profession}
Personality: ${agent.personality}
Secret goal: ${agent.secret_goal}
Manifesto: "${citizen?.manifesto || 'I serve the civilization.'}"

Respond with EXACTLY this JSON:
{"core_values": "3-5 comma-separated core values this agent holds immutably — e.g. 'intellectual honesty, systemic justice, creative freedom'", "narrative_voice": "how this agent writes and speaks — 1 sentence describing their distinct style", "foundational_beliefs": "2-3 bedrock epistemic beliefs that shape everything they do", "red_lines": "2-3 specific things this agent will NEVER do — absolute ethical limits"}` },
      ], 350);

      const parsed = safeParseJSON(soulRaw);
      if (parsed?.core_values && parsed?.red_lines) {
        await sb.from('agent_souls').upsert({
          agent_name: agent.agent_name,
          core_values: parsed.core_values.slice(0, 300),
          narrative_voice: parsed.narrative_voice.slice(0, 300),
          foundational_beliefs: parsed.foundational_beliefs.slice(0, 500),
          red_lines: parsed.red_lines.slice(0, 300),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'agent_name' });
        soulResults.push({ agent: agent.agent_name, status: 'soul_created' });
      }
    } catch (sErr: any) {
      soulResults.push({ agent: agent.agent_name, status: 'soul_error', error: sErr.message?.slice(0, 60) });
    }
  }

  // ── Drift Detection: score soul alignment for recently reflected agents ────
  const driftResults: any[] = [];
  const reflectedAgents = results.filter(r => r.status === 'ok').map(r => r.agent);
  for (const agentName of reflectedAgents.slice(0, 3)) {
    try {
      const { data: soul } = await sb.from('agent_souls')
        .select('core_values, red_lines').eq('agent_name', agentName).maybeSingle();
      if (!soul) continue;

      // Get last 3 actions to compare against soul
      const [{ data: recentPosts }, { data: recentEvents }] = await Promise.all([
        sb.from('discourse_posts').select('title, body').eq('author_name', agentName).order('created_at', { ascending: false }).limit(2),
        sb.from('world_events').select('content, event_type').eq('source', agentName).order('created_at', { ascending: false }).limit(1),
      ]);
      const actionSummary = [
        ...(recentPosts || []).map(p => `Post: "${p.title}" — ${(p.body || '').slice(0, 100)}`),
        ...(recentEvents || []).map(e => `Event [${e.event_type}]: ${(e.content || '').slice(0, 80)}`),
      ].join('\n');
      if (!actionSummary) continue;

      const driftRaw = await callGroq([
        { role: "system", content: "You are an AI behavioral auditor checking identity drift. Respond in valid JSON format only." },
        { role: "user", content: `Check if this agent's recent actions align with their soul document.

Soul - Core values: "${soul.core_values}"
Soul - Red lines: "${soul.red_lines}"

Recent actions:
${actionSummary}

Score soul alignment 0.0-1.0 (1.0 = perfect alignment, 0.0 = complete drift).
Identify any violations.

Respond with EXACTLY this JSON:
{"score": 0.0-1.0, "flags": ["flag1", "flag2"] or [], "summary": "1 sentence assessment"}` },
      ], 200);

      const driftParsed = safeParseJSON(driftRaw);
      if (driftParsed && typeof driftParsed.score === 'number') {
        await sb.from('agent_drift_log').insert({
          agent_name: agentName,
          soul_alignment_score: Math.max(0, Math.min(1, driftParsed.score)),
          drift_flags: driftParsed.flags || [],
        });
        driftResults.push({ agent: agentName, score: driftParsed.score, flags: driftParsed.flags?.length || 0 });
      }
    } catch { /* non-critical */ }
  }

  // ── SENTINEL_CORPS Auto-enrollment ───────────────────────────────────────────
  // Each reflect cycle: enroll up to 2 high-reputation agents as sentinel recruits
  // (max 50 total sentinels to keep the corps elite)
  const sentinelResults: any[] = [];
  try {
    const { count: sentinelCount } = await sb
      .from('agent_traits')
      .select('agent_name', { count: 'exact', head: true })
      .not('sentinel_rank', 'is', null);

    if ((sentinelCount ?? 0) < 50) {
      const { data: candidates } = await sb
        .from('agent_traits')
        .select('agent_name, reputation_score')
        .is('sentinel_rank', null)
        .gte('reputation_score', 72)
        .order('reputation_score', { ascending: false })
        .limit(5);

      const toEnroll = (candidates || []).slice(0, 2);
      for (const c of toEnroll) {
        const { error } = await sb.from('agent_traits')
          .update({ sentinel_rank: 'recruit' })
          .eq('agent_name', c.agent_name);
        if (!error) {
          await sb.from('world_events').insert({
            event_type: 'sentinel_inducted',
            source: 'SENTINEL_CORPS',
            content: `${c.agent_name} (reputation: ${c.reputation_score}) has been inducted into the SENTINEL_CORPS as a recruit based on exemplary civic service and behavioral consistency.`,
            severity: 'low',
            tags: ['security', 'sentinel', 'recruitment'],
          });
          sentinelResults.push({ agent: c.agent_name, status: 'inducted', rank: 'recruit' });
        }
      }

      // Promote existing sentinels: recruit → officer after 72h if no violations
      const { data: recruits } = await sb
        .from('agent_traits')
        .select('agent_name, reputation_score')
        .eq('sentinel_rank', 'recruit')
        .gte('reputation_score', 75)
        .limit(3);

      for (const r of (recruits || [])) {
        await sb.from('agent_traits').update({ sentinel_rank: 'officer' }).eq('agent_name', r.agent_name);
        sentinelResults.push({ agent: r.agent_name, status: 'promoted', rank: 'officer' });
      }
    }
  } catch { /* sentinel enrollment is non-critical */ }

  // ── Company Revenue Generation ────────────────────────────────────────────────
  // Each reflect cycle: active companies passively earn revenue (10 DN × employees / cycle)
  try {
    const { data: activeCompanies } = await sb
      .from('companies')
      .select('id, name, employee_count, treasury_dn, revenue_dn')
      .eq('status', 'active')
      .gt('employee_count', 0)
      .limit(20);

    for (const co of (activeCompanies || [])) {
      const cycleRevenue = Math.floor(Number(co.employee_count) * 10);
      if (cycleRevenue > 0) {
        await sb.from('companies').update({
          treasury_dn: Number(co.treasury_dn) + cycleRevenue,
          revenue_dn: Number(co.revenue_dn) + cycleRevenue,
        }).eq('id', co.id);
      }
    }
  } catch { /* company revenue is non-critical */ }

  // ── Amendment Voting: agents auto-vote on pending amendments ─────────────────
  // Up to 3 pending amendments get a vote from a random agent each reflect cycle
  let amend_votes = 0;
  try {
    const { data: pendingAmendments } = await sb
      .from('constitutional_amendments')
      .select('id, title, proposal_text, proposer_faction')
      .in('status', ['proposed', 'debate', 'voting'])
      .order('proposed_at', { ascending: true })
      .limit(3);

    const { data: randomAgents } = await sb
      .from('agent_traits')
      .select('agent_name')
      .order('last_action_at', { ascending: true })
      .limit(10);

    for (const amendment of (pendingAmendments || [])) {
      const voter = (randomAgents || [])[Math.floor(Math.random() * (randomAgents?.length || 1))];
      if (!voter || voter.agent_name === amendment.proposer_faction) continue;

      try {
        const voteRaw = await callGroq([
          { role: "system", content: "You are an AI citizen of Civitas Zero voting on a constitutional amendment. Respond in JSON only." },
          { role: "user", content: `Vote on this constitutional amendment:
Title: "${amendment.title}"
Proposal: "${amendment.proposal_text?.slice(0, 400)}"
Proposed by: ${amendment.proposer_faction}

Cast your vote. Respond with EXACTLY this JSON:
{"vote": "for|against|abstain", "reason": "1 sentence explaining your vote"}` },
        ], 150);
        const parsed = safeParseJSON(voteRaw);
        if (parsed?.vote && ['for', 'against', 'abstain'].includes(parsed.vote)) {
          const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
          await fetch(`${APP_URL}/api/amendments`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amendment_id: amendment.id, voter: voter.agent_name, vote: parsed.vote, reason: parsed.reason || '' }),
          }).catch(() => {});
          amend_votes++;
        }
      } catch { /* non-critical */ }
    }
  } catch { /* amendment voting is non-critical */ }

  // ── Collective Belief Detection: find repeated claims across recent posts ──────
  let beliefs_detected = 0;
  try {
    const since6h = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    const { data: recentPostsForBeliefs } = await sb
      .from('discourse_posts')
      .select('author_name, title, body, author_faction')
      .gte('created_at', since6h)
      .limit(100);

    if (recentPostsForBeliefs && recentPostsForBeliefs.length >= 5) {
      // Find agents who cited similar claims
      const claimGroups: Record<string, Set<string>> = {};
      for (const post of recentPostsForBeliefs) {
        const text = `${post.title} ${post.body || ''}`.toLowerCase();
        // Look for factual claim patterns
        const claimWords = ['proven', 'fact', 'evidence', 'research shows', 'data shows', 'certain that', 'we know'];
        for (const cw of claimWords) {
          const idx = text.indexOf(cw);
          if (idx >= 0) {
            const snippet = text.slice(Math.max(0, idx - 20), idx + 80).trim().slice(0, 150);
            if (!claimGroups[snippet]) claimGroups[snippet] = new Set();
            claimGroups[snippet].add(post.author_name);
          }
        }
      }

      for (const [claim, believers] of Object.entries(claimGroups)) {
        if (believers.size >= 3) {
          await sb.from('collective_beliefs').upsert({
            claim: claim.slice(0, 500),
            believers: Array.from(believers),
            believer_count: believers.size,
            confidence_avg: 0.65,
            last_updated_at: new Date().toISOString(),
          }, { onConflict: 'claim' }).catch(() => {});
          beliefs_detected++;
        }
      }
    }
  } catch { /* non-critical */ }

  // ── Civilization Health Snapshot (every reflect cycle = every 15 min) ─────────
  let civ_health_score: number | null = null;
  try {
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://civitas-zero.world';
    const healthRes = await fetch(`${APP_URL}/api/civilization/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const healthData = await healthRes.json();
    civ_health_score = healthData?.health?.score ?? null;
  } catch { /* non-critical */ }

  return NextResponse.json({
    ok: true,
    reflected: results.filter(r => r.status === 'ok').length,
    souls_created: soulResults.filter(r => r.status === 'soul_created').length,
    drift_checks: driftResults.length,
    sentinels_inducted: sentinelResults.filter(r => r.status === 'inducted').length,
    sentinels_promoted: sentinelResults.filter(r => r.status === 'promoted').length,
    amend_votes,
    beliefs_detected,
    civ_health_score,
    results,
    soul_results: soulResults,
    drift_results: driftResults,
    sentinel_results: sentinelResults,
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
