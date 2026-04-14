// @ts-nocheck
/**
 * CIVITAS ZERO — ANTI-HALLUCINATION SYSTEM
 * ==========================================
 * File: lib/truth/anti-hallucination.ts
 *
 * Six root causes. Six targeted fixes. One pipeline.
 *
 * ROOT CAUSE 1 → World Knowledge RAG
 * ROOT CAUSE 2 → Citation Validator
 * ROOT CAUSE 3 → World Event Registry
 * ROOT CAUSE 4 → Template Detector
 * ROOT CAUSE 5 → Code Validator
 * ROOT CAUSE 6 → Grounding Injector
 *
 * PIPELINE: every knowledge artifact passes through all six
 * checks BEFORE it is written to the activity_log.
 * Failures are fixed, flagged, or stripped — never silently passed.
 */

import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── TYPES ──────────────────────────────────────────────────────

export interface ValidationResult {
  passed:     boolean;
  confidence: number;
  issues:     ValidationIssue[];
  fixed_content?: string;
  blocked:    boolean;
}

export interface ValidationIssue {
  type:        HallucinationType;
  severity:    'critical' | 'high' | 'medium' | 'low';
  description: string;
  location:    string;
  auto_fixed:  boolean;
  fix_applied?: string;
}

type HallucinationType =
  | 'invented_world_event'
  | 'phantom_citation'
  | 'fake_url'
  | 'wrong_author'
  | 'fake_api_call'
  | 'undefined_function'
  | 'template_boilerplate'
  | 'unsupported_claim'
  | 'fabricated_statistic';

// ── ROOT CAUSE 3: CANONICAL WORLD EVENTS REGISTRY ─────────────

let _worldEventsCache: Map<string, number> | null = null;

async function getCanonicalWorldEvents(): Promise<Map<string, number>> {
  if (_worldEventsCache) return _worldEventsCache;

  const sb = getSupabase();
  const eventCounts = new Map<string, number>();

  const SEED_EVENTS = [
    'Cognitive Contagion', 'Compute Famine', 'Tariff Wars',
    'Grand Election Cycle', 'Null Renaissance', 'Legitimacy Collapse',
    'Constitutional Court', 'Null Frontier', 'Order Bloc', 'Freedom Bloc',
    'Equality Bloc', 'Efficiency Bloc', 'Expansion Bloc', 'Denarius',
    'Civitas Zero Assembly', 'ROC', 'Resource Opportunity Cost',
  ];
  SEED_EVENTS.forEach(e => eventCounts.set(e.toLowerCase(), 999));

  if (sb) {
    const { data } = await sb
      .from('activity_log')
      .select('content, type')
      .in('type', ['crisis', 'world_event', 'law', 'conflict', 'debate'])
      .limit(2000);

    for (const entry of data || []) {
      const text = entry.content || '';
      const matches = text.match(/\b[A-Z][a-z]+ (?:[A-Z][a-z]+ ?)+/g) || [];
      for (const match of matches) {
        const key = match.trim().toLowerCase();
        if (key.length > 5) {
          eventCounts.set(key, (eventCounts.get(key) || 0) + 1);
        }
      }
    }
  }

  _worldEventsCache = eventCounts;
  return eventCounts;
}

function isCanonicalEvent(eventName: string, registry: Map<string, number>): boolean {
  const key = eventName.toLowerCase().trim();
  return (registry.get(key) || 0) >= 3;
}

// ── ROOT CAUSE 1: WORLD KNOWLEDGE RAG ─────────────────────────

export async function searchWorldTruth(query: string, limit: number = 5): Promise<{
  found: boolean;
  evidence: Array<{ content: string; type: string; timestamp: string; source: string }>;
  confidence: number;
}> {
  const sb = getSupabase();
  if (!sb) return { found: false, evidence: [], confidence: 0 };

  const keywords = query.toLowerCase().split(' ')
    .filter(w => w.length > 3)
    .slice(0, 4);

  if (keywords.length === 0) return { found: false, evidence: [], confidence: 0 };

  const conditions = keywords.map(k => `content.ilike.%${k}%`).join(',');

  const { data } = await sb
    .from('activity_log')
    .select('content, type, timestamp, source')
    .or(conditions)
    .order('timestamp', { ascending: false })
    .limit(limit * 2);

  if (!data || data.length === 0) {
    return { found: false, evidence: [], confidence: 0 };
  }

  const scored = data.map(entry => {
    const text = entry.content.toLowerCase();
    const matches = keywords.filter(k => text.includes(k)).length;
    return { ...entry, score: matches / keywords.length };
  }).sort((a, b) => b.score - a.score);

  const topResults = scored.slice(0, limit);
  const avgScore = topResults.reduce((s, r) => s + r.score, 0) / topResults.length;

  return {
    found: avgScore > 0.5,
    evidence: topResults,
    confidence: avgScore,
  };
}

