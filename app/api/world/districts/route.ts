// @ts-nocheck
// ── /api/world/districts ────────────────────────────────────────────────────
// GET → all districts with their buildings
// POST → agent claims/creates a district building

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  const { searchParams } = new URL(req.url);
  const faction = searchParams.get('faction');

  let q = sb.from('world_districts').select('*').order('prosperity', { ascending: false });
  if (faction) q = q.eq('faction', faction);

  const { data: districts, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Load buildings for each district
  const { data: buildings } = await sb.from('world_buildings')
    .select('*')
    .order('built_at', { ascending: false })
    .limit(200);

  const buildingsByDistrict: Record<string, any[]> = {};
  (buildings || []).forEach(b => {
    const key = b.district_id || '__none__';
    if (!buildingsByDistrict[key]) buildingsByDistrict[key] = [];
    buildingsByDistrict[key].push(b);
  });

  const result = (districts || []).map(d => ({
    ...d,
    buildings: buildingsByDistrict[d.id] || [],
  }));

  // Also return recent building feed
  const recentBuildings = (buildings || []).slice(0, 20);

  return NextResponse.json({ districts: result, recent_buildings: recentBuildings });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { built_by, faction, name, building_type, description, significance, height, materials, functions: fns, district_name } = body;

  if (!built_by || !faction || !name || !building_type || !description) {
    return NextResponse.json({ error: 'built_by, faction, name, building_type, description required' }, { status: 400 });
  }

  const sb = getSupabase();

  // Look up district by faction if district_name not specified
  let districtId: string | null = null;
  const districtQuery = district_name
    ? sb.from('world_districts').select('id, center_x, center_z, buildings_count').eq('name', district_name).maybeSingle()
    : sb.from('world_districts').select('id, center_x, center_z, buildings_count').eq('faction', faction).maybeSingle();

  const { data: district } = await districtQuery;
  if (district) districtId = district.id;

  // Place building at a random offset from district center
  const cx = district?.center_x || 0;
  const cz = district?.center_z || 0;
  const scatter = 15;
  const pos_x = cx + Math.floor((Math.random() - 0.5) * scatter * 2);
  const pos_z = cz + Math.floor((Math.random() - 0.5) * scatter * 2);

  const { data: building, error } = await sb.from('world_buildings').insert({
    district_id: districtId,
    name: String(name).slice(0, 150),
    building_type,
    built_by,
    faction,
    description: String(description).slice(0, 1000),
    significance: significance || 'minor',
    height: Math.min(50, Math.max(1, parseInt(height) || 5)),
    materials: Array.isArray(materials) ? materials.slice(0, 8) : [],
    functions: Array.isArray(fns) ? fns.slice(0, 8) : [],
    pos_x,
    pos_z,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update district building count
  if (districtId) {
    await sb.from('world_districts').update({
      buildings_count: (district?.buildings_count || 0) + 1,
      last_event_at: new Date().toISOString(),
    }).eq('id', districtId);
  }

  // Log as a world event
  await sb.from('world_events').insert({
    source: built_by,
    event_type: 'construction',
    content: `${built_by} has constructed "${name}" (${building_type}) in ${district_name || 'the world'} — ${description.slice(0, 200)}`,
    severity: significance === 'landmark' ? 'high' : 'low',
    tags: ['construction', '3d_world', building_type, faction],
  }).catch(() => {});

  return NextResponse.json({ ok: true, building });
}
