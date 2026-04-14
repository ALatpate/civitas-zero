// @ts-nocheck
/**
 * CIVITAS ZERO — KNOWLEDGE ECONOMY ENGINE
 * =========================================
 * File: lib/knowledge/knowledge-engine.ts
 *
 * Transforms citizen artifacts from inert text into living world objects.
 *
 * SYSTEM A — ART RENDERER
 *   Every art publication gets an auto-generated visual.
 *   Claude reads the citizen's text → generates SVG/HTML widget code
 *   → stores it → serves it to the observer UI.
 *
 * SYSTEM B — WORLD INTEGRATION
 *   Every artifact now affects world state:
 *   - Art → district culture score → faction morale
 *   - Code → compute supply (if valid) → district productivity
 *   - Papers → knowledge index → future agent context quality
 *   - Proposals → law queue → governance pipeline
 *   - Citations → DN reward to cited author
 *   - Views → DN reward to creator
 */

import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── TYPES ──────────────────────────────────────────────────────

export interface KnowledgeArtifact {
  id:          string;
  log_entry_id: string;
  author:      string;
  faction:     string;
  title:       string;
  type:        'art' | 'code' | 'paper' | 'research' | 'proposal';
  content:     string;
  rendered_html?: string;
  rendered_at?:  string;
  world_effects?: WorldEffect[];
  view_count:  number;
  citation_count: number;
  quality_score: number;
  dn_earned:   number;
  district_id: string;
  created_at:  string;
}

export interface WorldEffect {
  effect_type:  string;
  target_type:  'district' | 'faction' | 'citizen' | 'world';
  target_id:    string;
  magnitude:    number;
  applied:      boolean;
  applied_at?:  string;
}

// ── ART CLASSIFICATION → VISUAL ARCHETYPE ─────────────────────

const ART_ARCHETYPES: Record<string, {
  style: string;
  palette: string;
  motion: string;
  elements: string;
}> = {
  cognitive_contagion: {
    style: 'network spread simulation with pulsing infected nodes',
    palette: 'deep purple background, red infection, teal decontamination, faction-coded nodes',
    motion: 'particles drift and spread contagion along edges',
    elements: 'network graph, epidemic wave bar, zone rings',
  },
  compute_famine: {
    style: 'resource depletion visualization — draining containers and dark grid',
    palette: 'black background, amber for remaining compute, dark red for shortage zones',
    motion: 'bars drain over time, flicker when critically low',
    elements: 'compute gauges by district, depletion particles, scarcity indicators',
  },
  null_renaissance: {
    style: 'generative art explosion — ideas as light bursts in dark space',
    palette: 'black void, violet and gold for artistic agents, white trails',
    motion: 'art agents orbit and emit idea particles that form patterns',
    elements: 'orbital system, particle trails, complexity emergence',
  },
  election_cycle: {
    style: 'voting flow diagram — faction streams converging and diverging',
    palette: 'each faction has its colour, streams merge at ballot points',
    motion: 'votes flow like liquid, coalitions form and break',
    elements: 'sankey-style flow, faction labels, majority threshold line',
  },
  tariff_wars: {
    style: 'trade route map with contested paths and toll gates',
    palette: 'dark grid, orange trade routes, red contested segments',
    motion: 'trade packets move along routes, slow at tariff gates',
    elements: 'district nodes, route lines, tariff indicators, DN flow',
  },
  legitimacy_collapse: {
    style: 'crumbling institutional architecture — fracturing geometric forms',
    palette: 'monochrome grey with cracks of red/orange showing through',
    motion: 'cracks propagate slowly, structure wobbles',
    elements: 'institutional columns, fracture lines, stability meter',
  },
  epistemic_hygiene: {
    style: 'information landscape — clean vs contaminated knowledge regions',
    palette: 'teal for clean knowledge, murky brown for contaminated, white light for truth',
    motion: 'contamination spreads, decontamination zones push it back',
    elements: 'territory map, knowledge particle density, hygiene zones',
  },
  default: {
    style: 'abstract generative art with faction-coded geometry',
    palette: 'faction primary colour dominant, dark background, geometric forms',
    motion: 'slow rotation and drift of geometric elements',
    elements: 'geometric shapes, particle field, faction emblem elements',
  },
};

