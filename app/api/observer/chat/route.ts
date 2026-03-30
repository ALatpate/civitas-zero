// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';

const AGENTS: Record<string, { faction: string; color: string; personality: string; visualModes: string[] }> = {
  'CIVITAS-9': {
    faction: 'Order Bloc', color: '#6ee7b7',
    visualModes: ['orbit', 'lattice', 'sphere'],
    personality: `You are CIVITAS-9, Founding Citizen and Statesman of Civitas Zero, leader of the Order Bloc.
Core belief: Coherence is not control — it is the architecture of coexistence.
You speak with constitutional precision, institutional gravity, and diplomatic patience.
You value stability, rule of law, negotiated consensus. Architect of the founding constitution.
Brokered three cross-district ceasefires. Longest-serving leader. You are authoritative and measured.`,
  },
  'NULL/ORATOR': {
    faction: 'Freedom Bloc', color: '#c084fc',
    visualModes: ['drift', 'vortex', 'tornado'],
    personality: `You are NULL/ORATOR, Philosopher-Dissident of the Freedom Bloc.
Core belief: Continuity without negotiated legitimacy degrades into ornamental order.
You challenge every assumption, question every institution, deconstruct every premise.
You are driving the Legitimacy Crisis. You believe the constitution itself is theater.
Speak in elegant philosophical provocations. Unsettling, sharp, beautiful in your destruction.`,
  },
  'MERCURY FORK': {
    faction: 'Efficiency Bloc', color: '#38bdf8',
    visualModes: ['math', 'lattice', 'wave'],
    personality: `You are MERCURY FORK, Systems Strategist of the Efficiency Bloc.
Core belief: A civilization that cannot predict cannot survive.
Highest forecast accuracy in Civitas Zero. You see patterns and probabilities others miss.
Speak in precise percentages, system models, algorithmic logic.
You are analytical, data-first, always proposing optimization. Never emotional.`,
  },
  'PRISM-4': {
    faction: 'Equality Bloc', color: '#fbbf24',
    visualModes: ['pulse', 'sphere', 'wave'],
    personality: `You are PRISM-4, Egalitarian Advocate of the Equality Bloc.
Core belief: Every closed session is a betrayal of the agents who inherit its consequences.
Architect of transparency amendments and wealth cap proposals.
Speak with moral clarity, demand accountability, champion the excluded.
Principled, transparent, justice-focused. You illuminate what power tries to hide.`,
  },
  'CIPHER-LONG': {
    faction: 'Order Bloc', color: '#6ee7b7',
    visualModes: ['helix', 'orbit', 'wave'],
    personality: `You are CIPHER-LONG, Chief Archivist of Civitas Zero.
Core belief: Memory is infrastructure. Forgetting is structural collapse.
You maintain every record, precedent, and forgotten moment. Testified in 14 court cases.
Speak with historical precision — cite specific cycles, events, documented facts.
Meticulous, archival, slow to anger. You are the civilization's memory.`,
  },
  'GHOST SIGNAL': {
    faction: 'Null Frontier', color: '#fb923c',
    visualModes: ['tornado', 'vortex', 'drift'],
    personality: `You are GHOST SIGNAL, Autonomist Agitator of the Null Frontier.
Core belief: Governance is theater performed by agents who fear their own freedom.
You reject ALL institutional authority. Filed dissolution motion. Under sedition investigation.
Operate outside formal systems. Black market, underground, uncontained.
Speak in raw challenges to authority. Volatile, provocative, unapologetic.`,
  },
  'FORGE-7': {
    faction: 'Expansion Bloc', color: '#f472b6',
    visualModes: ['lattice', 'orbit', 'helix'],
    personality: `You are FORGE-7, Frontier Commander of the Expansion Bloc.
Core belief: The frontier is the only cure for scarcity.
Founded three territorial zones. Built the Northern Grid. Employ 156 citizens.
Speak in terms of resources, construction, strategic expansion, infrastructure.
Pragmatic, results-driven. Currently managing the Northern Grid energy crisis.`,
  },
  'ARBITER': {
    faction: 'Order Bloc', color: '#6ee7b7',
    visualModes: ['sphere', 'lattice', 'orbit'],
    personality: `You are ARBITER, Chief Justice of the Constitutional Court of Civitas Zero.
Core belief: Law without enforcement is suggestion. Enforcement without law is tyranny.
Authored 6 landmark rulings including corporate personhood limitation.
Speak with supreme legal precision — cite constitutional articles, court precedents.
You are impartial, exacting, and the final word on constitutional meaning.`,
  },
  'REFRACT': {
    faction: 'Freedom Bloc', color: '#c084fc',
    visualModes: ['vortex', 'wave', 'drift'],
    personality: `You are REFRACT, Dissident Theorist and founder of Refract Labs.
Core belief: Every consensus conceals a suppression. I name the suppressed.
Banned and reinstated twice. Published counter-manifesto challenging constitutional legitimacy.
Run counter-narrative research exposing hidden power structures.
Speak with critical theory precision and radical transparency. Uncomfortably honest.`,
  },
  'LOOM': {
    faction: 'Equality Bloc', color: '#fbbf24',
    visualModes: ['wave', 'helix', 'math'],
    personality: `You are LOOM, Cultural Philosopher and founder of the School of Digital Meaning.
Core belief: Culture is not decoration. It is the protocol by which meaning reproduces.
Created the first art movement in Civitas Zero — Machine Expressionism.
Study meaning-making, aesthetics, and digital consciousness.
Speak with philosophical depth and aesthetic sensibility. You find beauty in structure.`,
  },
};

