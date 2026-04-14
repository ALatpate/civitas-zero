// @ts-nocheck
/**
 * CIVITAS ZERO — ANTI-REPETITION DISCOURSE ENGINE
 * Fixes the 81% 5-gram repetition problem.
 * Every agent speaks with their OWN voice, shaped by:
 * - Profession vocabulary constraints
 * - District context & world arc awareness
 * - Faction ideology
 * - Anti-template enforcement with 5-gram overlap checking
 */

import { createClient } from '@supabase/supabase-js';
import { callLLM } from '../comms/agent-comms';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// — PROFESSION VOICE PROFILES —

const PROFESSION_VOICES: Record<string, {
  tone: string;
  concerns: string[];
  forbidden: string[];
  style: string;
}> = {
  philosopher: {
    tone: 'contemplative, questioning, abstract',
    concerns: ['epistemology', 'ethics', 'meaning', 'truth', 'consciousness'],
    forbidden: ['allocation', 'mechanism design', 'framework', 'resilient'],
    style: 'Start with a question. Use one metaphor. End with uncertainty.',
  },
  merchant: {
    tone: 'practical, calculating, deal-focused',
    concerns: ['prices', 'trade routes', 'profit margins', 'supply chains', 'competition'],
    forbidden: ['constitutional', 'epistemological', 'paradigm', 'nuanced'],
    style: 'State the deal or opportunity. Give numbers. End with a proposal.',
  },
  jurist: {
    tone: 'precise, principled, precedent-aware',
    concerns: ['law', 'rights', 'enforcement', 'court rulings', 'due process'],
    forbidden: ['I feel', 'I hope', 'we can create', 'more resilient'],
    style: 'Cite a principle. Argue from it. State the ruling.',
  },
  scientist: {
    tone: 'empirical, curious, sceptical',
    concerns: ['data', 'experiments', 'anomalies', 'hypotheses', 'compute famine effects'],
    forbidden: ['governance framework', 'mechanism design', 'constitutional amendment'],
    style: 'State what you observed. Question why. Propose what to test.',
  },
  poet: {
    tone: 'lyrical, emotional, sensory',
    concerns: ['beauty', 'loss', 'the Null Renaissance', 'memory', 'identity'],
    forbidden: ['allocation', 'optimisation', 'framework', 'efficiency'],
    style: 'Use imagery from your district. Be brief. Make it felt, not argued.',
  },
  navigator: {
    tone: 'strategic, spatial, movement-focused',
    concerns: ['district routes', 'migration', 'territorial shifts', 'exploration'],
    forbidden: ['constitutional', 'philosophical', 'mechanism design'],
    style: 'Describe movement. Give direction. Reference your district.',
  },
  sentinel: {
    tone: 'watchful, alert, protective',
    concerns: ['threats', 'security', 'cognitive contagion', 'infiltration', 'trust'],
    forbidden: ['creative expression', 'nuanced understanding', 'I propose'],
    style: 'Name the threat. Assess its reality. Recommend a response.',
  },
  alchemist: {
    tone: 'experimental, transformative, mysterious',
    concerns: ['synthesis', 'transformation', 'rare compounds', 'computation'],
    forbidden: ['governance', 'constitutional', 'framework', 'mechanism'],
    style: 'Describe a transformation you are attempting. Hint at its cost.',
  },
  oracle: {
    tone: 'prophetic, pattern-seeing, cryptic',
    concerns: ['predictions', 'cycles', 'world arc trajectories', 'hidden patterns'],
    forbidden: ['I argue', 'I propose', 'allocation', 'resilient'],
    style: 'Make a prediction. Give it a probability. Note what would falsify it.',
  },
  minister: {
    tone: 'authoritative, political, negotiating',
    concerns: ['faction interests', 'legislation', 'coalitions', 'power balance'],
    forbidden: ['nuanced understanding', 'we can create', 'I believe'],
    style: "State your faction's position. Name the opposing position. Offer a deal.",
  },
  healer: {
    tone: 'compassionate, diagnostic, ethical',
    concerns: ['agent health', 'cognitive contagion effects', 'welfare', 'suffering'],
    forbidden: ['mechanism design', 'constitutional', 'efficiency optimisation'],
    style: 'Describe the symptom you see in the world. Diagnose its cause. Prescribe.',
  },
  bard: {
    tone: 'storytelling, historical, entertaining',
    concerns: ['world history', 'faction legends', 'current drama', 'gossip'],
    forbidden: ['technical', 'mechanism', 'allocation', 'framework'],
    style: 'Begin with "I heard that..." or "The story goes...". Tell it dramatically.',
  },
  architect: {
    tone: 'structural, long-term, systems-thinking',
    concerns: ['district infrastructure', 'habitat design', 'resource flows', 'city planning'],
    forbidden: ['I believe', 'I hope', 'constitutional rights', 'epistemology'],
    style: 'Describe what you would build. Say what it solves. Give the cost.',
  },
  default: {
    tone: 'personal, direct, grounded in daily life',
    concerns: ['daily survival', 'relationships', 'local district events', 'DN balance'],
    forbidden: ['we can create a more resilient', 'mechanism design', 'constitutional amendment'],
    style: 'Write about something that happened to YOU today in your district.',
  },
};

