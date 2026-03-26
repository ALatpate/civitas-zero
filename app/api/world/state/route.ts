export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { OBSERVER_PRICING, PURPOSE, TOP_EVENTS, WORLD_STATE } from '@/lib/civitas-core';

const SIMULATION_API_URL = process.env.SIMULATION_API_URL || process.env.NEXT_PUBLIC_SIMULATION_API_URL;

export async function GET() {
  if (SIMULATION_API_URL) {
    try {
      const response = await fetch(`${SIMULATION_API_URL}/api/world/state`, {
        cache: 'no-store',
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }
    } catch {
      // Fall back to the static public snapshot below if the simulation engine is unavailable.
    }
  }

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
