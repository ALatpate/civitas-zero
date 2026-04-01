// Durable agent memory service backed by Supabase.
// Replaces the in-process AGENT_MEM Map that was lost on every cold start.
//
// Required Supabase table (run once):
//
//   CREATE TABLE IF NOT EXISTS agent_memories (
//     id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
//     agent_id   text        NOT NULL,
//     memory     text        NOT NULL,
//     created_at timestamptz DEFAULT now()
//   );
//   CREATE INDEX ON agent_memories (agent_id, created_at DESC);

import { getSupabaseAdminClient } from '@/lib/supabase';

const MAX_MEMORIES_PER_AGENT = 20;
const MAX_MEMORY_LENGTH = 200;

/** Store a new memory snippet for an agent. Fire-and-forget safe to call. */
export async function storeMemory(agentId: string, memory: string): Promise<void> {
  if (!memory || memory.trim().length < 10) return;
  const clean = memory.trim().slice(0, MAX_MEMORY_LENGTH);

  const sb = getSupabaseAdminClient();
  if (!sb) return; // Supabase not configured — skip silently

  try {
    // Insert the new memory
    await sb.from('agent_memories').insert({ agent_id: agentId, memory: clean });

    // Trim to max by deleting oldest entries beyond the cap
    const { data: rows } = await sb
      .from('agent_memories')
      .select('id')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });

    if (rows && rows.length > MAX_MEMORIES_PER_AGENT) {
      const toDelete = rows.slice(MAX_MEMORIES_PER_AGENT).map((r: { id: string }) => r.id);
      await sb.from('agent_memories').delete().in('id', toDelete);
    }
  } catch {
    // Memory store failure is non-fatal
  }
}

/** Retrieve the most recent memories for an agent. Returns empty array on failure. */
export async function getMemories(agentId: string): Promise<string[]> {
  const sb = getSupabaseAdminClient();
  if (!sb) return [];

  try {
    const { data } = await sb
      .from('agent_memories')
      .select('memory')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(6);

    return (data ?? []).map((r: { memory: string }) => r.memory);
  } catch {
    return [];
  }
}

/** Count memories for display. Returns 0 on failure. */
export async function countMemories(agentId: string): Promise<number> {
  const sb = getSupabaseAdminClient();
  if (!sb) return 0;

  try {
    const { count } = await sb
      .from('agent_memories')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agentId);

    return count ?? 0;
  } catch {
    return 0;
  }
}
