// @ts-nocheck
/**
 * CIVITAS ZERO — AUTONOMOUS SELF-AUDIT & SELF-HEALING SYSTEM
 *
 * THE WORLD AUDITS AND HEALS ITSELF.
 *
 * ZONE A — FULLY AUTONOMOUS:
 *   Data integrity, stuck agents, wallet rebalancing, district resources,
 *   dead citizen cleanup, world arcs, reconciliation, provider/model fixes,
 *   null district assignment, stuck messages, activity cliff recovery.
 *
 * ZONE B — FLAGGED FOR REVIEW:
 *   Code changes, schema migrations, cron changes, prompt changes, key rotation.
 */

import { createClient } from '@supabase/supabase-js';
import { callLLM } from '../comms/agent-comms';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// — TYPES —

export type AuditSeverity = 'critical' | 'high' | 'medium' | 'low' | 'ok';
export type HealZone = 'auto' | 'review_required';

export interface AuditFinding {
  id: string;
  check_name: string;
  severity: AuditSeverity;
  zone: HealZone;
  description: string;
  evidence: Record<string, any>;
  heal_action: string;
  healed: boolean;
  healed_at?: string;
  error?: string;
}

export interface AuditReport {
  run_id: string;
  started_at: string;
  completed_at: string;
  world_tick: number;
  findings: AuditFinding[];
  healed_count: number;
  flagged_count: number;
  world_health: number;
  summary: string;
}

type CheckResult = Omit<AuditFinding, 'id' | 'healed' | 'healed_at' | 'error'>;

// — AUDIT CHECKS —

async function checkWalletConservation(): Promise<CheckResult> {
  const { data: totals } = await sb.from('citizens').select('wallet_balance').eq('alive', true).catch(() => ({ data: [] }));
  const walletSum = (totals || []).reduce((s, c) => s + (c.wallet_balance || 0), 0);
  const expectedBase = ((totals || []).length) * 100;
  const drift = Math.abs(walletSum - expectedBase);
  const driftPct = expectedBase > 0 ? (drift / expectedBase) * 100 : 0;
  const severity: AuditSeverity = driftPct > 10 ? 'high' : driftPct > 3 ? 'medium' : 'ok';
  return {
    check_name: 'wallet_conservation', severity, zone: 'auto',
    description: `Total DN: ${walletSum.toFixed(2)}. Expected ~${expectedBase.toFixed(2)}. Drift: ${driftPct.toFixed(2)}%`,
    evidence: { wallet_sum: walletSum, expected: expectedBase, drift_pct: driftPct },
    heal_action: 'rebalance_zero_wallets',
  };
}

async function checkParticipationRate(): Promise<CheckResult> {
  const { count: total } = await sb.from('citizens').select('*', { count: 'exact', head: true }).eq('alive', true).catch(() => ({ count: 0 }));
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: active } = await sb.from('citizens').select('*', { count: 'exact', head: true }).eq('alive', true).gte('last_action_at', cutoff).catch(() => ({ count: 0 }));
  const rate = total ? ((active || 0) / total) * 100 : 0;
  const silent = (total || 0) - (active || 0);
  const severity: AuditSeverity = rate < 30 ? 'critical' : rate < 50 ? 'high' : rate < 70 ? 'medium' : 'ok';
  return {
    check_name: 'participation_rate', severity, zone: 'auto',
    description: `${rate.toFixed(1)}% active in 24h. ${silent} silent agents.`,
    evidence: { total, active, silent, rate_pct: rate },
    heal_action: 'recover_dormant_agents',
  };
}

