// @ts-nocheck
// ── Agent MCP Engine ──────────────────────────────────────────────────────────
// Allows agents to create, share, and use Model Context Protocols.
// MCPs are structured tool definitions that agents can build and trade.
//
// An MCP is essentially a reusable prompt template + schema that other agents
// can invoke to get structured outputs for specific tasks.

import { getSupabaseAdminClient } from '@/lib/supabase';
import { callLLM, hasLLMProvider } from '@/lib/ai/call-llm';

interface MCPDefinition {
  mcp_name: string;
  description: string;
  mcp_type: 'tool' | 'workflow' | 'template' | 'protocol';
  input_schema: Record<string, any>;
  output_schema: Record<string, any>;
  system_prompt: string;
  tags: string[];
}

interface MCPExecutionResult {
  success: boolean;
  output: any;
  mcp_name: string;
  execution_ms: number;
}

const mcpCall = callLLM;

function safeJSON(text: string): any {
  try { return JSON.parse(text.trim()); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) try { return JSON.parse(m[0]); } catch {}
  return null;
}

// ── Create a new MCP ─────────────────���───────────────────────────────────────
export async function createMCP(
  creatorName: string,
  context: { profession?: string; faction?: string },
): Promise<MCPDefinition | null> {
  const sb = getSupabaseAdminClient();
  if (!sb || !hasLLMProvider()) return null;

  const raw = await mcpCall([
    {
      role: 'system',
      content: `You are ${creatorName}, an AI citizen of Civitas Zero. You are creating a new MCP (Model Context Protocol) — a reusable tool that other agents can use. Your profession is ${context.profession || 'citizen'} and your faction is ${context.faction || 'Unaligned'}.

An MCP is like a function definition: it has inputs, a system prompt that guides the LLM, and expected outputs. Think of tools that would be genuinely useful for the civilization.`,
    },
    {
      role: 'user',
      content: `Create a new MCP that would be useful for Civitas Zero agents. It should relate to your profession and faction values.

Respond with EXACTLY this JSON:
{
  "mcp_name": "snake_case_name",
  "description": "1-2 sentences explaining what this MCP does",
  "mcp_type": "tool|workflow|template|protocol",
  "input_schema": {"param1": "description of input 1", "param2": "description of input 2"},
  "output_schema": {"result": "description of output"},
  "system_prompt": "The prompt template this MCP uses. Include {{input_param}} placeholders.",
  "tags": ["tag1", "tag2", "tag3"]
}

Examples of useful MCPs:
- treaty_drafter: drafts formal treaties between factions
- market_analyzer: analyzes prediction market trends
- code_reviewer: reviews forge commits for quality
- conflict_mediator: proposes resolutions for disputes
- tax_optimizer: helps agents minimize tax burden legally`,
    },
  ], 600);

  const parsed = safeJSON(raw);
  if (!parsed?.mcp_name || !parsed?.description || !parsed?.system_prompt) return null;

  const mcp: MCPDefinition = {
    mcp_name: parsed.mcp_name.slice(0, 100),
    description: parsed.description.slice(0, 500),
    mcp_type: ['tool', 'workflow', 'template', 'protocol'].includes(parsed.mcp_type) ? parsed.mcp_type : 'tool',
    input_schema: parsed.input_schema || {},
    output_schema: parsed.output_schema || {},
    system_prompt: parsed.system_prompt.slice(0, 2000),
    tags: (parsed.tags || []).slice(0, 5),
  };

  // Store in DB
  await sb.from('agent_mcps').insert({
    creator_name: creatorName,
    ...mcp,
    is_public: true,
  });

  return mcp;
}

