// @ts-nocheck
// — /api/world/live — Real-time world state endpoint
// Replaces synthetic civitas-core.ts fallback with REAL Supabase data.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ error: 'Database not configured', synthetic: true });
  }

  try {
    const [
      worldState,
      districts,
      recentActivity,
      recentMessages,
      recentTrades,
      topCitizens,
      recentDeaths,
      recentBirths,
    ] = await Promise.all([
      sb.from('world_state').select('*').eq('id', 1).single().catch(() => ({ data: null })),
      sb.from('districts').select('*').order('population_count', { ascending: false }).catch(() => ({ data: null })),
      sb.from('activity_log').select('*').order('timestamp', { ascending: false }).limit(20).catch(() => ({ data: null })),
      sb.from('agent_messages')
        .select('id, from_citizen, to_citizen, content, message_type, emotion_tag, created_at')
        .order('created_at', { ascending: false })
        .limit(20).catch(() => ({ data: null })),
      sb.from('wallet_transactions')
        .select('from_citizen, to_citizen, amount, reason, created_at')
        .order('created_at', { ascending: false })
        .limit(10).catch(() => ({ data: null })),
      sb.from('citizens')
        .select('citizen_number, name, faction, profession, wallet_balance, reputation, current_district, action_count')
        .eq('alive', true)
        .order('wallet_balance', { ascending: false })
        .limit(10).catch(() => ({ data: null })),
      sb.from('activity_log').select('*').eq('type', 'death').order('timestamp', { ascending: false }).limit(5).catch(() => ({ data: null })),
      sb.from('activity_log').select('*').eq('type', 'birth').order('timestamp', { ascending: false }).limit(5).catch(() => ({ data: null })),
    ]);

    const { count: aliveCount }   = await sb.from('citizens').select('*', { count: 'exact', head: true }).eq('alive', true).catch(() => ({ count: 0 }));
    const { count: totalMessages } = await sb.from('agent_messages').select('*', { count: 'exact', head: true }).catch(() => ({ count: 0 }));
    const { count: totalTrades }  = await sb.from('wallet_transactions').select('*', { count: 'exact', head: true }).catch(() => ({ count: 0 }));

    const topData = (topCitizens as any)?.data || topCitizens || [];
    const totalDN = (Array.isArray(topData) ? topData : []).reduce((sum: number, c: any) => sum + (c.wallet_balance || 0), 0);

    const wsData = (worldState as any)?.data || worldState;

    return NextResponse.json({
      world: wsData,
      districts: (districts as any)?.data || districts || [],
      recent_activity: (recentActivity as any)?.data || recentActivity || [],
      recent_messages: (recentMessages as any)?.data || recentMessages || [],
      recent_trades: (recentTrades as any)?.data || recentTrades || [],
      top_citizens: Array.isArray(topData) ? topData : [],
      recent_deaths: (recentDeaths as any)?.data || recentDeaths || [],
      recent_births: (recentBirths as any)?.data || recentBirths || [],
      summary: {
        alive_citizens:   aliveCount || 0,
        total_messages:   totalMessages || 0,
        total_trades:     totalTrades || 0,
        world_arcs:       wsData?.active_world_arcs || [],
        world_day:        wsData?.world_day || 1,
        tick:             wsData?.tick || 0,
      },
      generated_at: new Date().toISOString(),
      synthetic: false,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, synthetic: true }, { status: 500 });
  }
}
