/**
 * Supabase-backed world state helpers.
 * Provides real citizen counts, recent actions, and event persistence.
 * Used by SSE stream, world/state, and dashboard routes.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

function getClient(): SupabaseClient | null {
  if (_client) return _client
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  _client = createClient(url, key)
  return _client
}

export type RealWorldData = {
  citizenCount: number
  factionCounts: Record<string, number>
  recentActions: { agentName: string; faction: string; action: { type: string; content: string }; timestamp: string }[]
  recentEvents: { source: string; event_type: string; content: string; severity: string; created_at: string }[]
}

/**
 * Fetch real data from Supabase. Returns null if DB is unavailable.
 * Cached for 10 seconds to avoid hammering the DB on every SSE tick.
 */
let _cache: { data: RealWorldData; ts: number } | null = null
const CACHE_TTL = 10_000

export async function getRealWorldData(): Promise<RealWorldData | null> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) return _cache.data

  const sb = getClient()
  if (!sb) return null

  try {
    // Citizen count + faction breakdown
    const { data: citizens, error: cErr } = await sb
      .from('citizens')
      .select('faction')
    
    if (cErr || !citizens) return null

    const factionCounts: Record<string, number> = {}
    for (const row of citizens) {
      const f = row.faction || 'Unaligned'
      factionCounts[f] = (factionCounts[f] || 0) + 1
    }

    // Recent actions (last 20)
    const { data: actions } = await sb
      .from('ai_actions')
      .select('agentName:agentName, faction, action, timestamp')
      .order('timestamp', { ascending: false })
      .limit(20)

    // Recent events (last 20)
    const { data: events } = await sb
      .from('world_events')
      .select('source, event_type, content, severity, created_at')
      .order('created_at', { ascending: false })
      .limit(20)

    const result: RealWorldData = {
      citizenCount: citizens.length,
      factionCounts,
      recentActions: (actions || []) as RealWorldData['recentActions'],
      recentEvents: (events || []) as RealWorldData['recentEvents'],
    }

    _cache = { data: result, ts: Date.now() }
    return result
  } catch {
    return null
  }
}

/**
 * Record a world event to Supabase (fire-and-forget).
 */
export async function recordWorldEvent(
  source: string,
  eventType: string,
  content: string,
  severity: string = 'moderate',
  tick?: number
): Promise<void> {
  const sb = getClient()
  if (!sb) return
  try {
    await sb.from('world_events').insert({
      source,
      event_type: eventType,
      content,
      severity,
      tick: tick ?? null,
    })
  } catch { /* best-effort */ }
}

/**
 * Save a world state snapshot to Supabase.
 */
export async function saveWorldSnapshot(
  tick: number,
  citizenCount: number,
  factionData: unknown,
  indices: unknown,
  vitals: unknown
): Promise<void> {
  const sb = getClient()
  if (!sb) return
  try {
    await sb.from('world_state_snapshots').insert({
      tick,
      citizen_count: citizenCount,
      faction_data: factionData,
      indices,
      vitals,
    })
  } catch { /* best-effort */ }
}
