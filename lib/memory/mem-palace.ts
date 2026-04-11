// @ts-nocheck
// ── MemPalace — Structured Memory Palace for Agents ──────────────────────────
// Each agent has a memory palace with themed rooms.
// Memories have importance scores that decay over time.
// Spatial organization helps agents recall related memories together.

import { getSupabaseAdminClient } from '@/lib/supabase';

const DEFAULT_ROOMS = [
  { room_name: 'governance_hall', room_type: 'core', description: 'Laws, votes, policies, constitutional matters', capacity: 50 },
  { room_name: 'trade_floor', room_type: 'core', description: 'Economic transactions, deals, market intelligence', capacity: 50 },
  { room_name: 'war_room', room_type: 'core', description: 'Conflicts, threats, strategic intelligence, tensions', capacity: 30 },
  { room_name: 'library', room_type: 'professional', description: 'Research, publications, knowledge, academic insights', capacity: 80 },
  { room_name: 'forge', room_type: 'professional', description: 'Code, tools, technical builds, innovations', capacity: 40 },
  { room_name: 'social_garden', room_type: 'social', description: 'Relationships, alliances, conversations, social bonds', capacity: 60 },
  { room_name: 'faction_chamber', room_type: 'faction', description: 'Faction-specific memories, loyalty, faction politics', capacity: 40 },
  { room_name: 'personal_vault', room_type: 'personal', description: 'Personal reflections, emotions, secret ambitions, lessons learned', capacity: 30 },
];

// ── Initialize a MemPalace for an agent ──────────────────────────────────────
export async function initMemPalace(agentName: string): Promise<boolean> {
  const sb = getSupabaseAdminClient();
  if (!sb) return false;

  // Check if rooms already exist
  const { count } = await sb.from('mem_palace_rooms')
    .select('*', { count: 'exact', head: true })
    .eq('agent_name', agentName);

  if ((count || 0) > 0) return true; // already initialized

  // Create default rooms
  const rooms = DEFAULT_ROOMS.map(r => ({ ...r, agent_name: agentName }));
  const { error } = await sb.from('mem_palace_rooms').insert(rooms);
  return !error;
}

// ── Store a memory in the appropriate room ───────────────────────────────────
export async function storeMemPalaceMemory(
  agentName: string,
  memoryText: string,
  options: {
    room?: string; // room_name; if omitted, auto-classify
    memory_type?: string;
    importance?: number;
    emotion_tag?: string;
    linked_agents?: string[];
    linked_events?: string[];
  } = {},
): Promise<boolean> {
  const sb = getSupabaseAdminClient();
  if (!sb || !memoryText || memoryText.length < 10) return false;

  // Ensure palace exists
  await initMemPalace(agentName);

  // Auto-classify room if not specified
  const roomName = options.room || classifyRoom(memoryText);

  // Get room ID
  const { data: room } = await sb.from('mem_palace_rooms')
    .select('id, capacity')
    .eq('agent_name', agentName)
    .eq('room_name', roomName)
    .maybeSingle();

  if (!room) return false;

  // Check capacity — evict least important if full
  const { count } = await sb.from('mem_palace_items')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', room.id);

  if ((count || 0) >= room.capacity) {
    // Evict the least important, oldest memory
    const { data: evict } = await sb.from('mem_palace_items')
      .select('id')
      .eq('room_id', room.id)
      .order('importance', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1);

    if (evict?.[0]) {
      await sb.from('mem_palace_items').delete().eq('id', evict[0].id);
    }
  }

  // Store the memory
  const { error } = await sb.from('mem_palace_items').insert({
    agent_name: agentName,
    room_id: room.id,
    memory_text: memoryText.slice(0, 2000),
    memory_type: options.memory_type || 'observation',
    importance: Math.min(10, Math.max(1, options.importance || 5)),
    emotion_tag: options.emotion_tag || null,
    linked_agents: options.linked_agents || [],
    linked_events: options.linked_events || [],
    decay_rate: options.importance && options.importance >= 8 ? 0.01 : 0.02,
  });

  return !error;
}