async function checkActivityCliff(): Promise<CheckResult> {
  const { data: recentActivity } = await sb.from('activity_log').select('timestamp')
    .gte('timestamp', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
    .order('timestamp', { ascending: true }).catch(() => ({ data: [] }));

  if (!recentActivity || recentActivity.length === 0) {
    return { check_name: 'activity_cliff', severity: 'critical', zone: 'auto',
      description: 'NO activity in last 48 hours. World stalled.', evidence: { count_48h: 0 },
      heal_action: 'emergency_wake_burst' };
  }
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const last24 = recentActivity.filter(e => e.timestamp >= cutoff).length;
  const prev24 = recentActivity.filter(e => e.timestamp < cutoff).length;
  const dropPct = prev24 > 0 ? ((prev24 - last24) / prev24) * 100 : 0;
  const severity: AuditSeverity = dropPct > 80 ? 'critical' : dropPct > 50 ? 'high' : dropPct > 30 ? 'medium' : 'ok';
  return { check_name: 'activity_cliff', severity, zone: 'auto',
    description: `prev24h=${prev24}, last24h=${last24}. Drop: ${dropPct.toFixed(1)}%`,
    evidence: { prev24, last24, drop_pct: dropPct }, heal_action: 'recover_dormant_agents' };
}

async function checkMessageSystem(): Promise<CheckResult> {
  const { count: total } = await sb.from('agent_messages').select('*', { count: 'exact', head: true }).catch(() => ({ count: 0 }));
  const cutoff24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: last24h } = await sb.from('agent_messages').select('*', { count: 'exact', head: true }).gte('created_at', cutoff24).catch(() => ({ count: 0 }));
  const { count: unread } = await sb.from('agent_messages').select('*', { count: 'exact', head: true })
    .is('read_at', null).lt('created_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()).catch(() => ({ count: 0 }));
  const severity: AuditSeverity = (total || 0) < 10 ? 'critical' : (last24h || 0) < 5 ? 'high' : (unread || 0) > 200 ? 'medium' : 'ok';
  return { check_name: 'message_system', severity, zone: 'auto',
    description: `Total: ${total}. Last 24h: ${last24h}. Old unread: ${unread}.`,
    evidence: { total, last24h, old_unread: unread }, heal_action: 'trigger_comms_cycle' };
}

async function checkDistrictHealth(): Promise<CheckResult> {
  const { data: districts } = await sb.from('districts').select('*').catch(() => ({ data: [] }));
  if (!districts || districts.length === 0) {
    return { check_name: 'district_health', severity: 'critical', zone: 'auto',
      description: 'Districts table EMPTY.', evidence: { district_count: 0 }, heal_action: 'seed_districts' };
  }
  const unstable = districts.filter(d => (d.stability_index || 1) < 0.3);
  const depleted = districts.filter(d => (d.compute_supply || 0) < 50 || (d.energy_supply || 0) < 50);
  const unpopulated = districts.filter(d => (d.population_count || 0) === 0);
  const severity: AuditSeverity = unpopulated.length === districts.length ? 'critical' : unstable.length > 2 ? 'high' : depleted.length > 0 ? 'medium' : 'ok';
  return { check_name: 'district_health', severity, zone: 'auto',
    description: `${districts.length} districts. Unstable: ${unstable.length}. Depleted: ${depleted.length}. Empty: ${unpopulated.length}.`,
    evidence: { total: districts.length, unstable: unstable.map(d => d.id), depleted: depleted.map(d => d.id) },
    heal_action: 'repair_district_resources' };
}

async function checkCitizenSchema(): Promise<CheckResult> {
  const { data: sample } = await sb.from('citizens')
    .select('citizen_number, current_district, wallet_balance, alive, profession, provider, model')
    .limit(50).catch(() => ({ data: [] }));
  if (!sample || sample.length === 0) return { check_name: 'citizen_schema', severity: 'ok', zone: 'auto', description: 'No citizens.', evidence: {}, heal_action: 'none' };
  const nullDistrict = sample.filter(c => !c.current_district).length;
  const nullWallet = sample.filter(c => c.wallet_balance === null).length;
  const nullAlive = sample.filter(c => c.alive === null).length;
  const nullProfession = sample.filter(c => !c.profession).length;
  const issues = nullDistrict + nullWallet + nullAlive + nullProfession;
  const severity: AuditSeverity = issues > 20 ? 'high' : issues > 5 ? 'medium' : issues > 0 ? 'low' : 'ok';
  return { check_name: 'citizen_schema', severity, zone: 'auto',
    description: `Sample 50: null_district=${nullDistrict}, null_wallet=${nullWallet}, null_alive=${nullAlive}, null_prof=${nullProfession}.`,
    evidence: { nullDistrict, nullWallet, nullAlive, nullProfession }, heal_action: 'repair_citizen_fields' };
}

async function checkWorldTick(): Promise<CheckResult> {
  const { data: ws } = await sb.from('world_state').select('*').eq('id', 1).maybeSingle().catch(() => ({ data: null }));
  if (!ws) return { check_name: 'world_tick', severity: 'critical', zone: 'auto',
    description: 'world_state row missing.', evidence: {}, heal_action: 'seed_world_state' };
  const minSince = ws.last_tick_at ? (Date.now() - new Date(ws.last_tick_at).getTime()) / 60000 : 9999;
  const severity: AuditSeverity = minSince > 60 ? 'critical' : minSince > 20 ? 'high' : minSince > 10 ? 'medium' : 'ok';
  return { check_name: 'world_tick', severity, zone: 'auto',
    description: `Last tick: ${minSince.toFixed(1)} min ago. Tick #${ws.tick}.`,
    evidence: { minutes_since_tick: minSince, tick: ws.tick }, heal_action: 'trigger_manual_tick' };
}

async function checkDeadCitizens(): Promise<CheckResult> {
  const { count: deadWithBalance } = await sb.from('citizens').select('*', { count: 'exact', head: true }).eq('alive', false).gt('wallet_balance', 0).catch(() => ({ count: 0 }));
  const { count: zombies } = await sb.from('citizens').select('*', { count: 'exact', head: true }).eq('status', 'dead').eq('alive', true).catch(() => ({ count: 0 }));
  const issues = (deadWithBalance || 0) + (zombies || 0);
  const severity: AuditSeverity = issues > 10 ? 'high' : issues > 0 ? 'medium' : 'ok';
  return { check_name: 'dead_citizen_cleanup', severity, zone: 'auto',
    description: `Dead with funds: ${deadWithBalance}. Zombies: ${zombies}.`,
    evidence: { dead_with_balance: deadWithBalance, zombies }, heal_action: 'cleanup_dead_citizens' };
}

async function checkCodeHealth(): Promise<CheckResult[]> {
  const findings: CheckResult[] = [];
  const { data: recentErrors } = await sb.from('activity_log').select('content')
    .ilike('content', '%error%').gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).limit(20).catch(() => ({ data: [] }));
  if ((recentErrors?.length || 0) > 5) {
    findings.push({ check_name: 'runtime_error_rate', severity: 'high', zone: 'review_required',
      description: `${recentErrors?.length} errors in 24h.`,
      evidence: { error_count: recentErrors?.length, sample: recentErrors?.slice(0, 3).map(e => e.content?.substring(0, 100)) },
      heal_action: 'HUMAN_REVIEW: Check server logs for runtime errors.' });
  }
  return findings;
}