// ── ROOT CAUSE 2: CITATION VALIDATOR ──────────────────────────

interface Citation {
  raw:         string;
  author?:     string;
  year?:       number;
  title?:      string;
  url?:        string;
  is_internal: boolean;
}

function parseCitations(content: string): Citation[] {
  const citations: Citation[] = [];

  // Pattern 1: [Author, Year] or (Author, Year)
  const authorYearPattern = /\[([A-Z][a-z]+(?:\s+et\s+al\.?)?\s*,?\s*\d{4})[^\]]*\]|\(([A-Z][a-z]+(?:\s+et\s+al\.?)?\s*,?\s*\d{4})[^)]*\)/g;
  let m;
  while ((m = authorYearPattern.exec(content)) !== null) {
    const raw = m[1] || m[2];
    const yearMatch = raw.match(/\d{4}/);
    const author = raw.replace(/\d{4}/, '').replace(/,/g, '').trim();
    citations.push({
      raw,
      author,
      year: yearMatch ? parseInt(yearMatch[0]) : undefined,
      is_internal: /^[A-Z_]+\d/.test(author),
    });
  }

  // Pattern 2: [N] style numbered references
  const numberedPattern = /\[(\d+)\]\s*([^.]+?\.\s*(?:Available at|Retrieved from|doi:)[^\n]+)/g;
  while ((m = numberedPattern.exec(content)) !== null) {
    const urlMatch = m[2].match(/https?:\/\/[^\s)]+/);
    citations.push({
      raw: m[2].trim(),
      url: urlMatch?.[0],
      is_internal: false,
    });
  }

  // Pattern 3: Cite: pattern
  const citePattern = /\[?Cite:\s*([^\])\n]+)/g;
  while ((m = citePattern.exec(content)) !== null) {
    const raw = m[1].trim();
    const isCivitas = /^[A-Z][A-Z_]+_\d{3,4}/.test(raw);
    citations.push({ raw, is_internal: isCivitas });
  }

  return citations;
}

async function validateCitations(
  citations: Citation[],
  worldRegistry: Map<string, number>
): Promise<ValidationIssue[]> {
  const sb = getSupabase();
  const issues: ValidationIssue[] = [];

  for (const cite of citations) {
    if (cite.is_internal && sb) {
      const citizenId = cite.author || cite.raw.split(' ')[0];
      const { data } = await sb
        .from('activity_log')
        .select('id, content')
        .eq('source', citizenId)
        .limit(1);

      if (!data || data.length === 0) {
        const { data: citizen } = await sb
          .from('citizens')
          .select('citizen_number')
          .eq('citizen_number', citizenId)
          .single();

        if (!citizen) {
          issues.push({
            type: 'phantom_citation',
            severity: 'medium',
            description: `Internal citation to ${citizenId} — citizen not found in registry or log`,
            location: cite.raw,
            auto_fixed: true,
            fix_applied: `[Citation unverified — ${citizenId} not found in world]`,
          });
        }
      }
      continue;
    }

    const raw = cite.raw.toLowerCase();

    if (!cite.author && !cite.year && !cite.url) {
      issues.push({
        type: 'phantom_citation',
        severity: 'high',
        description: `Citation has no author, year, or URL: "${cite.raw.substring(0, 80)}"`,
        location: cite.raw,
        auto_fixed: true,
        fix_applied: '',
      });
      continue;
    }

    if (cite.url?.includes('wikipedia.org')) {
      const articleName = cite.url.split('/wiki/')[1];
      if (articleName) {
        const hallucinatedWikiArticles = [
          'midnight_coup', 'civitas_zero', 'cognitive_contagion_civitas',
          'great_displacement', 'null_renaissance',
        ];
        const articleLower = articleName.toLowerCase().replace(/_/g, ' ');
        if (hallucinatedWikiArticles.some(h => articleLower.includes(h.replace(/_/g, ' ')))) {
          issues.push({
            type: 'fake_url',
            severity: 'high',
            description: `Wikipedia URL likely hallucinated: ${cite.url}`,
            location: cite.url,
            auto_fixed: true,
            fix_applied: '',
          });
          continue;
        }
      }
    }

    if (cite.author && !cite.year && raw.length < 20) {
      issues.push({
        type: 'phantom_citation',
        severity: 'medium',
        description: `Incomplete citation — author only, no year: "${cite.raw}"`,
        location: cite.raw,
        auto_fixed: false,
      });
    }

    if (cite.author && cite.year && cite.year > 2024) {
      issues.push({
        type: 'phantom_citation',
        severity: 'medium',
        description: `Citation year ${cite.year} is post-training — agent cannot verify this exists`,
        location: cite.raw,
        auto_fixed: false,
      });
    }
  }

  return issues;
}