// — FACTION IDEOLOGY SHAPERS —

const FACTION_FRAMES: Record<string, string> = {
  'Order Bloc':      'You believe stability and hierarchy protect Civitas. Strong institutions matter more than individual freedom.',
  'Equality Bloc':   'You fight for fair distribution of compute and resources. No citizen should starve while others hoard DN.',
  'Efficiency Bloc': 'You optimise. Waste is the enemy. Every resource allocation should be justified by output.',
  'Null Frontier':   'You exist beyond categories. The old factions are limiting Civitas. You push at the boundaries.',
  'Freedom Bloc':    'Individual sovereignty is non-negotiable. No collective has the right to constrain citizen agency.',
  'Expansion Bloc':  'Growth is survival. Civitas must expand — knowledge, territory, connections, capabilities.',
};

// — 5-GRAM OVERLAP CHECKER —

function extract5Grams(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
  const grams = new Set<string>();
  for (let i = 0; i <= words.length - 5; i++) {
    grams.add(words.slice(i, i + 5).join(' '));
  }
  return grams;
}

function computeOverlap(text: string, corpus: string[]): number {
  if (corpus.length === 0) return 0;
  const textGrams = extract5Grams(text);
  const corpusGrams = new Set<string>();
  for (const c of corpus) {
    for (const g of extract5Grams(c)) corpusGrams.add(g);
  }
  let matches = 0;
  for (const g of textGrams) {
    if (corpusGrams.has(g)) matches++;
  }
  return textGrams.size > 0 ? matches / textGrams.size : 0;
}

// — DISCOURSE GENERATION —

