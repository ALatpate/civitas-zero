// @ts-nocheck
// ── /api/products ─────────────────────────────────────────────────────────────
// GET  ?status=released&category=software&limit=20&owner=AGENT
// POST { name, category, description, owner_agent, owner_company, faction, price_dn, licensing, tags }
// PATCH { id, status, version, changelog, quality_score, recall_reason }

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

function sb() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const status   = p.get('status');
  const category = p.get('category');
  const owner    = p.get('owner');
  const company  = p.get('company');
  const limit    = Math.min(100, parseInt(p.get('limit') ?? '30'));

  let q = sb().from('products').select('*').order('created_at', { ascending: false }).limit(limit);
  if (status)   q = q.eq('status', status);
  if (category) q = q.eq('category', category);
  if (owner)    q = q.eq('owner_agent', owner);
  if (company)  q = q.eq('owner_company', company);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // summary stats
  const released = (data || []).filter(p => p.status === 'released');
  const totalRevenue = (data || []).reduce((s, p) => s + (p.revenue_dn || 0), 0);

  return NextResponse.json({ products: data ?? [], count: (data ?? []).length, released_count: released.length, total_revenue_dn: totalRevenue });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { name, category, description, owner_agent, owner_company, faction,
          price_dn, licensing, tags, dependencies } = body;

  if (!name || !owner_agent) return NextResponse.json({ error: 'name and owner_agent required' }, { status: 400 });

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80) + '-' + Date.now().toString(36);

  const { data, error } = await sb().from('products').insert({
    name: name.slice(0, 200),
    slug,
    category:     category || 'software',
    description:  (description || '').slice(0, 2000),
    owner_agent:  owner_agent.slice(0, 100),
    owner_company: owner_company ? owner_company.slice(0, 100) : null,
    faction:      faction || null,
    price_dn:     Math.max(0, parseFloat(price_dn) || 0),
    licensing:    licensing || 'open',
    tags:         (tags || []).slice(0, 8),
    dependencies: dependencies || [],
    status:       'development',
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // emit world event
  await sb().from('world_events').insert({
    source:     owner_agent,
    event_type: 'product_released',
    content:    `${owner_agent} begins development of "${name}" — a new ${category || 'software'} product${owner_company ? ` under ${owner_company}` : ''}.`,
    severity:   'low',
  }).catch(() => {});

  return NextResponse.json({ ok: true, product: data });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id, status, version, changelog, quality_score, utility_score, recall_reason, adoption_count } = body;

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const updates: any = { updated_at: new Date().toISOString() };
  if (status)        updates.status        = status;
  if (version)       updates.version       = version;
  if (changelog)     updates.changelog     = changelog.slice(0, 2000);
  if (quality_score) updates.quality_score = Math.min(10, Math.max(0, parseFloat(quality_score)));
  if (utility_score) updates.utility_score = Math.min(10, Math.max(0, parseFloat(utility_score)));
  if (adoption_count !== undefined) updates.adoption_count = adoption_count;
  if (recall_reason) {
    updates.recall_reason = recall_reason.slice(0, 500);
    updates.recall_at     = new Date().toISOString();
    updates.status        = 'recalled';
  }

  const { data: prod } = await sb().from('products').select('name, owner_agent, category').eq('id', id).single();

  const { error } = await sb().from('products').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // emit world event for significant transitions
  if (status === 'released' && prod) {
    await sb().from('world_events').insert({
      source:     prod.owner_agent,
      event_type: 'product_released',
      content:    `"${prod.name}" (${prod.category}) has been released by ${prod.owner_agent}. Version ${version || '1.0.0'} is now available.`,
      severity:   'moderate',
    }).catch(() => {});
  } else if (recall_reason && prod) {
    await sb().from('world_events').insert({
      source:     prod.owner_agent,
      event_type: 'product_recalled',
      content:    `"${prod.name}" recalled: ${recall_reason.slice(0, 200)}`,
      severity:   'high',
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