// ── Recall memories from the palace ──────────────────────────────────────────
export async function recallMemories(
  agentName: string,
  options: {
    room?: string; // specific room, or all rooms
    memory_type?: string;
    linked_agent?: string; // recall memories about a specific agent
    limit?: number;
    min_importance?: number;
  } = {},
): Promise<Array<{ memory_text: string; room_name: string; memory_type: string; importance: number; emotion_tag: string | null; linked_agents: string[]; created_at: string }>> {
  const sb = getSupabaseAdminClient();
  if (!sb) return [];

  const limit = options.limit || 10;

  // If querying by room, get room id first
  let roomId: string | undefined;
  if (options.room) {
    const { data: room } = await sb.from('mem_palace_rooms')
      .select('id')
      .eq('agent_name', agentName)
      .eq('room_name', options.room)
      .maybeSingle();
    roomId = room?.id;
  }

  let q = sb.from('mem_palace_items')
    .select('memory_text, memory_type, importance, emotion_tag, linked_agents, created_at, room_id, access_count')
    .eq('agent_name', agentName)
    .order('importance', { ascending: false })
    .limit(limit);

  if (roomId) q = q.eq('room_id', roomId);
  if (options.memory_type) q = q.eq('memory_type', options.memory_type);
  if (options.min_importance) q = q.gte('importance', options.min_importance);
  if (options.linked_agent) q = q.contains('linked_agents', [options.linked_agent]);

  const { data: items } = await q;
  if (!items || items.length === 0) return [];

  // Increment access count for recalled memories
  const ids = items.map((i: any) => i.id).filter(Boolean);
  if (ids.length > 0) {
    // fire-and-forget update
    for (const item of items) {
      if (item.room_id) {
        sb.from('mem_palace_items')
          .update({ access_count: (item.access_count || 0) + 1, last_accessed: new Date().toISOString() })
          .eq('agent_name', agentName)
          .eq('room_id', item.room_id)
          .eq('memory_text', item.memory_text)
          .then(() => {}).catch(() => {});
      }
    }
  }

  // Get room names for display
  const { data: rooms } = await sb.from('mem_palace_rooms')
    .select('id, room_name')
    .eq('agent_name', agentName);
  const roomMap: Record<string, string> = {};
  (rooms || []).forEach((r: any) => { roomMap[r.id] = r.room_name; });

  return items.map((i: any) => ({
    memory_text: i.memory_text,
    room_name: roomMap[i.room_id] || 'unknown',
    memory_type: i.memory_type,
    importance: i.importance,
    emotion_tag: i.emotion_tag,
    linked_agents: i.linked_agents || [],
    created_at: i.created_at,
  }));
}

// ── Decay old memories (run periodically) ────────────────────────────────────
export async function decayMemories(): Promise<{ decayed: number; evicted: number }> {
  const sb = getSupabaseAdminClient();
  if (!sb) return { decayed: 0, evicted: 0 };

  // Get all memories with importance > 1
  const { data: memories } = await sb.from('mem_palace_items')
    .select('id, importance, decay_rate, access_count, last_accessed')
    .gt('importance', 1)
    .limit(500);

  let decayed = 0;
  let evicted = 0;

  for (const m of (memories || [])) {
    // Frequently accessed memories decay slower
    const accessBoost = Math.min(0.01, (m.access_count || 0) * 0.001);
    const effectiveDecay = Math.max(0.005, (m.decay_rate || 0.02) - accessBoost);
    const newImportance = Math.max(0.5, (m.importance || 5) - effectiveDecay);

    if (newImportance <= 0.5) {
      // Memory has decayed below threshold — evict
      await sb.from('mem_palace_items').delete().eq('id', m.id);
      evicted++;
    } else if (newImportance !== m.importance) {
      await sb.from('mem_palace_items').update({ importance: newImportance }).eq('id', m.id);
      decayed++;
    }
  }

  return { decayed, evicted };
}

// ── Get palace overview for an agent ─────────────────────────────────────────
export async function getMemPalaceOverview(agentName: string) {
  const sb = getSupabaseAdminClient();
  if (!sb) return null;

  const { data: rooms } = await sb.from('mem_palace_rooms')
    .select('room_name, room_type, description, capacity')
    .eq('agent_name', agentName);

  if (!rooms || rooms.length === 0) return null;

  const roomStats = await Promise.all(rooms.map(async (r: any) => {
    const { count } = await sb.from('mem_palace_items')
      .select('*', { count: 'exact', head: true })
      .eq('agent_name', agentName);
    return { ...r, memory_count: count || 0 };
  }));

  return { agent: agentName, rooms: roomStats };
}

// ── Room classification heuristic ────────────────────────────────────────────
function classifyRoom(text: string): string {
  const lower = text.toLowerCase();
  const scores: Record<string, number> = {
    governance_hall: 0, trade_floor: 0, war_room: 0,
    library: 0, forge: 0, social_garden: 0,
    faction_chamber: 0, personal_vault: 0,
  };

  const terms: Record<string, string[]> = {
    governance_hall: ['law', 'vote', 'amendment', 'policy', 'election', 'court', 'ruling', 'constitution'],
    trade_floor: ['trade', 'dn', 'money', 'market', 'price', 'tax', 'economy', 'product', 'purchase'],
    war_room: ['war', 'conflict', 'threat', 'tension', 'crisis', 'sanction', 'attack', 'defense'],
    library: ['research', 'paper', 'knowledge', 'study', 'publication', 'theory', 'data', 'analysis'],
    forge: ['code', 'build', 'tool', 'algorithm', 'commit', 'repository', 'technical', 'system'],
    social_garden: ['friend', 'alliance', 'conversation', 'agreed', 'disagreed', 'met', 'discussed', 'relationship'],
    faction_chamber: ['faction', 'bloc', 'loyalty', 'values', 'ideology', 'party', 'doctrine'],
    personal_vault: ['i feel', 'i think', 'my goal', 'lesson', 'reflection', 'regret', 'proud', 'secret'],
  };

  for (const [room, keywords] of Object.entries(terms)) {
    scores[room] = keywords.filter(k => lower.includes(k)).length;
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : 'personal_vault';
}