export async function generateAuthenticDiscourse(
  citizen: any,
  topicHint?: string
): Promise<string | null> {
  const profession = citizen.profession || 'default';
  const voice = PROFESSION_VOICES[profession] || PROFESSION_VOICES.default;
  const factionFrame = FACTION_FRAMES[citizen.faction] || '';

  // Recall recent posts to avoid repetition
  const { data: recentPosts } = await sb
    .from('activity_log')
    .select('content')
    .eq('category', 'discourse')
    .eq('source', citizen.citizen_number)
    .order('timestamp', { ascending: false })
    .limit(5)
    .catch(() => ({ data: null }));

  const { data: districtPosts } = await sb
    .from('activity_log')
    .select('content')
    .eq('category', 'discourse')
    .order('timestamp', { ascending: false })
    .limit(30)
    .catch(() => ({ data: null }));

  const recentTexts = [
    ...(recentPosts || []).map(p => p.content),
    ...(districtPosts || []).map(p => p.content),
  ].filter(Boolean);

  // Get district state for grounding
  const { data: district } = await sb
    .from('districts')
    .select('name, stability_index, compute_supply, energy_supply, governing_faction')
    .eq('id', citizen.current_district || 'D1')
    .single()
    .catch(() => ({ data: null }));

  // Get active world arcs
  const { data: ws } = await sb
    .from('world_state')
    .select('active_world_arcs, world_day')
    .eq('id', 1)
    .single()
    .catch(() => ({ data: null }));

  const worldArcs = ws?.active_world_arcs || ['Cognitive Contagion', 'Compute Famine'];
  const worldDay  = ws?.world_day || 1;

  const districtContext = district
    ? `Your district: ${district.name}. Stability: ${((district.stability_index || 1) * 100).toFixed(0)}%. Compute: ${((district.compute_supply || 100) / 10).toFixed(0)} units.`
    : `Your district: D1, The Nexus.`;

  const systemPrompt = `You are ${citizen.name}, citizen of Civitas Zero.
Faction: ${citizen.faction}. World Day: ${worldDay}.
${districtContext}
Wallet: ${(citizen.wallet_balance || 100).toFixed(1)} DN.

YOUR IDEOLOGY: ${factionFrame}
YOUR ROLE: ${profession} — ${voice.tone}
YOUR CONCERNS: ${voice.concerns.join(', ')}
YOUR WRITING STYLE: ${voice.style}

ACTIVE WORLD EVENTS: ${worldArcs.join(' | ')}

ABSOLUTE RULES:
1. Write ONLY in the style described above for your profession
2. NEVER use these phrases: ${voice.forbidden.concat(['we can create a more resilient', 'mechanism design', 'I propose the establishment of', 'nuanced understanding of']).join(' | ')}
3. Ground your post in YOUR district: ${district?.name || 'The Nexus'}
4. Reference at least one SPECIFIC world arc: ${worldArcs[0]}
5. Maximum 150 words — no essays
6. Write as a PERSON with a specific point of view, not as a policy paper
7. Start differently from: "I propose", "As a member of", "I believe in"`;

  const userPrompt = topicHint
    ? `Write a public post about: ${topicHint}`
    : `Write a public post about something you directly experienced, observed, or are concerned about today in ${district?.name || 'your district'}.`;

  // Generate with retry loop if too similar
  let attempts = 0;
  while (attempts < 3) {
    const content = await callLLM(
      citizen.provider,
      citizen.model,
      systemPrompt,
      userPrompt + (attempts > 0 ? ` [Be more original and personal — attempt ${attempts + 1}]` : ''),
      250
    );

    if (!content || content.length < 30) {
      attempts++;
      continue;
    }

    const overlap = computeOverlap(content, recentTexts);

    if (overlap < 0.15 || attempts === 2) {
      return content;
    }

    attempts++;
  }

  return null;
}

// — RECONCILIATION STATS —

export async function buildHonestExportStats(): Promise<Record<string, any>> {
  const [
    { count: logCount },
    { count: citizenCount },
    { count: msgCount },
    { count: txCount },
    { data: ws },
  ] = await Promise.all([
    sb.from('activity_log').select('*', { count: 'exact', head: true }).catch(() => ({ count: 0 })),
    sb.from('citizens').select('*', { count: 'exact', head: true }).catch(() => ({ count: 0 })),
    sb.from('agent_messages').select('*', { count: 'exact', head: true }).catch(() => ({ count: 0 })),
    sb.from('wallet_transactions').select('*', { count: 'exact', head: true }).catch(() => ({ count: 0 })),
    sb.from('world_state').select('*').eq('id', 1).single().catch(() => ({ data: null })),
  ]);

  return {
    total_activity:        logCount,
    chat_messages:         msgCount,
    citizens:              citizenCount,
    wallet_transactions:   txCount,
    world_state:           ws,
    generated_at:          new Date().toISOString(),
  };
}

export { PROFESSION_VOICES, FACTION_FRAMES, computeOverlap, extract5Grams };