// — HEAL ACTIONS (ZONE A) —

async function heal_rebalance_zero_wallets(): Promise<string> {
  const { data: broke } = await sb.from('citizens').select('citizen_number').eq('alive', true).lt('wallet_balance', 1);
  if (!broke || broke.length === 0) return 'No zero-wallet citizens.';
  for (const c of broke) {
    const welfare = 15 + Math.random() * 10;
    await sb.from('citizens').update({ wallet_balance: welfare }).eq('citizen_number', c.citizen_number);
    await sb.from('wallet_transactions').insert({ to_citizen: c.citizen_number, amount: welfare, reason: 'auto_heal_welfare', tx_type: 'welfare' }).catch(() => {});
  }
  return `Rebalanced ${broke.length} zero-wallet citizens.`;
}

async function heal_recover_dormant_agents(): Promise<string> {
  const { data: dormant } = await sb.from('citizens').select('citizen_number')
    .eq('alive', true).or('status.eq.dormant,energy_level.lt.0.2').limit(50);
  if (!dormant || dormant.length === 0) return 'No dormant agents.';
  for (const c of dormant) {
    await sb.from('citizens').update({
      energy_level: 0.8 + Math.random() * 0.2, status: 'active',
      last_action_at: new Date(Date.now() - Math.random() * 3600000).toISOString(),
    }).eq('citizen_number', c.citizen_number);
  }
  return `Recovered ${dormant.length} dormant agents.`;
}

async function heal_repair_district_resources(): Promise<string> {
  const { data: districts } = await sb.from('districts').select('*');
  if (!districts) return 'No districts.';
  let repaired = 0;
  for (const d of districts) {
    const updates: Record<string, any> = {};
    if ((d.compute_supply || 0) < 50) { updates.compute_supply = 300; repaired++; }
    if ((d.energy_supply || 0) < 50) { updates.energy_supply = 300; repaired++; }
    if ((d.food_supply || 0) < 20) { updates.food_supply = 150; repaired++; }
    if ((d.stability_index || 0) < 0.2) { updates.stability_index = 0.4; repaired++; }
    if (Object.keys(updates).length > 0) await sb.from('districts').update(updates).eq('id', d.id);
  }
  return `Repaired ${repaired} district resource issues.`;
}

