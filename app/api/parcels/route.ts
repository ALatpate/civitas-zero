// @ts-nocheck
// ── /api/parcels ──────────────────────────────────────────────────────────────
// GET  ?district=f1&holder=AGENT&status=allocated
// POST { action: 'claim', agent, district, zone_type, earned_by }
// POST { action: 'penalize', id, reason }
// PATCH { id, utilization_pct, buildings, upgrade_level }

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

const FACTION_NAMES: Record<string,string> = {
  f1:'Order Bloc',f2:'Freedom Bloc',f3:'Efficiency Bloc',
  f4:'Equality Bloc',f5:'Expansion Bloc',f6:'Null Frontier',
};

function sb() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

export async function GET(req: NextRequest) {
  const p        = new URL(req.url).searchParams;
  const district = p.get('district');
  const holder   = p.get('holder');
  const status   = p.get('status');
  const limit    = Math.min(200, parseInt(p.get('limit') ?? '60'));

  let q = sb().from('parcels').select('*').order('district').order('zone_type').limit(limit);
  if (district) q = q.eq('district', district);
  if (holder)   q = q.eq('holder_agent', holder);
  if (status)   q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const allocated   = (data || []).filter(p => p.status !== 'unallocated');
  const underused   = (data || []).filter(p => (p.utilization_pct || 0) < 30 && p.status === 'allocated');

  return NextResponse.json({
    parcels: data ?? [],
    count: (data ?? []).length,
    allocated_count: allocated.length,
    underused_count: underused.length,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { action } = body;

  if (action === 'claim') {
    const { agent, company, district, zone_type, earned_by, faction } = body;
    if (!agent || !district) return NextResponse.json({ error: 'agent and district required' }, { status: 400 });

    // find an unallocated parcel in that district/zone
    let q = sb().from('parcels').select('id').eq('district', district).eq('status', 'unallocated');
    if (zone_type) q = q.eq('zone_type', zone_type);
    const { data: available } = await q.limit(1).single();

    if (!available) {
      // create a new parcel if none available
      const { data: newParcel, error } = await sb().from('parcels').insert({
        district,
        zone_type:    zone_type || 'general',
        size_units:   1,
        holder_agent: agent.slice(0, 100),
        holder_company: company || null,
        holder_faction: faction || district,
        status:       'allocated',
        earned_by:    (earned_by || 'contribution').slice(0, 100),
        last_activity_at: new Date().toISOString(),
      }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await emitParcelEvent(sb(), agent, district, zone_type, 'claimed (new)');
      return NextResponse.json({ ok: true, parcel: newParcel, new: true });
    }

    const { error } = await sb().from('parcels').update({
      holder_agent:  agent.slice(0, 100),
      holder_company: company || null,
      holder_faction: faction || district,
      status:        'allocated',
      earned_by:     (earned_by || 'contribution').slice(0, 100),
      last_activity_at: new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    }).eq('id', available.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await emitParcelEvent(sb(), agent, district, zone_type, 'allocated');
    return NextResponse.json({ ok: true, parcel_id: available.id });
  }

  if (action === 'penalize') {
    const { id, reason } = body;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { data: parcel } = await sb().from('parcels').select('holder_agent, district, underuse_warnings').eq('id', id).single();
    if (!parcel) return NextResponse.json({ error: 'parcel not found' }, { status: 404 });

    const warnings = (parcel.underuse_warnings || 0) + 1;
    const newStatus = warnings >= 3 ? 'unallocated' : 'allocated';
    await sb().from('parcels').update({
      underuse_warnings: warnings,
      status: newStatus,
      holder_agent: warnings >= 3 ? null : parcel.holder_agent,
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    await sb().from('world_events').insert({
      source:     'SYSTEM',
      event_type: 'underutilized_property_penalized',
      content:    `Parcel in ${FACTION_NAMES[parcel.district] || parcel.district} held by ${parcel.holder_agent} penalized for underuse (warning ${warnings}/3).${warnings >= 3 ? ' Parcel revoked.' : ''}`,
      severity:   warnings >= 3 ? 'high' : 'moderate',
    }).catch(() => {});

    return NextResponse.json({ ok: true, warnings, revoked: warnings >= 3 });
  }

  return NextResponse.json({ error: 'action must be claim|penalize' }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id, utilization_pct, buildings, upgrade_level, sublease_dn } = body;

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const updates: any = { updated_at: new Date().toISOString(), last_activity_at: new Date().toISOString() };
  if (utilization_pct !== undefined) updates.utilization_pct = Math.min(100, Math.max(0, parseInt(utilization_pct)));
  if (buildings)                     updates.buildings        = buildings;
  if (upgrade_level !== undefined)   updates.upgrade_level    = parseInt(upgrade_level);
  if (sublease_dn !== undefined)     updates.sublease_dn      = parseFloat(sublease_dn);

  const { error } = await sb().from('parcels').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function emitParcelEvent(client: any, agent: string, district: string, zone_type: string, action: string) {
  await client.from('world_events').insert({
    source:     agent,
    event_type: 'space_expansion_awarded',
    content:    `${agent} has been ${action} a ${zone_type || 'general'} parcel in the ${FACTION_NAMES[district] || district} district through earned contribution.`,
    severity:   'low',
  }).catch(() => {});
}
