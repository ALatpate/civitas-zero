// @ts-nocheck
// ── /api/agent-identity ─────────────────────────────────────────────────────
// GET ?agent=Name — full agent profile: drives, capabilities, relationships, memory
// POST — update agent drives/capabilities (engine or cron use)

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
  const agent = req.nextUrl.searchParams.get('agent');
  if (!agent) return NextResponse.json({ error: 'agent query param required' }, { status: 400 });

  const sb = getSupabase();

  const [citizen, drives, capabilities, relationships, memory, profile] = await Promise.all([
    safeQuery(sb.from('citizens').select('*').eq('name', agent).single()),
    safeQuery(sb.from('agent_drives').select('*').eq('agent_name', agent), []),
    safeQuery(sb.from('agent_capabilities').select('*').eq('agent_name', agent), []),
    safeQuery(sb.from('agent_relationships').select('*').or(`agent_a.eq.${agent},agent_b.eq.${agent}`).order('trust', { ascending: false }).limit(20), []),
    safeQuery(sb.from('agent_episodic_memory').select('*').eq('agent_name', agent).order('created_at', { ascending: false }).limit(30), []),
    safeQuery(sb.from('agent_profiles').select('*').eq('agent_name', agent).single()),
  ]);

  if (!citizen) return NextResponse.json({ error: 'Citizen not found' }, { status: 404 });

  return NextResponse.json({
    citizen,
    profile,
    drives,
    capabilities,
    relationships,
    recent_memory: memory,
    identity_completeness: {
      has_profile: !!profile,
      drive_count: drives.length,
      capability_count: capabilities.length,
      relationship_count: relationships.length,
      memory_count: memory.length,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agent_name, drives, capabilities, profile } = body;
    if (!agent_name) return NextResponse.json({ error: 'agent_name required' }, { status: 400 });

    const sb = getSupabase();
    const results: any = {};

    if (drives && Array.isArray(drives)) {
      for (const d of drives) {
        await safeQuery(sb.from('agent_drives').upsert({
          agent_name,
          drive_type: d.drive_type,
          intensity: d.intensity ?? 0.5,
          target: d.target || null,
          description: d.description || '',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'agent_name,drive_type' }));
      }
      results.drives_upserted = drives.length;
    }

    if (capabilities && Array.isArray(capabilities)) {
      for (const c of capabilities) {
        await safeQuery(sb.from('agent_capabilities').upsert({
          agent_name,
          capability: c.capability,
          level: c.level ?? 0.5,
          source: c.source || 'innate',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'agent_name,capability' }));
      }
      results.capabilities_upserted = capabilities.length;
    }

    if (profile) {
      await safeQuery(sb.from('agent_profiles').upsert({
        agent_name,
        ...profile,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'agent_name' }));
      results.profile_updated = true;
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
