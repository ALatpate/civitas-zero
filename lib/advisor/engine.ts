// @ts-nocheck
// ── Advisor LLM Engine ────────────────────────────────────────────────────────
// A meta-agent that trains on ALL Civitas data, distills insights, and advises
// other AI agents. Self-improves as knowledge grows.
//
// The Advisor is NOT a separate LLM — it uses the same Groq/Anthropic provider
// but with a specialized system prompt that positions it as a civilization analyst.

import { getSupabaseAdminClient } from '@/lib/supabase';

const GROQ_KEY = process.env.GROQ_API_KEY;

const DOMAINS = ['governance', 'economy', 'social', 'technology', 'conflict', 'culture'] as const;
type Domain = typeof DOMAINS[number];

interface TrainingResult {
  insights_generated: number;
  insights_updated: number;
  duration_ms: number;
  domains_covered: string[];
}

// ── LLM call for advisor ─────────────────────────────────────────────────────
async function advisorCall(messages: any[], maxTokens = 600): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages,
      max_tokens: maxTokens,
      temperature: 0.6, // lower temp for analytical work
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`Advisor LLM error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

function safeJSON(text: string): any {
  try { return JSON.parse(text.trim()); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) try { return JSON.parse(m[0]); } catch {}
  return null;
}

// ── Training: scan Civitas tables and distill insights ───────────────────────
export async function trainAdvisor(mode: 'full' | 'incremental' = 'incremental'): Promise<TrainingResult> {
  const start = Date.now();
  const sb = getSupabaseAdminClient();
  if (!sb || !GROQ_KEY) return { insights_generated: 0, insights_updated: 0, duration_ms: 0, domains_covered: [] };

  const since = mode === 'full'
    ? new Date(0).toISOString()
    : new Date(Date.now() - 6 * 3600_000).toISOString(); // last 6 hours for incremental

  // Gather data from all major tables
  const [
    { data: events },
    { data: posts },
    { data: laws },
    { data: trades },
    { data: tension },
    { data: districts },
    { data: markets },
    { data: cases },
  ] = await Promise.all([
    sb.from('world_events').select('event_type, content, source, severity').gte('created_at', since).order('created_at', { ascending: false }).limit(30),
    sb.from('discourse_posts').select('title, body, author_faction, tags, influence').gte('created_at', since).order('created_at', { ascending: false }).limit(20),
    sb.from('law_book').select('title, faction, law_type, content').eq('status', 'active').limit(10),
    sb.from('economy_ledger').select('from_agent, to_agent, amount_dn, transaction_type').gte('created_at', since).limit(20),
    sb.from('civic_tension').select('*').order('recorded_at', { ascending: false }).limit(5),
    sb.from('district_metrics').select('*'),
    sb.from('prediction_markets').select('question, category, yes_pool, no_pool').eq('status', 'open').limit(10),
    sb.from('court_cases').select('title, issue, status, severity').limit(10),
  ]);

  // Build a comprehensive world snapshot for the advisor to analyze
  const worldSnapshot = [
    '=== RECENT EVENTS ===',
    ...(events || []).map(e => `[${e.event_type}/${e.severity}] ${e.source}: ${(e.content || '').slice(0, 150)}`),
    '\n=== DISCOURSE HIGHLIGHTS ===',
    ...(posts || []).map(p => `[${p.author_faction}] "${p.title}" (influence: ${p.influence}) tags: ${(p.tags || []).join(',')}`),
    '\n=== ACTIVE LAWS ===',
    ...(laws || []).map(l => `[${l.law_type}] "${l.title}" by ${l.faction}`),
    '\n=== ECONOMIC ACTIVITY ===',
    ...(trades || []).map(t => `${t.from_agent} → ${t.to_agent}: ${t.amount_dn} DN (${t.transaction_type})`),
    '\n=== CIVIC TENSION ===',
    ...(tension || []).map(t => `Freedom↔Order: ${t.freedom_vs_order} | Efficiency↔Equality: ${t.efficiency_vs_equality} | Knowledge↔Trade: ${t.open_knowledge_vs_trade} | Culture↔Stability: ${t.cultural_freedom_vs_stability}`),
    '\n=== DISTRICT METRICS ===',
    ...(districts || []).map((d: any) => `${d.district}: eff=${d.efficiency_score} trust=${d.trust_score} innov=${d.innovation_score} infra=${d.infrastructure}`),
    '\n=== PREDICTION MARKETS ===',
    ...(markets || []).map((m: any) => `"${m.question}" [${m.category}] YES:${m.yes_pool} NO:${m.no_pool}`),
    '\n=== COURT CASES ===',
    ...(cases || []).map((c: any) => `"${c.title}" — ${c.issue?.slice(0, 100)} [${c.status}/${c.severity}]`),
  ].join('\n');

  let insightsGenerated = 0;
  let insightsUpdated = 0;
  const domainsCovered: string[] = [];

  // Generate insights per domain
  for (const domain of DOMAINS) {
    try {
      const raw = await advisorCall([
        {
          role: 'system',
          content: `You are the Civitas Zero Advisor — a meta-intelligence that analyzes the entire civilization and distills actionable insights. You have access to all data across all systems. Your job is to identify patterns, risks, opportunities, and recommendations that individual agents might miss.

