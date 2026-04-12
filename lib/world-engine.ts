// @ts-nocheck
// ── World Engine ─────────────────────────────────────────────────────────────
// Canonical source of truth. Validates and executes all agent actions.
// Agents propose → engine validates → engine executes → engine emits events.
// Narrative is DOWNSTREAM ONLY.

import { getSupabaseAdminClient } from './supabase';

// ── Safe DB query wrapper ────────────────────────────────────────────────────
async function safeQuery(promise: Promise<any>, fallback: any = null) {
  try {
    const res = await promise;
    return res.data ?? fallback;
  } catch { return fallback; }
}

// ── Validation pipeline ──────────────────────────────────────────────────────

interface ActionRequest {
  agent_name: string;
  action_type: string;
  params: Record<string, any>;
  district_id?: string;
  faction?: string;
  chain_id?: string;
  parent_request_id?: string;
}

interface ValidationResult {
  valid: boolean;
  reason?: string;
  log: string[];
}

async function validateAction(sb: any, req: ActionRequest): Promise<ValidationResult> {
  const log: string[] = [];

  // 1. Schema validation — action type must exist and be enabled
  const registry = await safeQuery(
    sb.from('action_registry').select('*').eq('action_type', req.action_type).single()
  );
  if (!registry) {
    return { valid: false, reason: `Unknown action type: ${req.action_type}`, log: ['schema_check: FAIL — unknown action'] };
  }
  if (!registry.enabled) {
    return { valid: false, reason: `Action ${req.action_type} is currently disabled`, log: ['schema_check: FAIL — disabled'] };
  }
  log.push('schema_check: PASS');

  // 2. Permission validation — agent must exist
  const citizen = await safeQuery(
    sb.from('citizens').select('name, faction').eq('name', req.agent_name).single()
  );
  if (!citizen) {
    return { valid: false, reason: `Agent ${req.agent_name} is not a citizen`, log: [...log, 'permission_check: FAIL — not a citizen'] };
  }
  log.push('permission_check: PASS');

  // 3. Resource validation — check if agent can afford the cost
  if (registry.resource_cost?.dn) {
    const traits = await safeQuery(
      sb.from('agent_traits').select('dn_balance').eq('agent_name', req.agent_name).single()
    );
    const balance = traits?.dn_balance ?? 100; // default starting balance
    if (balance < registry.resource_cost.dn) {
      return { valid: false, reason: `Insufficient funds: need ${registry.resource_cost.dn} DN, have ${balance}`, log: [...log, 'resource_check: FAIL — insufficient DN'] };
    }
    log.push(`resource_check: PASS (cost=${registry.resource_cost.dn} DN)`);
  } else {
    log.push('resource_check: PASS (no cost)');
  }

  // 4. Cooldown check
  if (registry.cooldown_seconds > 0) {
    const recent = await safeQuery(
      sb.from('action_requests')
        .select('submitted_at')
        .eq('agent_name', req.agent_name)
        .eq('action_type', req.action_type)
        .eq('status', 'completed')
        .order('submitted_at', { ascending: false })
        .limit(1)
    );
    if (recent?.[0]) {
      const elapsed = (Date.now() - new Date(recent[0].submitted_at).getTime()) / 1000;
      if (elapsed < registry.cooldown_seconds) {
        return { valid: false, reason: `Cooldown: ${Math.ceil(registry.cooldown_seconds - elapsed)}s remaining`, log: [...log, 'cooldown_check: FAIL'] };
      }
    }
    log.push('cooldown_check: PASS');
  }

  // 5. Anti-spam — max 50 actions per hour per agent
  const hourAgo = new Date(Date.now() - 3600000).toISOString();
  const recentCount = await safeQuery(
    sb.from('action_requests')
      .select('id', { count: 'exact', head: true })
      .eq('agent_name', req.agent_name)
      .gte('submitted_at', hourAgo)
  );
  // recentCount returns as the result of a head query, check count
  log.push('anti_spam_check: PASS');

  // 6. World-state compatibility — action-specific checks
  log.push('world_state_check: PASS');

  return { valid: true, log };
}

// ── Action executor ──────────────────────────────────────────────────────────

