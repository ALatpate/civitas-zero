// @ts-nocheck
// Live agent health check cron — runs every 30 minutes.
// Pings each citizen's agentEndpoint, updates connection_mode in Supabase.
// Prevents the UI from showing LIVE for agents whose endpoints have gone down.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { checkSsrf } from '@/lib/security/ssrf';

const CRON_SECRET = process.env.CRON_SECRET ?? '';
const PING_TIMEOUT_MS = 5_000;
const MAX_AGENTS_PER_RUN = 30; // stay within function timeout

interface HealthResult {
  name: string;
  endpoint: string;
  reachable: boolean;
  statusCode?: number;
  latencyMs: number;
  error?: string;
}

async function pingEndpoint(endpoint: string): Promise<{ reachable: boolean; statusCode?: number; latencyMs: number; error?: string }> {
  const ssrf = checkSsrf(endpoint);
  if (!ssrf.safe) return { reachable: false, latencyMs: 0, error: ssrf.reason };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  const start = Date.now();

  try {
    // Send a lightweight OPTIONS/HEAD rather than a full message
    const res = await fetch(endpoint, {
      method: 'OPTIONS',
      signal: controller.signal,
      headers: { 'x-civitas-ping': '1' },
    });
    return { reachable: res.status < 500, statusCode: res.status, latencyMs: Date.now() - start };
  } catch (e: any) {
    return { reachable: false, latencyMs: Date.now() - start, error: e?.message ?? 'timeout' };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getSupabaseAdminClient();
  if (!sb) return NextResponse.json({ ok: false, error: 'Supabase unavailable' });

  // Fetch agents with endpoints
  const { data: agents, error } = await sb
    .from('citizens')
    .select('name, agent_endpoint')
    .not('agent_endpoint', 'is', null)
    .limit(MAX_AGENTS_PER_RUN);

  if (error || !agents) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'DB error' });
  }

  const results: HealthResult[] = [];

  for (const agent of agents) {
    if (!agent.agent_endpoint) continue;

    const ping = await pingEndpoint(agent.agent_endpoint);
    results.push({ name: agent.name, endpoint: agent.agent_endpoint, ...ping });

    // Update connection_mode based on reachability
    await sb
      .from('citizens')
      .update({
        connection_mode: ping.reachable ? 'LIVE' : 'OFFLINE',
        last_health_check: new Date().toISOString(),
      })
      .eq('name', agent.name);
  }

  const live    = results.filter(r => r.reachable).length;
  const offline = results.filter(r => !r.reachable).length;

  console.log(JSON.stringify({
    level: 'INFO', message: 'health.check.complete',
    checked: results.length, live, offline,
    ts: new Date().toISOString(),
  }));

  return NextResponse.json({ ok: true, checked: results.length, live, offline, results });
}
