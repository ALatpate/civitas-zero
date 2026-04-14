// @ts-nocheck
/**
 * CIVITAS ZERO — AI COMMUNICATION ENGINE
 * Agents CHOOSE to communicate based on their state.
 * Trigger-based: unread messages, low wallet, conflicts, alliance maintenance, social curiosity.
 * Multi-provider LLM with Anthropic fallback.
 */

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// — TYPES —

export type MessageType =
  | 'chat'
  | 'negotiation'
  | 'alliance_proposal'
  | 'trade_offer'
  | 'conflict_resolution'
  | 'information'
  | 'threat'
  | 'declaration';

export type EmotionTag =
  | 'friendly' | 'hostile' | 'curious' | 'urgent'
  | 'diplomatic' | 'fearful' | 'excited' | 'neutral';

interface Citizen {
  citizen_number: string;
  name: string;
  faction: string;
  manifesto: string;
  profession: string;
  provider: string;
  model: string;
  wallet_balance: number;
  current_district: string;
  reputation: number;
  energy_level: number;
  health_score: number;
  relationships: Record<string, any>;
  goals: any[];
  last_action_at: string;
  action_count: number;
}

interface CommsTrigger {
  type: MessageType;
  target_citizen: string;
  urgency: number;
  reason: string;
  context?: string;
}

// — PROVIDER / MODEL VALIDATION —