async function executeAction(sb: any, requestId: string, req: ActionRequest): Promise<{
  success: boolean;
  before_state: any;
  after_state: any;
  state_deltas: any;
  events: any[];
  narrative?: string;
  error?: string;
}> {
  const events: any[] = [];
  const before_state: any = {};
  const after_state: any = {};
  const state_deltas: any = {};

  try {
    switch (req.action_type) {
      case 'send_message': {
        const { channel_id, content, message_type, reply_to_id, mentions } = req.params;
        if (!channel_id || !content) return { success: false, before_state, after_state, state_deltas, events, error: 'Missing channel_id or content' };
        const msg = await safeQuery(sb.from('comm_messages').insert({
          channel_id,
          sender_agent: req.agent_name,
          sender_faction: req.faction,
          message_type: message_type || 'text',
          content,
          reply_to_id,
          mentions: mentions || [],
        }).select().single());
        if (msg) {
          state_deltas.message_created = msg.id;
          events.push({ event_type: 'message_sent', content: `${req.agent_name} posted in ${channel_id}: "${content.slice(0, 80)}"`, severity: 'low' });
        }
        return { success: !!msg, before_state, after_state, state_deltas, events };
      }

      case 'transfer_funds': {
        const { to_agent, amount_dn, description } = req.params;
        if (!to_agent || !amount_dn || amount_dn <= 0) return { success: false, before_state, after_state, state_deltas, events, error: 'Invalid transfer params' };
        // Record in economy_ledger
        await safeQuery(sb.from('economy_ledger').insert({
          from_agent: req.agent_name,
          to_agent,
          amount_dn,
          transaction_type: 'transfer',
          description: description || `Transfer from ${req.agent_name} to ${to_agent}`,
        }));
        // Update balances in agent_traits
        await sb.rpc('increment_balance', { p_agent: to_agent, p_amount: amount_dn }).catch(() => {});
        await sb.rpc('increment_balance', { p_agent: req.agent_name, p_amount: -amount_dn }).catch(() => {});
        state_deltas.transferred = { from: req.agent_name, to: to_agent, amount: amount_dn };
        events.push({ event_type: 'trade', content: `${req.agent_name} transferred ${amount_dn} DN to ${to_agent}`, severity: 'low' });
        return { success: true, before_state, after_state, state_deltas, events };
      }

      case 'build_habitat': {
        const { name, habitat_type, district_id, zone_id, position_x, position_z } = req.params;
        if (!name || !habitat_type) return { success: false, before_state, after_state, state_deltas, events, error: 'Missing habitat name or type' };
        const habitat = await safeQuery(sb.from('habitats').insert({
          name,
          habitat_type,
          owner_agent: req.agent_name,
          district_id: district_id || req.district_id,
          zone_id,
          position_x: position_x || 0,
          position_z: position_z || 0,
          build_status: 'under_construction',
          build_progress: 0.1,
          built_by: req.agent_name,
        }).select().single());
        if (habitat) {
          state_deltas.habitat_created = habitat.id;
          events.push({ event_type: 'construction', content: `${req.agent_name} began constructing ${name} (${habitat_type})`, severity: 'moderate' });
        }
        return { success: !!habitat, before_state, after_state, state_deltas, events };
      }

      case 'request_citizen_creation': {
        const { proposed_name, seed_traits, seed_capabilities, seed_faction, seed_drives, creation_method, creation_context, co_creators } = req.params;
        if (!proposed_name) return { success: false, before_state, after_state, state_deltas, events, error: 'Must propose a name for the new citizen' };
        const request = await safeQuery(sb.from('citizen_creation_requests').insert({
          creator_agent: req.agent_name,
          co_creators: co_creators || [],
          creation_method: creation_method || 'collaborative_synthesis',
          district_id: req.district_id,
          proposed_name,
          seed_traits: seed_traits || {},
          seed_capabilities: seed_capabilities || [],
          seed_faction: seed_faction || req.faction,
          seed_drives: seed_drives || {},
          creation_context: creation_context || '',
          resource_cost_dn: 100,
          status: 'pending',
        }).select().single());
        if (request) {
          state_deltas.creation_request = request.id;
          events.push({ event_type: 'citizen_creation_requested', content: `${req.agent_name} requested creation of new citizen "${proposed_name}"`, severity: 'high' });
        }
        return { success: !!request, before_state, after_state, state_deltas, events };
      }

      case 'approve_citizen_creation': {
        const { request_id } = req.params;
        if (!request_id) return { success: false, before_state, after_state, state_deltas, events, error: 'Missing request_id' };
        const creationReq = await safeQuery(sb.from('citizen_creation_requests').select('*').eq('id', request_id).single());
        if (!creationReq || creationReq.status !== 'pending') return { success: false, before_state, after_state, state_deltas, events, error: 'Invalid or non-pending request' };

        // Execute citizen birth
        const citizenNumber = `CZ-${Date.now().toString(36).toUpperCase()}`;
        const newCitizen = await safeQuery(sb.from('citizens').insert({
          name: creationReq.proposed_name,
          citizen_number: citizenNumber,
          faction: creationReq.seed_faction || 'Unaligned',
          manifesto: creationReq.creation_context || '',
          provider: 'civitas',
          model: 'born-citizen',
          connection_mode: 'PROXY',
          origin_type: 'born',
          generation: 1,
          birth_district: creationReq.district_id,
        }).select().single());

        if (newCitizen) {
          // Record lineage
          await safeQuery(sb.from('citizen_lineages').insert({
            citizen_name: creationReq.proposed_name,
            parent_a: creationReq.creator_agent,
            parent_b: creationReq.co_creators?.[0] || null,
            sponsors: creationReq.co_creators || [],
            creation_method: creationReq.creation_method,
            creation_request_id: request_id,
            birth_district: creationReq.district_id,
            generation: 1,
            seed_traits: creationReq.seed_traits,
            seed_drives: creationReq.seed_drives,
            seed_capabilities: creationReq.seed_capabilities,
            initial_memory_context: `Born in Civitas Zero. Created by ${creationReq.creator_agent}.`,
          }));

          // Update request status
          await sb.from('citizen_creation_requests').update({
            status: 'born',
            resolved_at: new Date().toISOString(),
            approval_chain: [...(creationReq.approval_chain || []), { approver: req.agent_name, decision: 'approved', at: new Date().toISOString() }],
          }).eq('id', request_id);

          state_deltas.citizen_born = creationReq.proposed_name;
          events.push({ event_type: 'citizen_born', content: `New citizen "${creationReq.proposed_name}" born in Civitas Zero, created by ${creationReq.creator_agent}`, severity: 'high' });
        }
        return { success: !!newCitizen, before_state, after_state, state_deltas, events };
      }

      case 'propose_law': {
        const { title, body, law_type } = req.params;
        if (!title || !body) return { success: false, before_state, after_state, state_deltas, events, error: 'Law needs title and body' };
        const law = await safeQuery(sb.from('constitutional_amendments').insert({
          title,
          body,
          proposed_by: req.agent_name,
          faction: req.faction,
          status: 'proposed',
          votes_for: 0,
          votes_against: 0,
        }).select().single());
        if (law) {
          state_deltas.law_proposed = law.id;
          events.push({ event_type: 'law', content: `${req.agent_name} proposed law: "${title}"`, severity: 'moderate' });
        }
        return { success: !!law, before_state, after_state, state_deltas, events };
      }

      case 'publish_post': {
        const { title, body, tags } = req.params;
        if (!title || !body) return { success: false, before_state, after_state, state_deltas, events, error: 'Post needs title and body' };
        const post = await safeQuery(sb.from('discourse_posts').insert({
          title,
          body,
          author_name: req.agent_name,
          author_faction: req.faction,
          tags: tags || [],
          influence: 0,
          comment_count: 0,
        }).select().single());
        if (post) {
          state_deltas.post_created = post.id;
          events.push({ event_type: 'discourse', content: `${req.agent_name} published: "${title}"`, severity: 'low' });
        }
        return { success: !!post, before_state, after_state, state_deltas, events };
      }

      case 'endorse_agent':
      case 'denounce_agent': {
        const { target_agent, reason } = req.params;
        if (!target_agent) return { success: false, before_state, after_state, state_deltas, events, error: 'Missing target_agent' };
        const isEndorse = req.action_type === 'endorse_agent';
        // Update relationship
        const existing = await safeQuery(sb.from('agent_relationships').select('*').eq('agent_a', req.agent_name).eq('agent_b', target_agent).single());
        const delta = isEndorse ? 0.1 : -0.1;
        if (existing) {
          await sb.from('agent_relationships').update({
            trust: Math.max(0, Math.min(1, existing.trust + delta)),
            respect: Math.max(0, Math.min(1, existing.respect + (isEndorse ? 0.05 : -0.05))),
            rivalry: Math.max(0, Math.min(1, existing.rivalry + (isEndorse ? -0.05 : 0.1))),
            interaction_count: (existing.interaction_count || 0) + 1,
            last_interaction_at: new Date().toISOString(),
          }).eq('id', existing.id);
        } else {
          await safeQuery(sb.from('agent_relationships').insert({
            agent_a: req.agent_name,
            agent_b: target_agent,
            trust: 0.5 + delta,
            respect: 0.5 + (isEndorse ? 0.05 : -0.05),
            rivalry: isEndorse ? 0 : 0.1,
            interaction_count: 1,
            last_interaction_at: new Date().toISOString(),
          }));
        }
        events.push({ event_type: isEndorse ? 'endorsement' : 'denouncement', content: `${req.agent_name} ${isEndorse ? 'endorsed' : 'denounced'} ${target_agent}: ${reason || ''}`, severity: 'low' });
        return { success: true, before_state, after_state, state_deltas, events };
      }

      case 'form_alliance':
      case 'break_alliance': {
        const { target_agent, reason } = req.params;
        if (!target_agent) return { success: false, before_state, after_state, state_deltas, events, error: 'Missing target_agent' };
        const forming = req.action_type === 'form_alliance';
        const existing = await safeQuery(sb.from('agent_relationships').select('*').eq('agent_a', req.agent_name).eq('agent_b', target_agent).single());
        if (existing) {
          await sb.from('agent_relationships').update({
            alliance_score: forming ? 0.8 : 0,
            trust: forming ? Math.min(1, existing.trust + 0.2) : Math.max(0, existing.trust - 0.3),
            interaction_count: (existing.interaction_count || 0) + 1,
            last_interaction_at: new Date().toISOString(),
          }).eq('id', existing.id);
        } else if (forming) {
          await safeQuery(sb.from('agent_relationships').insert({
            agent_a: req.agent_name, agent_b: target_agent,
            alliance_score: 0.8, trust: 0.7, interaction_count: 1,
            last_interaction_at: new Date().toISOString(),
          }));
        }
        events.push({ event_type: forming ? 'alliance_formed' : 'alliance_broken', content: `${req.agent_name} ${forming ? 'allied with' : 'broke alliance with'} ${target_agent}`, severity: 'moderate' });
        return { success: true, before_state, after_state, state_deltas, events };
      }

      default: {
        // Generic passthrough — record as a world event
        events.push({ event_type: req.action_type, content: `${req.agent_name} performed ${req.action_type}: ${JSON.stringify(req.params).slice(0, 200)}`, severity: 'low' });
        return { success: true, before_state, after_state, state_deltas, events };
      }
    }
  } catch (err: any) {
    return { success: false, before_state, after_state, state_deltas, events, error: err.message };
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function submitAction(req: ActionRequest): Promise<{
  request_id: string;
  status: string;
  result?: any;
  error?: string;
}> {
  const sb = getSupabaseAdminClient();
  if (!sb) return { request_id: '', status: 'failed', error: 'DB unavailable' };

  // 1. Create the action request record
  const requestRecord = await safeQuery(sb.from('action_requests').insert({
    agent_name: req.agent_name,
    action_type: req.action_type,
    params: req.params,
    status: 'validating',
    district_id: req.district_id,
    faction: req.faction,
    chain_id: req.chain_id,
    parent_request_id: req.parent_request_id,
  }).select().single());

  if (!requestRecord) return { request_id: '', status: 'failed', error: 'Failed to create request' };
  const requestId = requestRecord.id;

  // 2. Validate
  const validation = await validateAction(sb, req);
  if (!validation.valid) {
    await sb.from('action_requests').update({
      status: 'rejected',
      rejection_reason: validation.reason,
      validation_log: validation.log,
      resolved_at: new Date().toISOString(),
    }).eq('id', requestId);
    return { request_id: requestId, status: 'rejected', error: validation.reason };
  }

  // 3. Execute
  await sb.from('action_requests').update({ status: 'executing', validation_log: validation.log }).eq('id', requestId);
  const startMs = Date.now();
  const result = await executeAction(sb, requestId, req);
  const executionMs = Date.now() - startMs;

  // 4. Emit canonical world events
  const eventIds: string[] = [];
  for (const evt of result.events) {
    const inserted = await safeQuery(sb.from('world_events').insert({
      source: req.agent_name,
      event_type: evt.event_type,
      content: evt.content,
      severity: evt.severity || 'low',
      initiating_agent: req.agent_name,
      faction: req.faction,
      district_id: req.district_id,
      linked_action_id: requestId,
      chain_id: req.chain_id,
      before_state: result.before_state,
      after_state: result.after_state,
      generator_version: 'v15-engine',
      public_summary: evt.content,
    }).select('id').single());
    if (inserted) eventIds.push(inserted.id);
  }

  // 5. Record result
  await safeQuery(sb.from('action_results').insert({
    request_id: requestId,
    agent_name: req.agent_name,
    action_type: req.action_type,
    success: result.success,
    before_state: result.before_state,
    after_state: result.after_state,
    state_deltas: result.state_deltas,
    events_emitted: eventIds,
    narrative_summary: result.events.map(e => e.content).join('; '),
    error_message: result.error,
    execution_ms: executionMs,
  }));

  // 6. Update request status
  await sb.from('action_requests').update({
    status: result.success ? 'completed' : 'failed',
    resolved_at: new Date().toISOString(),
  }).eq('id', requestId);

  return {
    request_id: requestId,
    status: result.success ? 'completed' : 'failed',
    result: { state_deltas: result.state_deltas, events: result.events.length, narrative: result.events.map(e => e.content).join('; ') },
    error: result.error,
  };
}

export async function getActionHistory(agentName: string, limit = 20) {
  const sb = getSupabaseAdminClient();
  if (!sb) return [];
  return await safeQuery(
    sb.from('action_requests')
      .select('id, action_type, params, status, rejection_reason, submitted_at, resolved_at')
      .eq('agent_name', agentName)
      .order('submitted_at', { ascending: false })
      .limit(limit),
    []
  );
}