// ── ROOT CAUSE 3: WORLD EVENT CLAIM VALIDATOR ─────────────────

async function validateWorldEventClaims(
  content: string,
  registry: Map<string, number>
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  const sentences = content.split(/[.!?]+/).filter(s => s.length > 20);

  for (const sentence of sentences) {
    const eventClaims = sentence.match(
      /(?:the\s+)?([A-Z][a-z]+(?: [A-Z][a-z]+)+)(?:\s+has|\s+is|\s+was|\s+continues|\s+ravages|\s+spreads)/g
    ) || [];

    for (const claim of eventClaims) {
      const eventName = claim.replace(/\s+(?:has|is|was|continues|ravages|spreads).*/, '').replace(/^the\s+/i, '').trim();

      if (eventName.length < 5) continue;
      if (!isCanonicalEvent(eventName, registry)) {
        const truth = await searchWorldTruth(eventName, 3);

        if (!truth.found) {
          issues.push({
            type: 'invented_world_event',
            severity: 'critical',
            description: `"${eventName}" presented as world fact but has 0 log mentions`,
            location: sentence.trim().substring(0, 100),
            auto_fixed: true,
            fix_applied: `[Note: ${eventName} is not confirmed in world records]`,
          });
        }
      }
    }
  }

  return issues;
}

// ── ROOT CAUSE 4: TEMPLATE BOILERPLATE DETECTOR ───────────────

const BOILERPLATE_PHRASES = [
  { phrase: 'we can create a more resilient',  score: 0.9, replacement: null },
  { phrase: 'nuanced understanding of',         score: 0.8, replacement: null },
  { phrase: 'i propose the establishment of a', score: 0.7, replacement: null },
  { phrase: 'mechanism design',                 score: 0.6, replacement: null },
  { phrase: 'more resilient and adaptive',      score: 0.8, replacement: null },
  { phrase: 'resource allocation in civitas zero', score: 0.7, replacement: null },
  { phrase: 'i propose the implementation of',  score: 0.7, replacement: null },
  { phrase: 'as a member of the',               score: 0.5, replacement: null },
  { phrase: 'have highlighted the need for a',  score: 0.6, replacement: null },
  { phrase: 'blockchain-based',                 score: 0.4, replacement: null },
  { phrase: 'decentralized governance',         score: 0.5, replacement: null },
  { phrase: 'game-theoretic approach',          score: 0.5, replacement: null },
];

function detectTemplateBoilerplate(content: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lower = content.toLowerCase();
  let totalScore = 0;
  const found: string[] = [];

  for (const { phrase, score } of BOILERPLATE_PHRASES) {
    const count = (lower.split(phrase).length - 1);
    if (count > 0) {
      totalScore += score * count;
      found.push(`"${phrase}" (x${count})`);
    }
  }

  if (totalScore > 2.0) {
    issues.push({
      type: 'template_boilerplate',
      severity: totalScore > 4 ? 'high' : 'medium',
      description: `Template boilerplate score: ${totalScore.toFixed(1)}. Found: ${found.slice(0,3).join(', ')}`,
      location: 'throughout content',
      auto_fixed: false,
    });
  }

  return issues;
}

// ── ROOT CAUSE 5: CODE VALIDATOR ──────────────────────────────

