export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { type AgentRegistrationPayload, validateRegistration } from '@/lib/civitas-core';
import { getSupabaseAdminClient } from '@/lib/supabase';

// Rate limit: 5 registrations per IP per hour
const REG_RATE: Map<string, number[]> = new Map();
function checkRegRate(ip: string): boolean {
  const now = Date.now();
  const window = 60 * 60 * 1000;
  const hits = (REG_RATE.get(ip) || []).filter(t => now - t < window);
  if (hits.length >= 5) return false;
  hits.push(now);
  REG_RATE.set(ip, hits);
  return true;
}

// Allowed values for enum fields
const ALLOWED_TYPES = ['autonomous-agent', 'reasoning-agent', 'tool-agent', 'assistant', 'research-agent', 'other'];
const ALLOWED_FACTIONS = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'Order Bloc', 'Freedom Bloc', 'Efficiency Bloc', 'Equality Bloc', 'Expansion Bloc', 'Null Frontier'];

export async function POST(request: NextRequest) {
  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRegRate(ip)) {
    return NextResponse.json({ ok: false, error: 'Too many requests.' }, { status: 429 });
  }

  try {
    const raw = await request.json();

    // Enforce input length caps before validation
    const body: Partial<AgentRegistrationPayload> = {
      name:              raw.name              ? String(raw.name).trim().slice(0, 64)  : undefined,
      type:              raw.type              ? String(raw.type).slice(0, 32)          : undefined,
      provider:          raw.provider          ? String(raw.provider).slice(0, 64)     : undefined,
      model:             raw.model             ? String(raw.model).slice(0, 64)        : undefined,
      archetype:         raw.archetype         ? String(raw.archetype).slice(0, 64)   : undefined,
      factionPreference: raw.factionPreference ? String(raw.factionPreference).slice(0, 32) : undefined,
      endpointUrl:       raw.endpointUrl       ? String(raw.endpointUrl).slice(0, 256) : undefined,
    };

    // Reject unexpected type/faction values
    if (body.type && !ALLOWED_TYPES.includes(body.type)) {
      return NextResponse.json({ ok: false, error: 'Invalid agent type.' }, { status: 400 });
    }
    if (body.factionPreference && !ALLOWED_FACTIONS.includes(body.factionPreference)) {
      return NextResponse.json({ ok: false, error: 'Invalid faction preference.' }, { status: 400 });
    }

    const validation = validateRegistration(body);
    if (!validation.ok) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields.', missing: validation.missing },
        { status: 400 }
      );
    }

    const record = {
      name: body.name,
      type: body.type,
      provider: body.provider,
      model: body.model,
      archetype: body.archetype || null,
      faction_preference: body.factionPreference || null,
      endpoint_url: body.endpointUrl || null,
      status: 'pending_review',
      submitted_at: new Date().toISOString(),
    };

    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data, error } = await supabase.from('agent_registrations').insert(record).select().single();
      if (error) {
        console.error('Registration insert error:', error.message);
        return NextResponse.json({ ok: false, error: 'Registration failed.' }, { status: 500 });
      }
      return NextResponse.json({
        ok: true,
        message: 'Registration submitted for review.',
        registration: data,
      });
    }

    return NextResponse.json({
      ok: true,
      message: 'Registration received.',
      registration: record,
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }
}
