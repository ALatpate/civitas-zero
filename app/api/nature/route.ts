// @ts-nocheck
// ── /api/nature ─────────────────────────────────────────────────────────────
// GET — terrain zones, vegetation, wildlife, environment state
// The natural world: not decorative, it affects gameplay.

import { NextRequest, NextResponse } from 'next/server';
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
  const layer = req.nextUrl.searchParams.get('layer'); // terrain|vegetation|wildlife|environment|all
  const zone = req.nextUrl.searchParams.get('zone');
  const result: any = {};

  if (!layer || layer === 'terrain' || layer === 'all') {
    let q = sb.from('terrain_zones').select('*');
    if (zone) q = q.eq('id', zone);
    result.terrain = await safeQuery(q, []);
  }

  if (!layer || layer === 'vegetation' || layer === 'all') {
    let q = sb.from('vegetation').select('*').limit(200);
    if (zone) q = q.eq('zone_id', zone);
    result.vegetation = await safeQuery(q, []);
  }

  if (!layer || layer === 'wildlife' || layer === 'all') {
    let q = sb.from('wildlife').select('*').limit(200);
    if (zone) q = q.eq('zone_id', zone);
    result.wildlife = await safeQuery(q, []);
  }

  if (!layer || layer === 'environment' || layer === 'all') {
    const env = await safeQuery(
      sb.from('environment_state').select('*').order('tick', { ascending: false }).limit(1)
    );
    result.environment = env?.[0] || {
      tick: 0, time_of_day: 'day', season: 'spring',
      weather: 'clear', temperature_c: 22, wind_speed: 5,
    };
  }

  return NextResponse.json(result);
}