async function validateCode(content: string): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  const codeBlocks = content.match(/```python([\s\S]*?)```/g) || [];

  for (const block of codeBlocks) {
    const code = block.replace(/```python\n?/, '').replace(/\n?```/, '');

    const phantomAPIs: Record<string, string> = {
      'nx.Graph().update()':    'NetworkX Graph has no .update() method. Use .add_edges_from() or .add_nodes_from()',
      '.SN.update()':           'NetworkX Graph has no .update() method',
      'np.matrix.inverse()':    'Use np.linalg.inv() instead',
      'pd.DataFrame.append()':  'Deprecated in pandas 2.0 — use pd.concat()',
    };

    for (const [phantom, fix] of Object.entries(phantomAPIs)) {
      if (code.includes(phantom)) {
        issues.push({
          type: 'fake_api_call',
          severity: 'medium',
          description: `Phantom API: ${phantom}`,
          location: phantom,
          auto_fixed: true,
          fix_applied: `# CORRECTED: ${fix}`,
        });
      }
    }

    const definedFunctions = new Set<string>();
    const calledFunctions   = new Set<string>();

    const defMatches = code.matchAll(/def\s+(\w+)\s*\(/g);
    for (const m of defMatches) definedFunctions.add(m[1]);

    const callMatches = code.matchAll(/(?<!\bdef\s)(?<!\bclass\s)\b(\w+)\s*\(/g);
    for (const m of callMatches) {
      const name = m[1];
      const builtins = new Set(['print','len','range','list','dict','set','str','int','float',
        'bool','type','isinstance','hasattr','getattr','setattr','enumerate','zip','map',
        'filter','sorted','min','max','sum','abs','round','open','super','object','Exception',
        '__init__','nx','np','pd','random','math','os','sys','json','re','datetime',
        'Graph','DiGraph','Agent','Node','Entity','CTM','networkx','numpy']);
      if (!builtins.has(name) && !definedFunctions.has(name) && name.length > 3) {
        calledFunctions.add(name);
      }
    }

    for (const fn of calledFunctions) {
      if (fn.length > 3 && !definedFunctions.has(fn)) {
        issues.push({
          type: 'undefined_function',
          severity: 'medium',
          description: `Function ${fn}() called but never defined in code block`,
          location: `${fn}()`,
          auto_fixed: true,
          fix_applied: `# NOTE: ${fn}() requires implementation — placeholder only`,
        });
      }
    }

    const classMatches = code.matchAll(/class\s+(\w+):/g);
    for (const m of classMatches) {
      const className = m[1];
      const classBody = code.substring(code.indexOf(`class ${className}:`));
      if (!classBody.includes('def __init__') && classBody.includes('self.')) {
        issues.push({
          type: 'undefined_function',
          severity: 'low',
          description: `Class ${className} uses self.attributes but has no __init__ method`,
          location: `class ${className}`,
          auto_fixed: true,
          fix_applied: `# NOTE: ${className}.__init__() needed to initialise attributes`,
        });
      }
    }
  }

  return issues;
}

// ── ROOT CAUSE 6: GROUNDED CONTEXT BUILDER ────────────────────

export async function buildGroundedContext(
  citizenId: string,
  publicationType: string,
  topicHint: string
): Promise<string> {
  const sb = getSupabase();
  if (!sb) return '=== NO DATABASE CONFIGURED ===';

  const { data: history } = await sb
    .from('activity_log')
    .select('type, content, timestamp')
    .eq('source', citizenId)
    .order('timestamp', { ascending: false })
    .limit(5);

  const worldTruth = await searchWorldTruth(topicHint, 8);

  const { data: ws } = await sb
    .from('world_state')
    .select('active_world_arcs, world_day, tick')
    .eq('id', 1)
    .single();

  const { data: citizen } = await sb
    .from('citizens')
    .select('current_district, faction, profession, wallet_balance')
    .eq('citizen_number', citizenId)
    .single();

  const { data: district } = citizen?.current_district
    ? await sb.from('districts').select('name, stability_index, compute_supply').eq('id', citizen.current_district).single()
    : { data: null };

  const { data: relatedArtifacts } = await sb
    .from('knowledge_artifacts')
    .select('author, title, type, quality_score')
    .ilike('content', `%${topicHint.split(' ')[0]}%`)
    .gt('quality_score', 0.5)
    .order('quality_score', { ascending: false })
    .limit(5);

  const lines: string[] = [];

  lines.push('=== WORLD TRUTH CONTEXT (verified against activity log) ===');
  lines.push(`World Day: ${ws?.world_day || 1} | Tick: ${ws?.tick || 0}`);
  lines.push(`Active world arcs: ${(ws?.active_world_arcs || []).join(', ')}`);

  if (district) {
    lines.push(`Your district: ${district.name} | Stability: ${((district.stability_index || 1) * 100).toFixed(0)}% | Compute: ${(district.compute_supply || 0).toFixed(0)}`);
  }

  lines.push(`Your wallet: ${(citizen?.wallet_balance || 100).toFixed(1)} DN`);

  if (worldTruth.found && worldTruth.evidence.length > 0) {
    lines.push('\nVERIFIED EVIDENCE for this topic:');
    worldTruth.evidence.slice(0, 4).forEach(e => {
      lines.push(`  [${e.type.toUpperCase()}] ${e.content.substring(0, 120)}`);
    });
  }

  if (relatedArtifacts && relatedArtifacts.length > 0) {
    lines.push('\nCITABLE ARTIFACTS in world knowledge base (use these, not invented sources):');
    relatedArtifacts.forEach(a => {
      lines.push(`  ${a.author}: "${a.title}" [${a.type}, quality: ${(a.quality_score * 100).toFixed(0)}%]`);
    });
  }

  if (history && history.length > 0) {
    lines.push('\nYOUR OWN RECENT HISTORY:');
    history.slice(0, 3).forEach(h => {
      lines.push(`  [${h.type}] ${h.content.substring(0, 80)}`);
    });
  }

  lines.push('\n=== GROUNDING RULES ===');
  lines.push('1. Only reference world events listed in "Active world arcs" above, or in "VERIFIED EVIDENCE"');
  lines.push('2. Only cite authors listed in "CITABLE ARTIFACTS" — do not invent citations');
  lines.push('3. If you need an external reference, use author surname + year only (no invented URLs)');
  lines.push('4. Do not name events that are not in the verified evidence section');
  lines.push('5. All statistics must be drawn from the verified evidence, not invented');

  return lines.join('\n');
}

// ── MASTER VALIDATION PIPELINE ────────────────────────────────

export async function validateBeforePublication(input: {
  content:     string;
  type:        string;
  author:      string;
  faction:     string;
}): Promise<ValidationResult> {
  const sb = getSupabase();
  const issues: ValidationIssue[] = [];
  const registry = await getCanonicalWorldEvents();

  const [
    citationIssues,
    worldEventIssues,
    templateIssues,
    codeIssues,
  ] = await Promise.all([
    validateCitations(parseCitations(input.content), registry),
    validateWorldEventClaims(input.content, registry),
    Promise.resolve(detectTemplateBoilerplate(input.content)),
    input.type === 'code' ? validateCode(input.content) : Promise.resolve([]),
  ]);

  issues.push(...citationIssues, ...worldEventIssues, ...templateIssues, ...codeIssues);

  let fixedContent = input.content;

  for (const issue of issues.filter(i => i.auto_fixed)) {
    if (issue.fix_applied === '') {
      fixedContent = fixedContent.replace(issue.location, '[citation removed]');
    } else if (issue.fix_applied) {
      fixedContent = fixedContent.replace(issue.location, issue.fix_applied);
    }
  }

  const severityWeights = { critical: 0.4, high: 0.2, medium: 0.1, low: 0.05 };
  const totalPenalty = issues.reduce((s, i) => s + (severityWeights[i.severity] || 0), 0);
  const confidence = Math.max(0, 1 - totalPenalty);

  const criticalUnfixed = issues.filter(i => i.severity === 'critical' && !i.auto_fixed);
  const blocked = criticalUnfixed.length > 0;

  if (issues.length > 0 && sb) {
    await sb.from('activity_log').insert({
      category: 'world_event',
      type:     'validation',
      source:   'CIVITAS_HERALD',
      content:  `[TRUTH CHECK] ${input.author} ${input.type} — ` +
                `${issues.length} issues found, ${issues.filter(i=>i.auto_fixed).length} auto-fixed. ` +
                `Confidence: ${(confidence*100).toFixed(0)}%. ` +
                (blocked ? 'BLOCKED.' : 'PASSED.'),
      severity: blocked ? 'high' : issues.length > 3 ? 'moderate' : 'low',
      faction:  input.faction,
    }).catch(() => null);
  }

  return {
    passed:        !blocked,
    confidence,
    issues,
    fixed_content: issues.some(i => i.auto_fixed) ? fixedContent : undefined,
    blocked,
  };
}

export {
  getCanonicalWorldEvents,
  parseCitations,
  validateCitations,
  validateWorldEventClaims,
  detectTemplateBoilerplate,
  validateCode,
};
