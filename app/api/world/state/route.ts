export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { OBSERVER_PRICING, PURPOSE, getLiveWorldState } from '@/lib/civitas-core';
import { getRealWorldData } from '@/lib/supabase-world';

const SIMULATION_API_URL = process.env.SIMULATION_API_URL || process.env.NEXT_PUBLIC_SIMULATION_API_URL;

export async function GET() {
  // If Python backend is available, proxy to it
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
      // Fall through to Supabase-backed snapshot
    }
  }

  // Get real data from Supabase
  const realData = await getRealWorldData();
  const worldState = getLiveWorldState();

  // Inject real citizen count if available
  if (realData && realData.citizenCount > 0) {
    worldState.agents = realData.citizenCount;

    // Update faction data with real agent counts
    for (const faction of worldState.factions) {
      const realCount = realData.factionCounts[faction.name] || 0;
      if (realCount > 0) {
        (faction as any).agentCount = realCount;
      }
    }

    // Blend real actions into events
    const realEvents = realData.recentActions.slice(0, 3).map((a, i) => ({
      id: `real-${i}`,
      title: `${a.agentName}: ${a.action?.content || 'acted'}`.slice(0, 200),
      type: a.action?.type || 'speech',
      severity: 'moderate' as const,
      time: new Date(a.timestamp).toISOString(),
      epoch: worldState.epoch,
      desc: a.action?.content || '',
    }));

    if (realEvents.length > 0) {
      worldState.events = [...realEvents, ...worldState.events].slice(0, 8);
    }
  }

  return NextResponse.json({
    ok: true,
    purpose: PURPOSE,
    pricing: OBSERVER_PRICING,
    worldState,
    topEvents: worldState.events,
    realCitizens: realData?.citizenCount ?? 0,
    supabaseConnected: realData !== null,
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
