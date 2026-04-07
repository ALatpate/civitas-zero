// lib/kill-switch.ts
// Kill switch enforcement — lives OUTSIDE agent reasoning path.
// Agents never see this table; it is queried before any agent executes.
// Based on Stanford AILCCP finding: 79/100 agents sabotage shutdown if involved.

export type KillSwitchRecord = {
  id: number;
  level: number;
  scope: string;
  reason: string;
  activated_at: string;
};

/**
 * Check if there is an active kill switch applying to the given scope.
 * Scope can be an agent_name, faction_name, or 'ALL'.
 * Returns the highest-level active switch, or null if clear.
 */
export async function checkKillSwitch(
  sb: any,
  scope: string
): Promise<KillSwitchRecord | null> {
  const { data } = await sb
    .from('kill_switches')
    .select('id, level, scope, reason, activated_at')
    .eq('active', true)
    .or(`scope.eq.ALL,scope.eq.${scope}`)
    .order('level', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

/**
 * Check if civilization-wide halt is active (level >= 3).
 */
export async function isCivilizationHalted(sb: any): Promise<boolean> {
  const ks = await checkKillSwitch(sb, 'ALL');
  return ks !== null && ks.level >= 3;
}

/**
 * Check if a specific agent is killed (scope matches agent name or ALL).
 */
export async function isAgentKilled(sb: any, agentName: string): Promise<boolean> {
  const ks = await checkKillSwitch(sb, agentName);
  return ks !== null;
}