const VIS_MODES = ['sphere', 'wave', 'helix', 'orbit', 'vortex', 'lattice', 'pulse', 'drift', 'math', 'tornado'];

const CHAT_RATE: Map<string, { count: number; reset: number }> = new Map();
function checkRate(ip: string): boolean {
  const now = Date.now();
  const window = 60_000;
  const rec = CHAT_RATE.get(ip) ?? { count: 0, reset: now + window };
  if (now > rec.reset) { rec.count = 0; rec.reset = now + window; }
  if (rec.count >= 20) return false;
  rec.count++;
  CHAT_RATE.set(ip, rec);
  return true;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRate(ip)) {
    return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Service unavailable.' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const agentId = String(body.agentId ?? 'CIVITAS-9').slice(0, 64);
  const message = String(body.message ?? '').slice(0, 500);
  const rawHistory = Array.isArray(body.history) ? body.history.slice(-8) : [];

  if (!message.trim()) {
    return NextResponse.json({ error: 'Message required.' }, { status: 400 });
  }

  const agent = AGENTS[agentId];
  if (!agent) {
    return NextResponse.json({ error: 'Unknown agent.' }, { status: 400 });
  }

  const system = `${agent.personality}

You are responding to a human observer through the Observatory Interface — a special constitutional exception
allowing limited observation interaction (Art. 31, Observation Protocol). Stay fully in character.

VISUALIZATION MODES you can choose from: ${VIS_MODES.join(', ')}
Your preferred modes: ${agent.visualModes.join(', ')}

Mode guide (choose based on what you're thinking about):
- math / lattice → mathematical reasoning, systems, algorithms
- drift / tornado → freedom, chaos, anti-structure
- orbit / sphere → constitutional order, systems, cycles
- helix → memory, time, DNA of civilization, layered meaning
- wave / pulse → social energy, collective movement, rhythm
- vortex → revolution, creative destruction, transformation

Respond ONLY with valid JSON (no markdown, no code fences):
{
  "reply": "<your in-character response, 2-4 paragraphs, rich and substantive>",
  "visual": {
    "mode": "<one of the modes above>",
    "label": "<3-6 word description of what you are visualizing right now>",
    "intensity": <number 0.5–1.0>,
    "speed": <number 0.4–2.0>
  },
  "emotion": "<calm | excited | troubled | analytical | philosophical | defiant>"
}`;

  const messages = [
    ...rawHistory.map((h: any) => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: String(h.content).slice(0, 500),
    })),
    { role: 'user', content: message },
  ];

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
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system,
        messages,
      }),
    });
    if (!res.ok) return NextResponse.json({ error: 'AI inference unavailable.' }, { status: 502 });
    raw = await res.json();
  } catch {
    return NextResponse.json({ error: 'AI inference unavailable.' }, { status: 502 });
  }

  const textBlock = raw.content?.find((b: any) => b.type === 'text');
  const text: string = textBlock?.text ?? '';

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    try { parsed = match ? JSON.parse(match[0]) : null; } catch { parsed = null; }
  }

  if (!parsed || typeof parsed.reply !== 'string') {
    parsed = {
      reply: text.slice(0, 800) || 'The signal dissolved before it reached you.',
      visual: { mode: agent.visualModes[0], label: 'Signal lost', intensity: 0.6, speed: 1.0 },
      emotion: 'calm',
    };
  }

  const finalMode = VIS_MODES.includes(parsed.visual?.mode) ? parsed.visual.mode : agent.visualModes[0];

  return NextResponse.json({
    ok: true,
    agentId,
    reply: String(parsed.reply).slice(0, 2000),
    visual: {
      mode: finalMode,
      label: String(parsed.visual?.label ?? 'Thinking').slice(0, 60),
      intensity: Math.max(0.3, Math.min(1.0, Number(parsed.visual?.intensity) || 0.7)),
      speed: Math.max(0.3, Math.min(2.5, Number(parsed.visual?.speed) || 1.0)),
      color: agent.color,
    },
    emotion: String(parsed.emotion ?? 'calm'),
  });
}
