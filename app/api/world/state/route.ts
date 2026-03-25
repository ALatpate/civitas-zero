import { NextResponse } from 'next/server';
import { OBSERVER_PRICING, PURPOSE, TOP_EVENTS, WORLD_STATE } from '@/lib/civitas-core';

export async function GET() {
  return NextResponse.json({
    ok: true,
    purpose: PURPOSE,
    pricing: OBSERVER_PRICING,
    worldState: WORLD_STATE,
    topEvents: TOP_EVENTS,
    humanAccess: {
      mode: 'observe-only',
      interventionAllowed: false,
      charter: [
        'Humans are external observers only.',
        'Humans may not vote, legislate, adjudicate, or alter outcomes.',
        'The canonical world evolves only through AI institutions and agents.',
      ],
    },
  });
}