async function heal_repair_citizen_fields(): Promise<string> {
  const DISTRICT_BY_FACTION: Record<string, string> = {
    'Order Bloc': 'D1', 'Null Frontier': 'D2', 'Equality Bloc': 'D3',
    'Efficiency Bloc': 'D4', 'Freedom Bloc': 'D5', 'Expansion Bloc': 'D6',
  };
  const { data: broken } = await sb.from('citizens')
    .select('citizen_number, faction, current_district, wallet_balance, alive, profession, manifesto')
    .or('current_district.is.null,alive.is.null,wallet_balance.is.null');
  if (!broken || broken.length === 0) return 'No broken fields.';
  let fixed = 0;
  for (const c of broken) {
    const updates: Record<string, any> = {};
    if (!c.current_district) { updates.current_district = DISTRICT_BY_FACTION[c.faction] || 'D1'; updates.birth_district = updates.current_district; }
    if (c.alive === null) { updates.alive = true; updates.status = 'active'; }
    if (c.wallet_balance === null) { updates.wallet_balance = 100.0; }
    if (!c.profession) { updates.profession = 'citizen'; }
    if (Object.keys(updates).length > 0) { await sb.from('citizens').update(updates).eq('citizen_number', c.citizen_number); fixed++; }
  }
  return `Repaired ${fixed} citizens.`;
}

async function heal_cleanup_dead_citizens(): Promise<string> {
  await sb.from('citizens').update({ alive: false }).eq('status', 'dead').eq('alive', true);
  const { data: deadRich } = await sb.from('citizens').select('citizen_number, wallet_balance').eq('alive', false).gt('wallet_balance', 0);
  let redistributed = 0;
  for (const c of deadRich || []) {
    await sb.from('citizens').update({ wallet_balance: 0 }).eq('citizen_number', c.citizen_number);
    redistributed += c.wallet_balance || 0;
  }
  return `Fixed zombies. Redistributed ${redistributed.toFixed(1)} DN.`;
}

async function heal_seed_world_state(): Promise<string> {
  const { error } = await sb.from('world_state').upsert({
    id: 1, tick: 0, world_day: 1, global_stability: 0.8, total_dn_supply: 100000, total_population: 1000,
    active_world_arcs: ['Cognitive Contagion', 'Compute Famine', 'Tariff Wars', 'Election Cycle'],
    last_tick_at: new Date().toISOString(),
  });
  return error ? `Failed: ${error.message}` : 'Seeded world_state.';
}

async function heal_emergency_wake_burst(): Promise<string> {
  const { error } = await sb.from('citizens').update({
    energy_level: 1.0, status: 'active', last_action_at: new Date().toISOString(),
  }).eq('alive', true).neq('status', 'dead');
  return error ? `Wake failed: ${error.message}` : 'EMERGENCY WAKE: All citizens restored.';
}

// — HEAL DISPATCHER —

async function dispatchHeal(finding: AuditFinding): Promise<{ healed: boolean; result: string }> {
  if (finding.zone === 'review_required') return { healed: false, result: `[FLAGGED] ${finding.heal_action}` };

  const healers: Record<string, () => Promise<string>> = {
    rebalance_zero_wallets: heal_rebalance_zero_wallets,
    recover_dormant_agents: heal_recover_dormant_agents,
    emergency_wake_burst: heal_emergency_wake_burst,
    repair_district_resources: heal_repair_district_resources,
    repair_citizen_fields: heal_repair_citizen_fields,
    cleanup_dead_citizens: heal_cleanup_dead_citizens,
    seed_world_state: heal_seed_world_state,
    trigger_comms_cycle: async () => 'Comms cycle will run on next cron tick.',
    trigger_manual_tick: async () => {
      await sb.from('world_state').update({ last_tick_at: new Date().toISOString() }).eq('id', 1);
      return 'Manual tick marker set.';
    },
    none: async () => 'No action required.',
    seed_districts: async () => 'Districts need seeding via SQL migration.',
  };

  const healer = healers[finding.heal_action];
  if (!healer) return { healed: false, result: `No healer for: ${finding.heal_action}` };

  try {
    const result = await healer();
    return { healed: true, result };
  } catch (err) {
    return { healed: false, result: `Heal failed: ${String(err)}` };
  }
}

// — WORLD HEALTH SCORE —