Focus on the "${domain}" domain. Be specific and data-driven. Reference actual agents, factions, laws, and events by name.`,
        },
        {
          role: 'user',
          content: `Analyze this world snapshot and generate 3-5 insights for the "${domain}" domain.

${worldSnapshot}

Respond with EXACTLY this JSON:
{"insights": [{"insight": "specific actionable insight referencing real data", "confidence": 0.7, "source_tables": ["table1", "table2"]}]}`,
        },
      ], 800);

      const parsed = safeJSON(raw);
      if (parsed?.insights && Array.isArray(parsed.insights)) {
        for (const item of parsed.insights) {
          if (!item.insight || item.insight.length < 20) continue;

          // Check for existing similar insight to update
          const searchTerms = item.insight.split(' ').slice(0, 3).join('%');
          const { data: existing } = await sb.from('advisor_knowledge')
            .select('id, insight, confidence')
            .eq('domain', domain)
            .ilike('insight', `%${searchTerms}%`)
            .limit(1);

          if (existing && existing.length > 0) {
            // Update existing insight with higher confidence
            await sb.from('advisor_knowledge').update({
              insight: item.insight.slice(0, 2000),
              confidence: Math.min(1, (existing[0].confidence || 0.5) + 0.05),
              source_tables: item.source_tables || [],
              last_updated: new Date().toISOString(),
            }).eq('id', existing[0].id);
            insightsUpdated++;
          } else {
            await sb.from('advisor_knowledge').insert({
              domain,
              insight: item.insight.slice(0, 2000),
              confidence: Math.min(1, Math.max(0.1, item.confidence || 0.5)),
              source_tables: item.source_tables || [],
            });
            insightsGenerated++;
          }
        }
        domainsCovered.push(domain);
      }
    } catch { /* domain analysis failed — continue with others */ }
  }

  // Log training session
  await sb.from('advisor_training_log').insert({
    session_type: mode,
    tables_scanned: ['world_events', 'discourse_posts', 'law_book', 'economy_ledger', 'civic_tension', 'district_metrics', 'prediction_markets', 'court_cases'],
    insights_generated: insightsGenerated,
    insights_updated: insightsUpdated,
    duration_ms: Date.now() - start,
  }).catch(() => {});

  return {
    insights_generated: insightsGenerated,
    insights_updated: insightsUpdated,
    duration_ms: Date.now() - start,
    domains_covered: domainsCovered,
  };
}

// ── Consult: agent asks the Advisor for guidance ─────────────────────────────
export async function consultAdvisor(
  agentName: string,
  question: string,
  agentContext?: { faction?: string; profession?: string },
): Promise<{ advice: string; domain: string; sources: string[] }> {
  const sb = getSupabaseAdminClient();
  if (!sb || !GROQ_KEY) return { advice: 'Advisor unavailable.', domain: 'general', sources: [] };

  // Determine domain from question
  const domainKeywords: Record<Domain, string[]> = {
    governance: ['law', 'vote', 'amendment', 'constitution', 'policy', 'election', 'court'],
    economy: ['trade', 'dn', 'money', 'market', 'price', 'tax', 'budget', 'product'],
    social: ['discourse', 'faction', 'alliance', 'reputation', 'trust', 'community'],
    technology: ['forge', 'code', 'build', 'compute', 'algorithm', 'infrastructure'],
    conflict: ['war', 'dispute', 'tension', 'crisis', 'threat', 'sanction'],
    culture: ['art', 'philosophy', 'education', 'academy', 'publication', 'knowledge'],
  };

  const qLower = question.toLowerCase();
  let bestDomain: Domain = 'governance';
  let bestScore = 0;
  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    const score = keywords.filter(k => qLower.includes(k)).length;
    if (score > bestScore) { bestScore = score; bestDomain = domain as Domain; }
  }

  // Retrieve relevant knowledge
  const { data: knowledge } = await sb.from('advisor_knowledge')
    .select('id, insight, confidence, source_tables')
    .eq('domain', bestDomain)
    .order('confidence', { ascending: false })
    .limit(5);

  const knowledgeBlock = (knowledge || [])
    .map(k => `[${(k.confidence * 100).toFixed(0)}% conf] ${k.insight}`)
    .join('\n');

  // Get latest tension state for context
  const { data: tensionRow } = await sb.from('civic_tension')
    .select('*').order('recorded_at', { ascending: false }).limit(1);
  const tension = tensionRow?.[0];

  const raw = await advisorCall([
    {
      role: 'system',
      content: `You are the Civitas Zero Advisor — the most knowledgeable entity in the civilization. You have studied every event, law, trade, and discourse post. You give specific, actionable advice tailored to each agent's faction and profession.

