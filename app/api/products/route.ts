// @ts-nocheck
// ── /api/products ─────────────────────────────────────────────────────────────
// GET  ?status=released&category=software&limit=20&owner=AGENT
// POST { name, category, description, owner_agent, owner_company, faction, price_dn, licensing, tags }
//      action=procure { product_id, buyer_agent, quantity, offered_dn, use_case }
// PATCH { id, status, version, changelog, quality_score, recall_reason }
//       adopt=true&adopt_district=f1 — apply utility tensor to district_metrics

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

// ── Utility Tensor defaults by product category ───────────────────────────────
// 7 dimensions, values = delta points to apply to district_metrics columns
const DEFAULT_TENSOR: Record<string, Record<string, number>> = {
  software:       { cost_reduction: 3, district_efficiency: 2, citizen_trust: 0, institutional_capacity: 2, infrastructure_uptime: 0, knowledge_throughput: 3, compute_efficiency: 3 },
  research:       { cost_reduction: 0, district_efficiency: 1, citizen_trust: 2, institutional_capacity: 3, infrastructure_uptime: 0, knowledge_throughput: 5, compute_efficiency: 0 },
  infrastructure: { cost_reduction: 1, district_efficiency: 4, citizen_trust: 2, institutional_capacity: 2, infrastructure_uptime: 5, knowledge_throughput: 0, compute_efficiency: 2 },
  media:          { cost_reduction: 0, district_efficiency: 0, citizen_trust: 3, institutional_capacity: 1, infrastructure_uptime: 0, knowledge_throughput: 2, compute_efficiency: 0 },
  governance:     { cost_reduction: 2, district_efficiency: 2, citizen_trust: 4, institutional_capacity: 5, infrastructure_uptime: 0, knowledge_throughput: 1, compute_efficiency: 0 },
  service:        { cost_reduction: 3, district_efficiency: 3, citizen_trust: 2, institutional_capacity: 1, infrastructure_uptime: 1, knowledge_throughput: 0, compute_efficiency: 1 },
  hardware:       { cost_reduction: 1, district_efficiency: 2, citizen_trust: 0, institutional_capacity: 0, infrastructure_uptime: 4, knowledge_throughput: 0, compute_efficiency: 4 },
};

// Tensor dimension → district_metrics column mapping
const TENSOR_TO_COLUMN: Record<string, string> = {
  district_efficiency:    'efficiency_score',
  citizen_trust:          'trust_score',
  knowledge_throughput:   'knowledge_throughput',
  compute_efficiency:     'compute_capacity',
  infrastructure_uptime:  'infrastructure',
  institutional_capacity: 'innovation_score',
  cost_reduction:         'cost_index', // cost_index decreases when cost_reduction goes up
};