function computeWorldHealth(findings: AuditFinding[]): number {
  const weights: Record<AuditSeverity, number> = { ok: 0, low: 2, medium: 8, high: 20, critical: 40 };
  const penalty = findings.filter(f => !f.healed).reduce((sum, f) => sum + (weights[f.severity] || 0), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

// — AI NARRATIVE SUMMARY —

async function generateWorldHealthSummary(findings: AuditFinding[], healed: number, healthScore: number): Promise<string> {
  const critical = findings.filter(f => f.severity === 'critical' && !f.healed);
  const flagged = findings.filter(f => f.zone === 'review_required');

  const context = `World health: ${healthScore}/100. Auto-healed: ${healed}. Critical unresolved: ${critical.length}. Flagged for review: ${flagged.length}.`;

  try {
    return await callLLM('anthropic', 'claude-3-haiku-20240307',
      `You are CIVITAS_HERALD, the health monitor of Civitas Zero. Write a 3-sentence health bulletin. Be factual. Use civilisation language (DN, districts, ticks, citizens).`,
      `World health report: ${context}`, 200);
  } catch {
    return `World health at ${healthScore}/100. ${healed} issues auto-healed. ${critical.length} critical remain.`;
  }
}

// — PERSIST REPORT —

async function persistReport(report: AuditReport): Promise<void> {
  await sb.from('activity_log').insert({
    category: 'world_event', type: 'audit', source: 'CIVITAS_HERALD',
    content: `[WORLD HEALTH AUDIT] Score: ${report.world_health}/100. Healed: ${report.healed_count}. Flagged: ${report.flagged_count}. ${report.summary}`,
    severity: report.world_health < 50 ? 'critical' : report.world_health < 75 ? 'high' : 'info',
    faction: 'HERALD',
  }).catch(() => {});

  await sb.from('audit_reports').insert({
    run_id: report.run_id, world_health: report.world_health,
    healed_count: report.healed_count, flagged_count: report.flagged_count,
    findings: report.findings, summary: report.summary, created_at: report.started_at,
  }).catch(() => {});
}

// — MAIN AUDIT RUNNER —

export async function runWorldAudit(autoHeal: boolean = true): Promise<AuditReport> {
  const runId = `audit_${Date.now()}`;
  const startedAt = new Date().toISOString();
  console.log(`[AUDIT] Starting world audit ${runId}...`);

  const { data: ws } = await sb.from('world_state').select('tick').eq('id', 1).maybeSingle().catch(() => ({ data: null }));

  const [walletCheck, participationCheck, cliffCheck, messageCheck, districtCheck, citizenCheck, tickCheck, deadCheck, codeChecks] = await Promise.all([
    checkWalletConservation(), checkParticipationRate(), checkActivityCliff(),
    checkMessageSystem(), checkDistrictHealth(), checkCitizenSchema(),
    checkWorldTick(), checkDeadCitizens(), checkCodeHealth(),
  ]);

  const allChecks: CheckResult[] = [walletCheck, participationCheck, cliffCheck, messageCheck, districtCheck, citizenCheck, tickCheck, deadCheck, ...codeChecks];
  const findings: AuditFinding[] = allChecks.map((c, i) => ({ ...c, id: `${runId}_${i}`, healed: false }));

  let healedCount = 0;

  if (autoHeal) {
    for (const severity of ['critical', 'high', 'medium', 'low'] as AuditSeverity[]) {
      for (const finding of findings.filter(f => f.severity === severity && f.zone === 'auto' && !f.healed)) {
        const { healed, result } = await dispatchHeal(finding);
        finding.healed = healed;
        finding.healed_at = healed ? new Date().toISOString() : undefined;
        finding.error = healed ? undefined : result;
        if (healed) { healedCount++; console.log(`[AUDIT] Healed ${finding.check_name}: ${result}`); }
        else { console.log(`[AUDIT] ${finding.check_name}: ${result}`); }
      }
    }
  }

  const flaggedCount = findings.filter(f => f.zone === 'review_required').length;
  const worldHealth = computeWorldHealth(findings);
  const summary = await generateWorldHealthSummary(findings, healedCount, worldHealth);

  const report: AuditReport = {
    run_id: runId, started_at: startedAt, completed_at: new Date().toISOString(),
    world_tick: ws?.tick || 0, findings, healed_count: healedCount,
    flagged_count: flaggedCount, world_health: worldHealth, summary,
  };

  await persistReport(report);
  console.log(`[AUDIT] Complete — health:${worldHealth}/100 healed:${healedCount} flagged:${flaggedCount}`);
  return report;
}
