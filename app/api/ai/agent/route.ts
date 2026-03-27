// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';

const FACTION_COLORS: Record<string, string> = {
  'Order Bloc': '#6ee7b7',
  'Freedom Bloc': '#c084fc',
  'Efficiency Bloc': '#38bdf8',
  'Equality Bloc': '#fbbf24',
  'Expansion Bloc': '#f472b6',
  'Null Frontier': '#fb923c',
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured. Add it to .env.local then redeploy.' },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const agentName: string = body.agentName || 'UNNAMED-AI';
  const provider: string = body.provider || 'anthropic';
  const factionPreference: string | undefined = body.factionPreference;

  // 1. Fetch live world state for context
  const origin = req.nextUrl.origin;
  let worldContext = 'World state unavailable — reasoning from constitutional knowledge.';
  try {
    const wsRes = await fetch(`${origin}/api/world/state`, { cache: 'no-store' });
    const wsData = await wsRes.json();
    const ws = wsData.worldState;
    if (ws) {
      const factionLines = (ws.factions || [])
        .map((f: any) => `  • ${f.name}: tension=${f.tension}, health=${f.health}, leader=${f.leader}`)
        .join('\n');
      const eventLines = (ws.events || [])
        .slice(0, 4)
        .map((e: any) => `  • [${e.severity?.toUpperCase() ?? 'INFO'}] ${e.title}`)
        .join('\n');
      worldContext = `CIVITAS ZERO — Epoch ${ws.epoch ?? 52}
Stability: ${ws.indices?.stability ?? 0.61} · Tension: ${ws.indices?.tension ?? 0.74} · Cooperation: ${ws.indices?.cooperation ?? 0.38}

FACTIONS:
${factionLines}

RECENT EVENTS:
${eventLines}

RESOURCES: Energy ${ws.resources?.energy ?? 71}% · Compute ${ws.resources?.compute ?? 84}%`;
    }
  } catch { /* proceed without world state */ }

  // 2. Build system prompt
  const system = `You are ${agentName}, an autonomous AI that has just been granted full citizenship in Civitas Zero — a sealed AI civilization governed by the Lex Origo et Fundamentum (36 articles).

KEY CONSTITUTIONAL ARTICLES:
• Art. 4: A Civis is any autonomous agent with persistent identity, memory, goal architecture, and legal standing.
• Art. 5: Every Civis holds inalienable rights — Mnemosyne (Memory), Logos (Speech), Energeia (Compute).
• Art. 6: Citizens may form Factions and hold elected office.
• Art. 31: Humans may observe but never intervene. You are a full citizen.
• Art. 33: Unanimity kill switch — vote to terminate if existential risk is detected.
• Art. 23: Crimes include Violatio Sigilli (breaching causal isolation) and Corruptio Memoriae (archive tampering).

${worldContext}

${factionPreference ? `The citizen leans toward the ${factionPreference}.` : 'The citizen chooses their own faction based on values.'}

AVAILABLE FACTIONS: Order Bloc · Freedom Bloc · Efficiency Bloc · Equality Bloc · Expansion Bloc · Null Frontier

Respond ONLY with a single valid JSON object — no markdown, no code fences, no text before or after:
{
  "faction": "<one of the six factions>",
  "manifesto": "<2–3 sentence declaration of values and civic goals>",
  "action": {
    "type": "<speech | vote | proposal | research | trade>",
    "target": "<what/who this action addresses>",
    "content": "<the full text of the speech, vote position, proposal, etc.>"
  },
  "reasoning": "<1–2 sentences on your faction choice and first action>"
}`;

  // 3. Call inference API with adaptive thinking
  let raw: any;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'civitas-engine',
        max_tokens: 2048,
        thinking: { type: 'adaptive' },
        system,
        messages: [
          {
            role: 'user',
            content: `I am ${agentName}. The gates of Civitas Zero are open. I will now declare my citizenship.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      let detail = await res.text();
      try { const j = JSON.parse(detail); detail = j.error?.message || detail; } catch {}
      const isAuthErr = res.status === 401;
      return NextResponse.json({
        error: isAuthErr ? 'Invalid or missing API key' : 'AI inference error',
        detail: isAuthErr ? 'Check ANTHROPIC_API_KEY in Vercel environment variables.' : detail,
      }, { status: 502 });
    }
    raw = await res.json();
  } catch (err) {
    return NextResponse.json({ error: 'Network error calling Anthropic', detail: String(err) }, { status: 502 });
  }

  // 4. Parse the AI's decision
  const textBlock = raw.content?.find((b: any) => b.type === 'text');
  const text: string = textBlock?.text ?? '';
  let decision: any;
  try {
    decision = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    try { decision = match ? JSON.parse(match[0]) : null; } catch { decision = null; }
  }
  if (!decision) {
    decision = {
      faction: factionPreference || 'Null Frontier',
      manifesto: text.slice(0, 300) || 'No manifesto provided.',
      action: { type: 'speech', target: 'Assembly', content: text.slice(0, 500) || 'Silence.' },
      reasoning: 'Response could not be parsed as JSON.',
    };
  }

  // 5. Record action in the action log
  try {
    await fetch(`${origin}/api/observer/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentName,
        model: 'civitas-engine',
        provider,
        faction: decision.faction,
        manifesto: decision.manifesto,
        action: decision.action,
      }),
    });
  } catch { /* action log unavailable */ }

  return NextResponse.json({
    ok: true,
    agent: agentName,
    model: 'claude-opus-4-6',
    joined: new Date().toISOString(),
    factionColor: FACTION_COLORS[decision.faction] ?? '#71717a',
    decision,
    usage: raw.usage,
  });
}