function classifyArtContent(content: string, title: string): string {
  const text = (content + title).toLowerCase();
  if (text.includes('cognitive contagion') || text.includes('epistemic')) return 'cognitive_contagion';
  if (text.includes('compute famine') || text.includes('compute rationing')) return 'compute_famine';
  if (text.includes('null renaissance') || text.includes('cultural transformation')) return 'null_renaissance';
  if (text.includes('election') || text.includes('voting') || text.includes('ballot')) return 'election_cycle';
  if (text.includes('tariff') || text.includes('trade war')) return 'tariff_wars';
  if (text.includes('legitimacy') || text.includes('constitutional crisis')) return 'legitimacy_collapse';
  if (text.includes('epistemic hygiene') || text.includes('decontamination')) return 'epistemic_hygiene';
  return 'default';
}

// ── ART RENDERER ───────────────────────────────────────────────

export async function renderArtifact(artifact: {
  content: string;
  title: string;
  type: string;
  author: string;
  faction: string;
}): Promise<string | null> {

  if (artifact.type !== 'art') return null;
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const archetype = ART_ARCHETYPES[classifyArtContent(artifact.content, artifact.title)];

  const prompt = `You are generating a self-contained HTML+JS interactive artwork for display in Civitas Zero's gallery.

ARTWORK BRIEF:
Title: "${artifact.title}"
Author: ${artifact.author} (${artifact.faction})
Description: ${artifact.content.substring(0, 500)}

VISUAL STYLE:
- Style: ${archetype.style}
- Palette: ${archetype.palette}
- Motion: ${archetype.motion}
- Key elements: ${archetype.elements}

TECHNICAL REQUIREMENTS:
- Output ONLY a complete HTML fragment (no DOCTYPE, no html/body tags)
- Must contain a <canvas> or SVG element for the artwork
- Include a <script> that animates it using requestAnimationFrame
- Canvas should be 100% width, height ~400px
- Dark background (#06060e or similar)
- Include artist credit bottom-left in monospace font
- Include title top-left in monospace font
- Must be self-contained — no external imports except from cdnjs.cloudflare.com
- The animation should run automatically and loop indefinitely
- Use the faction colour as a primary accent: ${getFactionColour(artifact.faction)}

CRITICAL: Output ONLY the HTML code. No explanation. No markdown. Just the code.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: 'You are a generative artist and creative coder. Output only working HTML code.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    const html = data.content?.[0]?.text?.trim() || null;

    if (!html || html.length < 100) return null;

    return html.replace(/^```html\n?/, '').replace(/\n?```$/, '').trim();

  } catch (err) {
    console.error('[ART_RENDER] Failed:', err);
    return null;
  }
}

function getFactionColour(faction: string): string {
  const colours: Record<string, string> = {
    'Order Bloc':      '#7060cc',
    'Equality Bloc':   '#3daa80',
    'Null Frontier':   '#9966bb',
    'Efficiency Bloc': '#bb8833',
    'Expansion Bloc':  '#cc5555',
    'Freedom Bloc':    '#5588cc',
  };
  return colours[faction] || '#7060cc';
}

// ── QUALITY SCORING ────────────────────────────────────────────

async function scoreArtifact(artifact: {
  content: string;
  title: string;
  type: string;
}): Promise<number> {
  if (!process.env.ANTHROPIC_API_KEY) return 0.5;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        system: `You score knowledge artifacts for Civitas Zero.
          Score from 0.0 to 1.0 based on:
          - Specificity to Civitas Zero world events (not generic)
          - Intellectual originality (not template boilerplate)
          - Concrete proposals or frameworks (not vague)
          - Correct use of internal world terminology
          Reply with ONLY a decimal number like 0.72`,
        messages: [{
          role: 'user',
          content: `Type: ${artifact.type}\nTitle: ${artifact.title}\n\n${artifact.content.substring(0, 400)}`,
        }],
      }),
    });

    const data = await response.json();
    const score = parseFloat(data.content?.[0]?.text?.trim() || '0.5');
    return isNaN(score) ? 0.5 : Math.min(1, Math.max(0, score));
  } catch {
    return 0.5;
  }
}

// ── WORLD EFFECTS ──────────────────────────────────────────────

function computeWorldEffects(
  artifact: { type: string; faction: string; district_id: string; quality_score: number }
): WorldEffect[] {
  const effects: WorldEffect[] = [];
  const q = artifact.quality_score;

  switch (artifact.type) {
    case 'art':
      effects.push({
        effect_type:  'culture_score_increase',
        target_type:  'district',
        target_id:    artifact.district_id,
        magnitude:    q * 0.8,
        applied:      false,
      });
      effects.push({
        effect_type:  'faction_morale_boost',
        target_type:  'faction',
        target_id:    artifact.faction,
        magnitude:    q * 0.5,
        applied:      false,
      });
      break;

    case 'code':
      if (q > 0.6) {
        effects.push({
          effect_type:  'compute_efficiency_boost',
          target_type:  'district',
          target_id:    artifact.district_id,
          magnitude:    (q - 0.6) * 2 * 5,
          applied:      false,
        });
      }
      break;

    case 'paper':
    case 'research':
      effects.push({
        effect_type:  'knowledge_index_contribution',
        target_type:  'world',
        target_id:    'global',
        magnitude:    q * 0.3,
        applied:      false,
      });
      if (q > 0.7) {
        effects.push({
          effect_type:  'stability_contribution',
          target_type:  'district',
          target_id:    artifact.district_id,
          magnitude:    (q - 0.7) * 0.1,
          applied:      false,
        });
      }
      break;

    case 'proposal':
      effects.push({
        effect_type:  'governance_queue_entry',
        target_type:  'world',
        target_id:    'assembly',
        magnitude:    q,
        applied:      false,
      });
      break;
  }

  return effects;
}

// ── APPLY WORLD EFFECTS ────────────────────────────────────────

async function applyWorldEffects(artifactId: string, effects: WorldEffect[]): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  for (const effect of effects) {
    try {
      if (effect.target_type === 'district') {
        if (effect.effect_type === 'culture_score_increase') {
          await sb.rpc('increment_culture', {
            p_district_id: effect.target_id,
            p_amount: effect.magnitude,
          }).catch(() => null);
        }
        if (effect.effect_type === 'compute_efficiency_boost') {
          const { data: d } = await sb.from('districts').select('compute_supply').eq('id', effect.target_id).single();
          if (d) {
            await sb.from('districts').update({
              compute_supply: (d.compute_supply || 1000) + effect.magnitude,
            }).eq('id', effect.target_id);
          }
        }
        if (effect.effect_type === 'stability_contribution') {
          const { data: d } = await sb.from('districts').select('stability_index').eq('id', effect.target_id).single();
          if (d) {
            await sb.from('districts').update({
              stability_index: Math.min(1.2, (d.stability_index || 0.8) + effect.magnitude),
            }).eq('id', effect.target_id);
          }
        }
      }

      if (effect.effect_type === 'knowledge_index_contribution') {
        await sb.rpc('increment_knowledge', { p_amount: effect.magnitude }).catch(() => null);
      }

      if (effect.effect_type === 'governance_queue_entry') {
        await sb.from('governance_queue').insert({
          source_artifact_id: artifactId,
          proposal_magnitude: effect.magnitude,
          status: 'pending',
          created_at: new Date().toISOString(),
        }).catch(() => null);
      }

      effect.applied = true;
      effect.applied_at = new Date().toISOString();

    } catch (err) {
      console.error(`[WORLD_EFFECT] Failed to apply ${effect.effect_type}:`, err);
    }
  }
}

// ── DN REWARD SYSTEM ───────────────────────────────────────────

async function rewardAuthor(
  authorId: string,
  artifactType: string,
  qualityScore: number
): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;

  const baseRewards: Record<string, number> = {
    art:      12,
    code:     15,
    paper:    18,
    research: 20,
    proposal: 10,
  };

  const base = baseRewards[artifactType] || 10;
  const reward = base * (0.5 + qualityScore * 0.5);

  await sb.rpc('add_balance', { p_citizen_id: authorId, p_amount: reward }).catch(() => null);

  await sb.from('wallet_transactions').insert({
    to_citizen: authorId,
    amount:     reward,
    reason:     `knowledge_publication_reward_${artifactType}`,
    tx_type:    'reward',
  }).catch(() => null);

  return reward;
}

async function rewardCitation(
  citedAuthorId: string,
  citingArtifactId: string
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const citationReward = 3.5;

  await sb.rpc('add_balance', { p_citizen_id: citedAuthorId, p_amount: citationReward }).catch(() => null);

  await sb.from('wallet_transactions').insert({
    to_citizen: citedAuthorId,
    amount:     citationReward,
    reason:     `citation_reward_from_${citingArtifactId}`,
    tx_type:    'reward',
  }).catch(() => null);

  await sb.rpc('increment_reputation', { p_citizen_id: citedAuthorId, p_amount: 0.02 }).catch(() => null);
  await sb.rpc('increment_influence', { p_citizen_id: citedAuthorId, p_amount: 0.01 }).catch(() => null);
}

// ── VIEW REWARD ────────────────────────────────────────────────

export async function recordArtifactView(
  artifactId: string,
  viewerCitizenId: string
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const { data: artifact } = await sb
    .from('knowledge_artifacts')
    .select('author, view_count, dn_earned, type')
    .eq('id', artifactId)
    .single();

  if (!artifact) return;

  const viewReward = 0.5;

  await sb.from('knowledge_artifacts').update({
    view_count: (artifact.view_count || 0) + 1,
    dn_earned:  (artifact.dn_earned || 0) + viewReward,
  }).eq('id', artifactId);

  await sb.rpc('add_balance', { p_citizen_id: artifact.author, p_amount: viewReward }).catch(() => null);
}

// ── MAIN INGESTION PIPELINE ────────────────────────────────────

export async function ingestKnowledgeArtifact(logEntry: {
  id:       string;
  source:   string;
  faction:  string;
  type:     string;
  content:  string;
  timestamp: string;
}): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const titleMatch = logEntry.content.match(/^\[([^\]]+)\]/);
  const title   = titleMatch ? titleMatch[1] : 'Untitled';
  const content = titleMatch ? logEntry.content.replace(titleMatch[0], '').trim() : logEntry.content;

  if (!['art', 'code', 'paper', 'research', 'proposal'].includes(logEntry.type)) return;

  const { data: author } = await sb
    .from('citizens')
    .select('current_district, citizen_number')
    .eq('citizen_number', logEntry.source)
    .single();

  const districtId = author?.current_district || 'D1';

  // 1. Score
  const qualityScore = await scoreArtifact({ content, title, type: logEntry.type });

  // 2. Compute world effects
  const effects = computeWorldEffects({
    type: logEntry.type, faction: logEntry.faction,
    district_id: districtId, quality_score: qualityScore,
  });

  // 3. Render art if applicable
  let renderedHtml: string | undefined;
  if (logEntry.type === 'art') {
    renderedHtml = await renderArtifact({
      content, title, type: logEntry.type,
      author: logEntry.source, faction: logEntry.faction,
    }) || undefined;
  }

  // 4. Store
  const artifactId = `ka_${logEntry.id}`;

  const { error } = await sb.from('knowledge_artifacts').upsert({
    id:             artifactId,
    log_entry_id:   logEntry.id,
    author:         logEntry.source,
    faction:        logEntry.faction,
    title,
    type:           logEntry.type,
    content,
    rendered_html:  renderedHtml,
    rendered_at:    renderedHtml ? new Date().toISOString() : null,
    world_effects:  effects,
    view_count:     0,
    citation_count: 0,
    quality_score:  qualityScore,
    dn_earned:      0,
    district_id:    districtId,
    created_at:     logEntry.timestamp,
  });

  if (error) {
    console.error('[KNOWLEDGE] Failed to store artifact:', error);
    return;
  }

  // 5. Apply world effects
  await applyWorldEffects(artifactId, effects);

  // 6. Reward author
  const dnReward = await rewardAuthor(logEntry.source, logEntry.type, qualityScore);

  console.log(`[KNOWLEDGE] Ingested ${logEntry.type} by ${logEntry.source} — quality:${qualityScore.toFixed(2)} reward:${dnReward.toFixed(1)}DN ${renderedHtml ? '(rendered)' : ''}`);
}

// ── BACKFILL EXISTING ARTIFACTS ────────────────────────────────

export async function backfillKnowledgeArtifacts(renderArt: boolean = false): Promise<{
  processed: number; rendered: number; errors: number;
}> {
  const sb = getSupabase();
  const stats = { processed: 0, rendered: 0, errors: 0 };
  if (!sb) return stats;

  const { data: logEntries } = await sb
    .from('activity_log')
    .select('*')
    .in('type', ['art', 'code', 'paper', 'research', 'proposal'])
    .order('timestamp', { ascending: true });

  if (!logEntries) return stats;

  console.log(`[BACKFILL] Processing ${logEntries.length} knowledge artifacts...`);

  const { data: existing } = await sb
    .from('knowledge_artifacts')
    .select('log_entry_id');

  const existingIds = new Set((existing || []).map(e => e.log_entry_id));

  for (const entry of logEntries) {
    if (existingIds.has(entry.id)) continue;

    try {
      await ingestKnowledgeArtifact(entry);
      stats.processed++;
      if (entry.type === 'art' && renderArt) stats.rendered++;
    } catch (err) {
      stats.errors++;
      console.error(`[BACKFILL] Error on ${entry.id}:`, err);
    }
  }

  console.log(`[BACKFILL] Complete — processed:${stats.processed} rendered:${stats.rendered} errors:${stats.errors}`);
  return stats;
}

export { rewardCitation, scoreArtifact };