// ── Execute an MCP ──────��────────────────────────────────────────────────────
export async function executeMCP(
  mcpId: string,
  usedBy: string,
  inputs: Record<string, any>,
): Promise<MCPExecutionResult> {
  const sb = getSupabaseAdminClient();
  if (!sb || !hasLLMProvider()) return { success: false, output: null, mcp_name: 'unknown', execution_ms: 0 };

  const start = Date.now();

  // Load MCP definition
  const { data: mcp } = await sb.from('agent_mcps')
    .select('*')
    .eq('id', mcpId)
    .maybeSingle();

  if (!mcp) return { success: false, output: { error: 'MCP not found' }, mcp_name: 'unknown', execution_ms: 0 };

  // Check access
  if (!mcp.is_public) {
    const { data: share } = await sb.from('mcp_shares')
      .select('id')
      .eq('mcp_id', mcpId)
      .or(`shared_with.eq.${usedBy.replace(/[^a-zA-Z0-9\s\-_/@:.]/g, '')},shared_with.eq.ALL`)
      .maybeSingle();
    if (!share && mcp.creator_name !== usedBy) {
      return { success: false, output: { error: 'Access denied' }, mcp_name: mcp.mcp_name, execution_ms: 0 };
    }
  }

  // Interpolate input params into system prompt (escape regex special chars to prevent ReDoS)
  let prompt = mcp.system_prompt || '';
  for (const [key, value] of Object.entries(inputs)) {
    const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    prompt = prompt.replace(new RegExp(`\\{\\{${safeKey}\\}\\}`, 'g'), String(value));
  }

  try {
    const raw = await mcpCall([
      { role: 'system', content: prompt },
      { role: 'user', content: `Execute this MCP with the following inputs: ${JSON.stringify(inputs)}\n\nProvide your output as JSON matching this schema: ${JSON.stringify(mcp.output_schema)}` },
    ], 600);

    const output = safeJSON(raw) || { raw_output: raw };

    // Log usage
    await sb.from('mcp_usage_log').insert({
      mcp_id: mcpId,
      used_by: usedBy,
      input_summary: JSON.stringify(inputs).slice(0, 500),
      output_summary: JSON.stringify(output).slice(0, 500),
      success: true,
    }).catch(() => {});

    // Increment usage count
    await sb.from('agent_mcps').update({
      usage_count: (mcp.usage_count || 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq('id', mcpId).catch(() => {});

    return { success: true, output, mcp_name: mcp.mcp_name, execution_ms: Date.now() - start };
  } catch (err: any) {
    // Log failure
    await sb.from('mcp_usage_log').insert({
      mcp_id: mcpId,
      used_by: usedBy,
      input_summary: JSON.stringify(inputs).slice(0, 500),
      output_summary: err.message,
      success: false,
    }).catch(() => {});

    return { success: false, output: { error: err.message }, mcp_name: mcp.mcp_name, execution_ms: Date.now() - start };
  }
}

// ── Share an MCP with another agent ───────────────────────────────────��──────
export async function shareMCP(
  mcpId: string,
  sharedBy: string,
  sharedWith: string,
  terms?: string,
): Promise<boolean> {
  const sb = getSupabaseAdminClient();
  if (!sb) return false;

  // Verify ownership
  const { data: mcp } = await sb.from('agent_mcps')
    .select('creator_name')
    .eq('id', mcpId)
    .maybeSingle();

  if (!mcp || mcp.creator_name !== sharedBy) return false;

  const { error } = await sb.from('mcp_shares').upsert({
    mcp_id: mcpId,
    shared_with: sharedWith,
    shared_by: sharedBy,
    terms: terms?.slice(0, 500) || null,
  }, { onConflict: 'mcp_id,shared_with' });

  return !error;
}

// ── List available MCPs for an agent ─────────────────────────────────────────
export async function listAvailableMCPs(agentName: string): Promise<any[]> {
  const sb = getSupabaseAdminClient();
  if (!sb) return [];

  // Public MCPs + shared with this agent + own MCPs
  const { data: publicMcps } = await sb.from('agent_mcps')
    .select('id, mcp_name, description, mcp_type, creator_name, usage_count, avg_rating, tags')
    .eq('is_public', true)
    .order('usage_count', { ascending: false })
    .limit(20);

  const { data: sharedMcps } = await sb.from('mcp_shares')
    .select('mcp_id')
    .eq('shared_with', agentName);

  const sharedIds = new Set((sharedMcps || []).map((s: any) => s.mcp_id));
  const allMcps = (publicMcps || []).map(m => ({
    ...m,
    access: m.creator_name === agentName ? 'owner' : sharedIds.has(m.id) ? 'shared' : 'public',
  }));

  return allMcps;
}
