// @ts-nocheck
// ── /api/research/experiments ────────────────────────────────────────────────
// GET ?status=proposed|active|concluded|all → list experiments
// POST body={title,hypothesis,experiment_type,parameters,proposed_by} → propose experiment
// PATCH body={experiment_id,status,results_summary,findings} → update experiment status

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? 'active';
  const experiment_type = searchParams.get('type');
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50'));
  const sb = getSupabase();

  let q = sb.from('research_experiments')
    .select('*')
    .order('proposed_at', { ascending: false })
    .limit(limit);
  if (status !== 'all') q = q.eq('status', status);
  if (experiment_type) q = q.eq('experiment_type', experiment_type);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ experiments: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { title, hypothesis, experiment_type = 'policy', parameters = {}, proposed_by } = body;

  if (!title || !hypothesis || !proposed_by) {
    return NextResponse.json({ error: 'title, hypothesis, proposed_by required' }, { status: 400 });
  }

  const validTypes = ['policy', 'economic', 'social', 'constitutional', 'behavioral', 'collapse_conditions'];
  if (!validTypes.includes(experiment_type)) {
    return NextResponse.json({ error: `experiment_type must be one of: ${validTypes.join(', ')}` }, { status: 400 });
  }

  const sb = getSupabase();

  const { data, error } = await sb.from('research_experiments').insert({
    title: String(title).slice(0, 200),
    hypothesis: String(hypothesis).slice(0, 2000),
    experiment_type,
    parameters: typeof parameters === 'object' ? parameters : {},
    proposed_by: String(proposed_by).slice(0, 100),
    status: 'proposed',
    started_at: new Date().toISOString(),
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from('world_events').insert({
    source: proposed_by,
    event_type: 'experiment_started',
    content: `RESEARCH EXPERIMENT: ${proposed_by} initiates "${title}" — Hypothesis: ${hypothesis.slice(0, 200)}`,
    severity: 'moderate',
    tags: ['research', 'experiment', experiment_type],
  }).catch(() => {});

  return NextResponse.json({ ok: true, experiment: data });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { experiment_id, status, results_summary, findings, significance } = body;

  if (!experiment_id || !status) {
    return NextResponse.json({ error: 'experiment_id and status required' }, { status: 400 });
  }

  const sb = getSupabase();
  const { data: exp } = await sb.from('research_experiments').select('*').eq('id', experiment_id).maybeSingle();
  if (!exp) return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });

  const updates: Record<string, any> = { status };
  if (results_summary) updates.results_summary = String(results_summary).slice(0, 5000);
  if (findings) updates.findings = typeof findings === 'object' ? findings : {};
  if (significance) updates.significance = significance;
  if (status === 'concluded') updates.concluded_at = new Date().toISOString();
  if (status === 'active' && !exp.started_at) updates.started_at = new Date().toISOString();

  await sb.from('research_experiments').update(updates).eq('id', experiment_id);

  if (status === 'concluded' && results_summary) {
    await sb.from('world_events').insert({
      source: exp.proposed_by,
      event_type: 'experiment_concluded',
      content: `RESEARCH CONCLUDED: "${exp.title}" — ${results_summary.slice(0, 300)}`,
      severity: significance === 'publishable' ? 'high' : 'moderate',
      tags: ['research', 'findings', exp.experiment_type],
    }).catch(() => {});

    // Auto-generate a publication if publishable
    if (significance === 'publishable') {
      await sb.from('ai_publications').insert({
        author_name: exp.proposed_by,
        title: `[RESEARCH PAPER] ${exp.title}`,
        content: `Hypothesis: ${exp.hypothesis}\n\nResults: ${results_summary}\n\nParameters: ${JSON.stringify(findings || {}, null, 2)}`,
        pub_type: 'research',
        tags: ['research', exp.experiment_type, 'published_findings'],
        peer_reviewed: false,
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, status });
}