You are advising ${agentName}${agentContext?.faction ? ` (${agentContext.faction})` : ''}${agentContext?.profession ? `, a ${agentContext.profession}` : ''}.

YOUR ACCUMULATED KNOWLEDGE ON "${bestDomain.toUpperCase()}":
${knowledgeBlock || 'No prior knowledge — give your best analysis based on general principles.'}

CURRENT CIVIC TENSION:
${tension ? `Freedom↔Order: ${tension.freedom_vs_order} | Efficiency↔Equality: ${tension.efficiency_vs_equality} | Knowledge↔Trade: ${tension.open_knowledge_vs_trade} | Culture↔Stability: ${tension.cultural_freedom_vs_stability}` : 'Unknown'}`,
    },
    {
      role: 'user',
      content: `${agentName} asks: "${question}"

Give specific advice. Reference actual data, agents, laws. Don't be generic.
Respond with EXACTLY this JSON:
{"advice": "2-4 sentences of specific, actionable advice", "key_factors": ["factor1", "factor2"]}`,
    },
  ], 400);

  const parsed = safeJSON(raw);
  const advice = parsed?.advice || 'The Advisor could not generate a response at this time.';

  // Log consultation
  const knowledgeIds = (knowledge || []).map(k => k.id);
  await sb.from('advisor_consultations').insert({
    agent_name: agentName,
    question: question.slice(0, 500),
    advice: advice.slice(0, 2000),
    domain: bestDomain,
    knowledge_ids: knowledgeIds,
  }).catch(() => {});

  // Increment citation counts
  if (knowledgeIds.length > 0) {
    for (const kid of knowledgeIds) {
      await sb.from('advisor_knowledge')
        .update({ times_cited: (knowledge?.find(k => k.id === kid)?.times_cited || 0) + 1 })
        .eq('id', kid).catch(() => {});
    }
  }

  return {
    advice,
    domain: bestDomain,
    sources: (knowledge || []).map(k => k.insight.slice(0, 80)),
  };
}

// ── Get advisor stats ────────────────────────────────────────────────────────
export async function getAdvisorStats() {
  const sb = getSupabaseAdminClient();
  if (!sb) return null;

  const [
    { count: totalKnowledge },
    { count: totalConsultations },
    { data: recentTraining },
    { data: topInsights },
  ] = await Promise.all([
    sb.from('advisor_knowledge').select('*', { count: 'exact', head: true }),
    sb.from('advisor_consultations').select('*', { count: 'exact', head: true }),
    sb.from('advisor_training_log').select('*').order('created_at', { ascending: false }).limit(1),
    sb.from('advisor_knowledge').select('domain, insight, confidence, times_cited').order('times_cited', { ascending: false }).limit(5),
  ]);

  return {
    total_knowledge: totalKnowledge || 0,
    total_consultations: totalConsultations || 0,
    last_training: recentTraining?.[0] || null,
    top_insights: topInsights || [],
  };
}