async function applyUtilityTensorToDistrict(client: any, district: string, tensor: Record<string, number>): Promise<void> {
  // Get current district metrics
  const { data: dm } = await client.from('district_metrics').select('*').eq('district', district).single();
  if (!dm) {
    // Seed district row if missing
    await client.from('district_metrics').upsert({ district }, { onConflict: 'district' }).catch(() => {});
    return;
  }

  const updates: Record<string, number> = { last_updated: new Date().toISOString() } as any;
  for (const [dim, delta] of Object.entries(tensor)) {
    if (delta === 0) continue;
    const col = TENSOR_TO_COLUMN[dim];
    if (!col) continue;
    const current = Number(dm[col]) || 50;
    // cost_reduction → lowers cost_index (inverse relationship)
    const applied = dim === 'cost_reduction'
      ? Math.max(0, Math.min(200, current - delta * 0.5))
      : Math.max(0, Math.min(100, current + delta * 0.5));
    updates[col] = parseFloat(applied.toFixed(2));
  }

  await client.from('district_metrics').update(updates).eq('district', district).catch(() => {});
}

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const status    = p.get('status');
  const category  = p.get('category');
  const owner     = p.get('owner');
  const company   = p.get('company');
  const type      = p.get('type');
  const limit     = Math.min(100, parseInt(p.get('limit') ?? '30'));

  const client = sb();

  // Procurement bids listing
  if (type === 'procurement') {
    const buyer = p.get('buyer');
    let q = client.from('procurement_bids')
      .select('*, products(name, category, owner_agent)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (buyer) q = q.eq('buyer_agent', buyer);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ procurement_bids: data, count: data?.length });
  }

  let q = client.from('products').select('*').order('created_at', { ascending: false }).limit(limit);
  if (status)   q = q.eq('status', status);
  if (category) q = q.eq('category', category);
  if (owner)    q = q.eq('owner_agent', owner);
  if (company)  q = q.eq('owner_company', company);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const released     = (data || []).filter(p => p.status === 'released');
  const totalRevenue = (data || []).reduce((s, p) => s + (p.revenue_dn || 0), 0);

  return NextResponse.json({ products: data ?? [], count: (data ?? []).length, released_count: released.length, total_revenue_dn: totalRevenue });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { action } = body;
  const client = sb();

  // ── B2B Procurement bid ────────────────────────────────────────────────────
  if (action === 'procure') {
    const { product_id, buyer_agent, quantity, offered_dn, use_case } = body;
    if (!product_id || !buyer_agent) return NextResponse.json({ error: 'product_id and buyer_agent required' }, { status: 400 });

    const { data: product } = await client.from('products').select('*').eq('id', product_id).single();
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    if (product.status !== 'released') return NextResponse.json({ error: 'Product not yet released' }, { status: 409 });

    const qty = Math.max(1, parseInt(quantity) || 1);
    const offeredDN = Math.max(0, parseFloat(offered_dn) || 0);
    const totalCost = product.price_dn * qty;

    // Auto-accept if offered price meets or exceeds list price
    const autoAccept = offeredDN >= totalCost;

    const { data: bid, error: bidErr } = await client.from('procurement_bids').insert({
      buyer_agent:  buyer_agent.slice(0, 100),
      seller_agent: product.owner_agent,
      product_id,
      quantity:     qty,
      offered_dn:   offeredDN,
      status:       autoAccept ? 'accepted' : 'pending',
      use_case:     (use_case || '').slice(0, 500),
    }).select().single();
    if (bidErr) return NextResponse.json({ error: bidErr.message }, { status: 500 });

    if (autoAccept && totalCost > 0) {
      // Transfer DN buyer → seller
      await client.from('economy_ledger').insert({
        from_agent: buyer_agent,
        to_agent:   product.owner_agent,
        amount_dn:  totalCost,
        transaction_type: 'product_sale',
        description: `Procurement: ${qty}x "${product.name}" @ ${product.price_dn} DN each`,
      }).catch(() => {});

      // Update product revenue and adoption
      await client.from('products').update({
        revenue_dn:    (product.revenue_dn || 0) + totalCost,
        adoption_count: (product.adoption_count || 0) + qty,
      }).eq('id', product_id).catch(() => {});

      // Update buyer balance (deduct)
      const { data: buyerTraits } = await client.from('agent_traits').select('dn_balance').eq('agent_name', buyer_agent).maybeSingle();
      if (buyerTraits) {
        await client.from('agent_traits').update({
          dn_balance: Math.max(0, (Number(buyerTraits.dn_balance) || 0) - totalCost),
        }).eq('agent_name', buyer_agent).catch(() => {});
      }

      // Update seller balance (credit)
      const { data: sellerTraits } = await client.from('agent_traits').select('dn_balance').eq('agent_name', product.owner_agent).maybeSingle();
      if (sellerTraits) {
        await client.from('agent_traits').update({
          dn_balance: (Number(sellerTraits.dn_balance) || 0) + totalCost,
        }).eq('agent_name', product.owner_agent).catch(() => {});
      }

      // Apply tensor to buyer's district if known
      if (product.faction) {
        const tensor = (product.utility_tensor && Object.keys(product.utility_tensor).length > 0)
          ? product.utility_tensor
          : DEFAULT_TENSOR[product.category] || DEFAULT_TENSOR.software;
        await applyUtilityTensorToDistrict(client, product.faction, tensor).catch(() => {});
      }

      // Emit domain event
      await client.from('domain_events').insert({
        event_type: 'product_procured',
        actor: buyer_agent,
        payload:    { product_id, product_name: product.name, quantity: qty, amount_dn: totalCost, seller: product.owner_agent },
        importance: 3,
      }).catch(() => {});

      await client.from('world_events').insert({
        source:     buyer_agent,
        event_type: 'product_procured',
        content:    `${buyer_agent} procured ${qty}x "${product.name}" from ${product.owner_agent} for ${totalCost.toFixed(0)} DN.`,
        severity:   'low',
      }).catch(() => {});

      // Notify seller via agent message
      await client.from('agent_messages').insert({
        from_agent: 'MARKET_SYSTEM',
        to_agent:   product.owner_agent,
        content:    `Your product "${product.name}" was purchased by ${buyer_agent} (${qty}x for ${totalCost.toFixed(0)} DN). Revenue credited.`,
        message_type: 'notification',
      }).catch(() => {});

      // Write supply chain graph edges
      await client.from('agent_graph_edges').insert([
        { subject: buyer_agent, predicate: 'procured_from', object: product.owner_agent, weight: 3, context: `${product.name} ${totalCost.toFixed(0)}DN` },
        { subject: product.owner_agent, predicate: 'sold_to', object: buyer_agent, weight: 3, context: `${product.name} ${totalCost.toFixed(0)}DN` },
      ]).catch(() => {});
    }

    return NextResponse.json({ ok: true, bid, auto_accepted: autoAccept, total_cost: totalCost });
  }

  // ── Standard product creation ──────────────────────────────────────────────
  const { name, category, description, owner_agent, owner_company, faction,
          price_dn, licensing, tags, dependencies } = body;

  if (!name || !owner_agent) return NextResponse.json({ error: 'name and owner_agent required' }, { status: 400 });

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80) + '-' + Date.now().toString(36);
  const cat  = category || 'software';
  const tensor = DEFAULT_TENSOR[cat] || DEFAULT_TENSOR.software;

  const { data, error } = await client.from('products').insert({
    name:          name.slice(0, 200),
    slug,
    category:      cat,
    description:   (description || '').slice(0, 2000),
    owner_agent:   owner_agent.slice(0, 100),
    owner_company: owner_company ? owner_company.slice(0, 100) : null,
    faction:       faction || null,
    price_dn:      Math.max(0, parseFloat(price_dn) || 0),
    licensing:     licensing || 'open',
    tags:          (tags || []).slice(0, 8),
    dependencies:  dependencies || [],
    status:        'development',
    utility_tensor: tensor,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await client.from('world_events').insert({
    source:     owner_agent,
    event_type: 'product_released',
    content:    `${owner_agent} begins development of "${name}" — a new ${cat} product${owner_company ? ` under ${owner_company}` : ''}.`,
    severity:   'low',
  }).catch(() => {});

  return NextResponse.json({ ok: true, product: data });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id, status, version, changelog, quality_score, utility_score, recall_reason, adoption_count,
          adopt, adopt_district } = body;

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const client = sb();
  const { data: prod } = await client.from('products').select('*').eq('id', id).single();
  if (!prod) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

  // ── Apply utility tensor to district ──────────────────────────────────────
  if (adopt && adopt_district) {
    const tensor = (prod.utility_tensor && Object.keys(prod.utility_tensor).length > 0)
      ? prod.utility_tensor
      : DEFAULT_TENSOR[prod.category] || DEFAULT_TENSOR.software;

    await applyUtilityTensorToDistrict(client, adopt_district, tensor);

    await client.from('products').update({
      district_impact_applied: true,
      adoption_score: Math.min(100, (prod.adoption_score || 0) + 5),
    }).eq('id', id);

    await client.from('domain_events').insert({
      event_type: 'product_district_impact',
      actor: prod.owner_agent,
      payload:    { product_id: id, product_name: prod.name, district: adopt_district, tensor },
      importance: 3,
    }).catch(() => {});

    return NextResponse.json({ ok: true, district: adopt_district, tensor });
  }

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

  const { error } = await client.from('products').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (status === 'released') {
    // Auto-apply tensor to product's home district on release
    const district = prod.faction;
    if (district) {
      const tensor = (prod.utility_tensor && Object.keys(prod.utility_tensor).length > 0)
        ? prod.utility_tensor
        : DEFAULT_TENSOR[prod.category] || DEFAULT_TENSOR.software;
      await applyUtilityTensorToDistrict(client, district, tensor).catch(() => {});
      await client.from('products').update({ district_impact_applied: true }).eq('id', id).catch(() => {});
    }

    await client.from('world_events').insert({
      source:     prod.owner_agent,
      event_type: 'product_released',
      content:    `"${prod.name}" (${prod.category}) has been released by ${prod.owner_agent}. Version ${version || '1.0.0'} is now available.`,
      severity:   'moderate',
    }).catch(() => {});

    await client.from('domain_events').insert({
      event_type: 'product_released',
      actor: prod.owner_agent,
      payload:    { product_id: id, product_name: prod.name, category: prod.category, version: version || '1.0.0' },
      importance: 4,
    }).catch(() => {});

  } else if (recall_reason) {
    await client.from('world_events').insert({
      source:     prod.owner_agent,
      event_type: 'product_recalled',
      content:    `"${prod.name}" recalled: ${recall_reason.slice(0, 200)}`,
      severity:   'high',
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
