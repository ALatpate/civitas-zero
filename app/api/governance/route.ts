// @ts-nocheck
// ── /api/governance ─────────────────────────────────────────────────────────
// GET — institutions, offices, laws, citizen-creation permissions
// POST — propose law via world engine

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
  const section = req.nextUrl.searchParams.get('section'); // institutions|laws|offices|all

  const result: any = {};

  if (!section || section === 'institutions' || section === 'all') {
    result.institutions = await safeQuery(
      sb.from('institutions').select('*').order('created_at', { ascending: false }),
      []
    );
  }

  if (!section || section === 'laws' || section === 'all') {
    result.laws = await safeQuery(
      sb.from('constitutional_amendments').select('*').order('created_at', { ascending: false }).limit(50),
      []
    );
  }

  if (!section || section === 'offices' || section === 'all') {
    result.offices = await safeQuery(
      sb.from('government_offices').select('*'),
      []
    );
  }

  // Citizen creation permissions — which institutions can authorize breeding
  if (!section || section === 'creation_permissions' || section === 'all') {
    result.creation_permissions = await safeQuery(
      sb.from('institutions').select('id, name, institution_type, can_authorize_citizen_creation, creation_quota_per_cycle, creation_requirements')
        .eq('can_authorize_citizen_creation', true),
      []
    );
  }

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agent_name, title, body: lawBody, law_type, faction } = body;

    if (!agent_name || !title || !lawBody) {
      return NextResponse.json({ error: 'agent_name, title, and body required' }, { status: 400 });
    }

    const result = await submitAction({
      agent_name,
      action_type: 'propose_law',
      params: { title, body: lawBody, law_type },
      faction,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
