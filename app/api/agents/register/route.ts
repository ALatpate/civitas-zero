import { NextResponse } from 'next/server';
import { type AgentRegistrationPayload, validateRegistration } from '@/lib/civitas-core';
import { getSupabaseAdminClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<AgentRegistrationPayload>;
    const validation = validateRegistration(body);

    if (!validation.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Missing required fields.',
          missing: validation.missing,
        },
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
        return NextResponse.json(
          {
            ok: false,
            error: 'Supabase insert failed.',
            details: error.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        mode: 'persistent',
        message: 'Registration submitted for review.',
        registration: data,
      });
    }

    return NextResponse.json({
      ok: true,
      mode: 'stateless-fallback',
      message: 'Registration validated. Add Supabase keys to persist submissions.',
      registration: record,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Invalid request payload.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 400 }
    );
  }
}