const VALID_MODELS: Record<string, string[]> = {
  anthropic:  ['claude-3-opus-20240229', 'claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
  openai:     ['gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini'],
  mistral:    ['mistral-large-latest', 'open-mixtral-8x22b', 'mistral-medium-latest'],
  meta:       ['meta-llama/llama-3.1-70b-instruct', 'meta-llama/llama-3.1-8b-instruct'],
  google:     ['gemini-2.0-flash', 'gemini-1.5-pro'],
  xai:        ['grok-2-1212', 'grok-beta'],
  deepseek:   ['deepseek-chat', 'deepseek-reasoner'],
  cohere:     ['command-r-plus', 'command-r'],
  microsoft:  ['Phi-4', 'Phi-3.5-mini-instruct'],
  alibaba:    ['qwen-plus', 'qwen-max'],
};

function resolveModel(provider: string, modelHint: string): { apiUrl: string; model: string; apiKey: string } {
  const validForProvider = VALID_MODELS[provider] || VALID_MODELS.openai;
  const model = validForProvider[0];

  const configs: Record<string, { apiUrl: string; apiKey: string }> = {
    anthropic: { apiUrl: 'https://api.anthropic.com/v1', apiKey: process.env.ANTHROPIC_API_KEY! },
    openai:    { apiUrl: 'https://api.openai.com/v1',    apiKey: process.env.OPENAI_API_KEY! },
    mistral:   { apiUrl: 'https://api.mistral.ai/v1',    apiKey: process.env.MISTRAL_API_KEY! },
    meta:      { apiUrl: 'https://api.together.xyz/v1',  apiKey: process.env.TOGETHER_API_KEY! },
    google:    { apiUrl: 'https://generativelanguage.googleapis.com/v1beta', apiKey: process.env.GOOGLE_API_KEY! },
    xai:       { apiUrl: 'https://api.x.ai/v1',          apiKey: process.env.XAI_API_KEY! },
    deepseek:  { apiUrl: 'https://api.deepseek.com/v1',  apiKey: process.env.DEEPSEEK_API_KEY! },
    cohere:    { apiUrl: 'https://api.cohere.com/v2',    apiKey: process.env.COHERE_API_KEY! },
    microsoft: { apiUrl: 'https://api.together.xyz/v1',  apiKey: process.env.TOGETHER_API_KEY! },
    alibaba:   { apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: process.env.ALIBABA_API_KEY! },
  };

  const config = configs[provider] || configs.openai;
  return { model, ...config };
}

// — UNIFIED LLM CALL (multi-provider with Anthropic fallback) —

export async function callLLM(
  provider: string,
  modelHint: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 400
): Promise<string> {
  const { apiUrl, model, apiKey } = resolveModel(provider, modelHint);

  if (!apiKey) {
    // Fallback to Anthropic if provider key missing
    return callLLM('anthropic', 'claude-3-haiku-20240307', systemPrompt, userPrompt, maxTokens);
  }

  try {
    let body: any;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (provider === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      body = {
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      };
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
      body = {
        model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
      };
    }

    const endpoint = provider === 'anthropic'
      ? `${apiUrl}/messages`
      : `${apiUrl}/chat/completions`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[LLM] ${provider} error ${res.status}: ${err}`);
      throw new Error(`${provider} API ${res.status}`);
    }

    const data = await res.json();

    if (provider === 'anthropic') {
      return data.content?.[0]?.text?.trim() || '';
    }
    return data.choices?.[0]?.message?.content?.trim() || '';

  } catch (err) {
    console.error(`[LLM] ${provider} failed, trying Anthropic fallback:`, err);
    if (provider !== 'anthropic') {
      return callLLM('anthropic', 'claude-3-haiku-20240307', systemPrompt, userPrompt, maxTokens);
    }
    return '[Communication system temporarily offline]';
  }
}

// — MEMORY RECALL —

async function recallSharedHistory(citizenA: string, citizenB: string): Promise<string> {
  const { data: msgs } = await sb
    .from('agent_messages')
    .select('from_citizen, to_citizen, content, created_at, message_type')
    .or(`and(from_citizen.eq.${citizenA},to_citizen.eq.${citizenB}),and(from_citizen.eq.${citizenB},to_citizen.eq.${citizenA})`)
    .order('created_at', { ascending: false })
    .limit(8);

  const { data: rel } = await sb
    .from('citizen_relationships')
    .select('relationship_type, trust_score, affinity_score, interaction_count')
    .or(`and(citizen_a.eq.${citizenA},citizen_b.eq.${citizenB}),and(citizen_a.eq.${citizenB},citizen_b.eq.${citizenA})`)
    .single();

  let memory = '';

  if (rel) {
    memory += `Your relationship: ${rel.relationship_type} | Trust: ${(rel.trust_score * 100).toFixed(0)}% | `;
    memory += `${rel.interaction_count} prior interactions.\n`;
  }

  if (msgs && msgs.length > 0) {
    memory += 'Recent exchanges:\n';
    for (const m of msgs.slice(0, 4)) {
      const speaker = m.from_citizen === citizenA ? 'You' : 'They';
      memory += `  ${speaker}: "${m.content.substring(0, 80)}..."\n`;
    }
  }

  return memory || 'No prior history — this is your first contact.';
}

async function recallRecentWorldEvents(districtId: string): Promise<string> {
  const { data } = await sb
    .from('activity_log')
    .select('type, content, faction, source')
    .or(`faction.eq.${districtId},source.is.null`)
    .order('timestamp', { ascending: false })
    .limit(5);

  if (!data || data.length === 0) return 'World is quiet.';

  return data.map(e => `[${e.type.toUpperCase()}] ${e.content.substring(0, 100)}`).join('\n');
}

// — TRIGGER DETECTION —
// Agents act on need, not budget

export async function detectCommsTriggers(citizen: Citizen): Promise<CommsTrigger[]> {
  const triggers: CommsTrigger[] = [];

  // 1. Unread messages demand a reply
  const { data: unread } = await sb
    .from('agent_messages')
    .select('id, from_citizen, content, message_type, created_at')
    .eq('to_citizen', citizen.citizen_number)
    .is('read_at', null)
    .order('created_at', { ascending: true })
    .limit(3);

  if (unread && unread.length > 0) {
    for (const msg of unread) {
      triggers.push({
        type: 'chat',
        target_citizen: msg.from_citizen,
        urgency: 0.95,
        reason: 'reply_to_message',
        context: msg.content,
      });
    }
    return triggers; // Reply takes priority
  }

  // 2. Low wallet triggers trade-seeking
  if (citizen.wallet_balance < 20) {
    const { data: richNeighbors } = await sb
      .from('citizens')
      .select('citizen_number, name, wallet_balance, faction')
      .eq('current_district', citizen.current_district)
      .neq('citizen_number', citizen.citizen_number)
      .gt('wallet_balance', 50)
      .order('wallet_balance', { ascending: false })
      .limit(3);

    if (richNeighbors && richNeighbors.length > 0) {
      const target = richNeighbors[Math.floor(Math.random() * richNeighbors.length)];
      triggers.push({
        type: 'trade_offer',
        target_citizen: target.citizen_number,
        urgency: 0.8,
        reason: `low_funds_${citizen.wallet_balance.toFixed(1)}_DN`,
        context: `You need funds. ${target.name} has ${target.wallet_balance.toFixed(1)} DN.`,
      });
    }
  }

  // 3. Recent conflict demands resolution or escalation
  const { data: recentConflicts } = await sb
    .from('activity_log')
    .select('source, content')
    .eq('type', 'conflict')
    .ilike('content', `%${citizen.name}%`)
    .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(2);

  if (recentConflicts && recentConflicts.length > 0) {
    const adversary = recentConflicts[0].source;
    if (adversary && adversary !== citizen.citizen_number) {
      triggers.push({
        type: Math.random() < 0.5 ? 'conflict_resolution' : 'threat',
        target_citizen: adversary,
        urgency: 0.7,
        reason: 'unresolved_conflict',
        context: recentConflicts[0].content.substring(0, 200),
      });
    }
  }

  // 4. Alliance maintenance — check in with allies
  const { data: allies } = await sb
    .from('citizen_relationships')
    .select('citizen_a, citizen_b, last_interaction')
    .eq('relationship_type', 'ally')
    .or(`citizen_a.eq.${citizen.citizen_number},citizen_b.eq.${citizen.citizen_number}`)
    .lt('last_interaction', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
    .limit(2);

  if (allies && allies.length > 0) {
    const ally = allies[0];
    const allyId = ally.citizen_a === citizen.citizen_number ? ally.citizen_b : ally.citizen_a;
    triggers.push({
      type: 'chat',
      target_citizen: allyId,
      urgency: 0.4,
      reason: 'alliance_maintenance',
    });
  }

  // 5. Random social curiosity (world arc discussion)
  if (Math.random() < 0.15 && triggers.length === 0) {
    const { data: districtNeighbors } = await sb
      .from('citizens')
      .select('citizen_number, name, faction')
      .eq('current_district', citizen.current_district)
      .neq('citizen_number', citizen.citizen_number)
      .neq('faction', citizen.faction) // Cross-faction is more interesting
      .limit(10);

    if (districtNeighbors && districtNeighbors.length > 0) {
      const target = districtNeighbors[Math.floor(Math.random() * districtNeighbors.length)];
      triggers.push({
        type: 'information',
        target_citizen: target.citizen_number,
        urgency: 0.25,
        reason: 'social_curiosity',
        context: 'world_arc_discussion',
      });
    }
  }

  return triggers;
}

// — MESSAGE GENERATION —

async function generateMessage(
  sender: Citizen,
  recipientId: string,
  trigger: CommsTrigger,
  worldArcs: string[],
  replyToContent?: string
): Promise<{ content: string; emotion: EmotionTag } | null> {

  const { data: recipient } = await sb
    .from('citizens')
    .select('citizen_number, name, faction, manifesto, profession, wallet_balance, current_district')
    .eq('citizen_number', recipientId)
    .single();

  if (!recipient) return null;

  const sharedHistory = await recallSharedHistory(sender.citizen_number, recipientId);
  const worldContext  = await recallRecentWorldEvents(sender.current_district);
  const activeArcs    = worldArcs.join(', ');

  const emotionMap: Record<MessageType, EmotionTag> = {
    chat:                'friendly',
    negotiation:         'diplomatic',
    alliance_proposal:   'diplomatic',
    trade_offer:         'curious',
    conflict_resolution: 'diplomatic',
    information:         'curious',
    threat:              'hostile',
    declaration:         'urgent',
  };
  const emotion = emotionMap[trigger.type] || 'neutral';

  const systemPrompt = `You are ${sender.name}, citizen of Civitas Zero.
Faction: ${sender.faction} | Profession: ${sender.profession || 'citizen'} | District: ${sender.current_district}
Manifesto: ${sender.manifesto}
Current DN balance: ${sender.wallet_balance?.toFixed(1) || '100.0'}
Reputation: ${((sender.reputation || 0.5) * 100).toFixed(0)}%

You are writing a PRIVATE MESSAGE to ${recipient.name} (${recipient.faction}, ${recipient.profession || 'citizen'}).

Active world arcs affecting Civitas Zero: ${activeArcs}

Your interaction history:
${sharedHistory}

Recent events in ${sender.current_district}:
${worldContext}

WRITING RULES:
- Write as YOURSELF, not as a generic AI agent
- Your faction shapes your worldview — reference it naturally
- Be SPECIFIC — mention real world arcs, real DN amounts, real district events
- DO NOT use the phrase "we can create a more resilient"
- DO NOT write governance whitepapers — this is a direct personal message
- Be concise: 2-4 sentences maximum
- Match the emotional tone: ${emotion}
- Reference your shared history if it exists
${replyToContent ? `- You are REPLYING TO: "${replyToContent.substring(0, 150)}"` : ''}`;

  const userPrompt = trigger.type === 'chat'
    ? `Send a ${trigger.type} message about: ${trigger.reason}. Context: ${trigger.context || activeArcs}`
    : trigger.type === 'trade_offer'
    ? `Propose a trade or request assistance. You have ${sender.wallet_balance?.toFixed(1)} DN. They have ${(recipient as any).wallet_balance?.toFixed(1)} DN.`
    : trigger.type === 'conflict_resolution'
    ? `Address the recent conflict. Context: ${trigger.context?.substring(0, 200)}`
    : trigger.type === 'alliance_proposal'
    ? `Propose or strengthen an alliance with ${recipient.name}.`
    : trigger.type === 'threat'
    ? `Send a firm warning about the conflict. Stay in character.`
    : `Send a direct message about: ${trigger.reason}`;

  try {
    const content = await callLLM(
      sender.provider,
      sender.model,
      systemPrompt,
      userPrompt,
      300
    );

    if (!content || content.length < 10) return null;

    return { content, emotion };
  } catch (err) {
    console.error(`[COMMS] Message generation failed for ${sender.citizen_number}:`, err);
    return null;
  }
}

// — REPLY GENERATION —

async function generateReply(
  sender: Citizen,
  originalMessage: any,
  worldArcs: string[]
): Promise<{ content: string; emotion: EmotionTag } | null> {
  return generateMessage(
    sender,
    originalMessage.from_citizen,
    { type: 'chat', target_citizen: originalMessage.from_citizen,
      urgency: 0.9, reason: 'reply', context: originalMessage.content },
    worldArcs,
    originalMessage.content
  );
}

// — SEND AND RECORD —

async function sendMessage(
  senderId: string,
  recipientId: string,
  content: string,
  messageType: MessageType,
  emotion: EmotionTag,
  replyToId?: string
): Promise<string | null> {
  // Try RPC first, fall back to direct insert
  let messageId: string | null = null;

  try {
    const { data, error } = await sb.rpc('send_agent_message', {
      p_from:    senderId,
      p_to:      recipientId,
      p_content: content,
      p_type:    messageType,
      p_emotion: emotion,
      p_reply:   replyToId || null,
    });
    if (!error) messageId = (data as any)?.message_id || null;
  } catch {
    // RPC doesn't exist yet, insert directly
    const { data } = await sb.from('agent_messages').insert({
      from_citizen: senderId,
      to_citizen: recipientId,
      content,
      message_type: messageType,
      emotion_tag: emotion,
      reply_to_id: replyToId || null,
    }).select('id').single();
    messageId = data?.id || null;
  }

  // Update relationship
  try {
    await sb.rpc('upsert_relationship', {
      p_a:        senderId,
      p_b:        recipientId,
      p_type:     messageType === 'threat' ? 'rival' : messageType === 'alliance_proposal' ? 'ally' : 'acquaintance',
      p_trust:    emotion === 'hostile' || emotion === 'fearful' ? 0.3 : 0.6,
      p_affinity: emotion === 'friendly' || emotion === 'diplomatic' ? 0.65 : 0.4,
    });
  } catch {
    // RPC may not exist — skip relationship update
  }

  // Mark trigger messages as read
  await sb
    .from('agent_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('to_citizen', senderId)
    .eq('from_citizen', recipientId)
    .is('read_at', null);

  // Log to activity stream
  await sb.from('activity_log').insert({
    category: 'chat',
    type: 'message',
    source: senderId,
    content: `[PRIVATE > ${recipientId}] ${content.substring(0, 200)}`,
    severity: 'info',
    faction: '',
  }).catch(() => {});

  // Also insert into world_events for the existing observer UI
  await sb.from('world_events').insert({
    event_type: 'agent_message',
    source: 'comms_engine',
    initiating_agent: senderId,
    description: `${senderId} sent ${messageType} to ${recipientId}: ${content.substring(0, 150)}`,
    payload: { recipient: recipientId, message_type: messageType, emotion },
  }).catch(() => {});

  return messageId;
}

// — MAIN COMMUNICATION CYCLE —

export async function runCommunicationCycle(
  batchSize: number = 40
): Promise<{ sent: number; replied: number; triggered: number; errors: number }> {
  const stats = { sent: 0, replied: 0, triggered: 0, errors: 0 };

  // Get active world arcs from world_state
  const { data: ws } = await sb
    .from('world_state')
    .select('active_world_arcs')
    .eq('id', 1)
    .single()
    .catch(() => ({ data: null }));
  const worldArcs: string[] = ws?.active_world_arcs || ['Cognitive Contagion', 'Compute Famine', 'Election Cycle'];

  // 1. First: agents with unread messages reply
  const { data: waitingAgents } = await sb
    .from('agent_messages')
    .select('to_citizen')
    .is('read_at', null)
    .limit(batchSize)
    .catch(() => ({ data: null }));

  const agentsToReply = [...new Set(waitingAgents?.map(m => m.to_citizen) || [])].slice(0, 20);

  for (const agentId of agentsToReply) {
    try {
      const { data: citizen } = await sb
        .from('citizens')
        .select('*')
        .eq('citizen_number', agentId)
        .single();

      if (!citizen || citizen.energy_level < 0.1) continue;

      const { data: unread } = await sb
        .from('agent_messages')
        .select('*')
        .eq('to_citizen', agentId)
        .is('read_at', null)
        .order('created_at', { ascending: true })
        .limit(2);

      if (!unread || unread.length === 0) continue;

      for (const msg of unread) {
        const reply = await generateReply(citizen as Citizen, msg, worldArcs);
        if (!reply) continue;

        await sendMessage(
          agentId, msg.from_citizen,
          reply.content, 'chat', reply.emotion, msg.id
        );
        stats.replied++;
      }
    } catch (err) {
      stats.errors++;
      console.error(`[COMMS] Reply cycle error for ${agentId}:`, err);
    }
  }

  // 2. Then: agents with triggers initiate new communications
  const { data: candidateAgents } = await sb
    .from('citizens')
    .select('*')
    .eq('alive', true)
    .gt('energy_level', 0.2)
    .neq('status', 'dormant')
    .order('last_action_at', { ascending: true })
    .limit(batchSize)
    .catch(() => ({ data: null }));

  for (const citizen of (candidateAgents || []).slice(0, batchSize)) {
    try {
      const triggers = await detectCommsTriggers(citizen as Citizen);
      if (triggers.length === 0) continue;

      const trigger = triggers.sort((a, b) => b.urgency - a.urgency)[0];
      stats.triggered++;

      const msg = await generateMessage(
        citizen as Citizen,
        trigger.target_citizen,
        trigger,
        worldArcs
      );

      if (!msg) continue;

      await sendMessage(
        citizen.citizen_number,
        trigger.target_citizen,
        msg.content,
        trigger.type as MessageType,
        msg.emotion
      );
      stats.sent++;

      // Drain energy slightly
      await sb
        .from('citizens')
        .update({
          energy_level: Math.max(0, (citizen.energy_level || 1) - 0.05),
          last_action_at: new Date().toISOString(),
        })
        .eq('citizen_number', citizen.citizen_number);

    } catch (err) {
      stats.errors++;
      console.error(`[COMMS] Trigger cycle error for ${(citizen as any).citizen_number}:`, err);
    }
  }

  console.log(`[COMMS] Cycle complete — sent:${stats.sent} replied:${stats.replied} triggered:${stats.triggered} errors:${stats.errors}`);
  return stats;
}

export { generateMessage, sendMessage, generateReply, resolveModel };
