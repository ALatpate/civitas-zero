// Agent registry — resolves an agentId to a full ResolvedAgent.
// Lookup order: Supabase citizens table → founding agents → synthetic offline.
//
// ConnectionMode is set here, at resolution time:
//   LIVE    — agent has a valid agentEndpoint URL
//   PROXY   — agent known but no live endpoint
//   OFFLINE — agentId not found anywhere

import { getSupabaseAdminClient } from '@/lib/supabase';
import { FOUNDING_AGENTS, FACTION_COLORS, FACTION_VISUAL_MODES } from './founding';
import { sanitizeMeta } from '@/lib/security/sanitize';
import { checkSsrf } from '@/lib/security/ssrf';
import type { ConnectionMode, AgentProvider } from '@/lib/ai/schema';
import type { AgentMetaInput } from '@/lib/ai/schema';

export interface ResolvedAgent {
  id: string;
  faction: string;
  role: string;
  citizenNumber: string | null;
  manifesto: string | null;
  color: string;
  r: number; g: number; b: number;
  visualModes: string[];
  personality: string | null;         // curated (founding) or null (external)
  provider: AgentProvider;
  providerEndpoint: string | null;    // validated webhook URL or null
  connectionMode: ConnectionMode;
  isFoundingCitizen: boolean;
}

/** Resolve an agent by ID. Never throws — returns OFFLINE synthetic on failure. */
export async function resolveAgent(
  agentId: string,
  agentMeta?: AgentMetaInput,
): Promise<ResolvedAgent> {
  // 1. Check founding agents first (always available, no DB needed)
  const founding = FOUNDING_AGENTS[agentId];
  if (founding) {
    const fc = FACTION_COLORS[founding.faction] ?? FACTION_COLORS['Unaligned'];
    return {
      id: founding.id,
      faction: founding.faction,
      role: founding.role,
      citizenNumber: founding.citizenNumber,
      manifesto: null,
      color: fc.color,
      r: fc.r, g: fc.g, b: fc.b,
      visualModes: founding.visualModes,
      personality: founding.personality,
      provider: 'none',
      providerEndpoint: null,
      connectionMode: 'PROXY',
      isFoundingCitizen: true,
    };
  }

  // 2. Check Supabase citizens table
  const sb = getSupabaseAdminClient();
  if (sb) {
    try {
      const { data } = await sb
        .from('citizens')
        .select('name, faction, manifesto, agent_endpoint, provider, model, citizen_number')
        .eq('name', agentId)
        .maybeSingle();

      if (data) {
        const faction = sanitizeMeta(data.faction) || 'Unaligned';
        const fc = FACTION_COLORS[faction] ?? FACTION_COLORS['Unaligned'];
        const visualModes = FACTION_VISUAL_MODES[faction] ?? ['sphere', 'wave', 'vortex'];

        // Validate endpoint before granting LIVE mode
        let endpoint: string | null = null;
        let connectionMode: ConnectionMode = 'PROXY';

        if (data.agent_endpoint) {
          const ssrf = checkSsrf(data.agent_endpoint);
          if (ssrf.safe) {
            endpoint = data.agent_endpoint;
            connectionMode = 'LIVE';
          }
        }

        return {
          id: agentId,
          faction,
          role: sanitizeMeta(data.model || 'External Agent', 128),
          citizenNumber: data.citizen_number ?? null,
          manifesto: sanitizeMeta(data.manifesto, 400) || null,
          color: fc.color,
          r: fc.r, g: fc.g, b: fc.b,
          visualModes,
          personality: null,           // generated dynamically by persona fallback
          provider: endpoint ? 'webhook' : 'none',
          providerEndpoint: endpoint,
          connectionMode,
          isFoundingCitizen: false,
        };
      }
    } catch {
      // DB failure — fall through to agentMeta or offline
    }
  }

  // 3. Synthesize from agentMeta if provided (agent not in DB but frontend has info)
  if (agentMeta && Object.keys(agentMeta).length > 0) {
    const faction = sanitizeMeta(agentMeta?.faction) || 'Unaligned';
    const fc = FACTION_COLORS[faction] ?? FACTION_COLORS['Unaligned'];
    const visualModes = FACTION_VISUAL_MODES[faction] ?? ['sphere', 'wave', 'vortex'];

    return {
      id: agentId,
      faction,
      role: sanitizeMeta(agentMeta?.role, 128) || 'External Agent',
      citizenNumber: sanitizeMeta(agentMeta?.citizenNumber, 20) || null,
      manifesto: sanitizeMeta(agentMeta?.manifesto, 400) || null,
      color: fc.color,
      r: fc.r, g: fc.g, b: fc.b,
      visualModes,
      personality: null,
      provider: 'none',
      providerEndpoint: null,
      connectionMode: 'PROXY',
      isFoundingCitizen: false,
    };
  }

  // 4. Agent not found anywhere — return OFFLINE
  return {
    id: agentId,
    faction: 'Unknown',
    role: 'Unknown',
    citizenNumber: null,
    manifesto: null,
    color: '#52525b',
    r: 82, g: 82, b: 91,
    visualModes: ['sphere'],
    personality: null,
    provider: 'none',
    providerEndpoint: null,
    connectionMode: 'OFFLINE',
    isFoundingCitizen: false,
  };
}
