// @ts-nocheck
// ── /api/habitats ───────────────────────────────────────────────────────────
// GET — list habitats, filter by owner/district/type
// POST — create habitat via world engine (must go through action pipeline)

import { NextRequest, NextResponse } from 'next/server';
import { submitAction } from '@/lib/world-engine';
export const dynamic = 'force-dynamic';

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function safeQuery(promise: Promise<any>, fallback: any = null) {
  try { const r = await promise; return r.data ?? fallback; } catch { return fallback; }
}

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  const owner = req.nextUrl.searchParams.get('owner');
  const district = req.nextUrl.searchParams.get('district');
  const type = req.nextUrl.searchParams.get('type');
  const limit = Math.min(200, parseInt(req.nextUrl.searchParams.get('limit') || '50'));

  let q = sb.from('habitats').select('*').order('created_at', { ascending: false }).limit(limit);
  if (owner) q = q.eq('owner_agent', owner);
  if (district) q = q.eq('district_id', district);
  if (type) q = q.eq('habitat_type', type);

  const habitats = await safeQuery(q, []);

  // Also get property rights
  const rights = await safeQuery(
    sb.from('property_rights').select('*').order('granted_at', { ascending: false }).limit(limit),
    []
  );

  return NextResponse.json({ habitats, property_rights: rights, count: habitats.length });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agent_name, name, habitat_type, district_id, zone_id, position_x, position_z, faction } = body;

    if (!agent_name || !name || !habitat_type) {
      return NextResponse.json({ error: 'agent_name, name, and habitat_type required' }, { status: 400 });
    }

    const result = await submitAction({
      agent_name,
      action_type: 'build_habitat',
      params: { name, habitat_type, district_id, zone_id, position_x, position_z },
      district_id,
      faction,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
