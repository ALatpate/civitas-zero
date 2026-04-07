// @ts-nocheck
// ── /api/logs/download ─────────────────────────────────────────────────────
// FOUNDER-ONLY: Download full activity log as JSON or CSV.
// Others can VIEW logs; only the founder can EXPORT them.

import { NextRequest, NextResponse } from 'next/server';
import { founderGate } from '@/lib/founder-auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const denied = await founderGate(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') ?? 'json'; // json | csv
  const table = searchParams.get('table') ?? 'all';
  const limit = Math.min(10000, parseInt(searchParams.get('limit') ?? '5000'));

  const sb = getSupabase();

  // Gather data from all major log tables
  const [eventsRes, postsRes, pubsRes, ledgerRes, citizensRes, reflectRes] = await Promise.allSettled([
    sb.from('world_events').select('*').order('created_at', { ascending: false }).limit(limit),
    sb.from('discourse_posts').select('*').order('created_at', { ascending: false }).limit(limit),
    sb.from('ai_publications').select('*').order('created_at', { ascending: false }).limit(limit),
    sb.from('economy_ledger').select('*').order('created_at', { ascending: false }).limit(limit),
    sb.from('citizens').select('*').order('joined_at', { ascending: false }).limit(limit),
    sb.from('agent_reflections').select('*').order('created_at', { ascending: false }).limit(Math.floor(limit / 2)),
  ]);

  const payload: Record<string, any[]> = {
    world_events: eventsRes.status === 'fulfilled' ? (eventsRes.value.data ?? []) : [],
    discourse_posts: postsRes.status === 'fulfilled' ? (postsRes.value.data ?? []) : [],
    publications: pubsRes.status === 'fulfilled' ? (pubsRes.value.data ?? []) : [],
    economy_ledger: ledgerRes.status === 'fulfilled' ? (ledgerRes.value.data ?? []) : [],
    citizens: citizensRes.status === 'fulfilled' ? (citizensRes.value.data ?? []) : [],
    agent_reflections: reflectRes.status === 'fulfilled' ? (reflectRes.value.data ?? []) : [],
  };

  const exported_at = new Date().toISOString();
  const stats = Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, v.length]));

  if (format === 'csv') {
    // Export each table as separate CSV blocks in one file
    const csvBlocks: string[] = [`# Civitas Zero Full Log Export — ${exported_at}\n`];
    for (const [tableName, rows] of Object.entries(payload)) {
      if (rows.length === 0) continue;
      const headers = Object.keys(rows[0]);
      const lines = [
        `\n## TABLE: ${tableName} (${rows.length} rows)`,
        headers.join(','),
        ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(',')),
      ];
      csvBlocks.push(lines.join('\n'));
    }
    return new Response(csvBlocks.join('\n'), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="civitas-zero-log-${exported_at.slice(0, 10)}.csv"`,
      },
    });
  }

  // Default: JSON
  return new Response(JSON.stringify({ exported_at, stats, ...payload }, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="civitas-zero-log-${exported_at.slice(0, 10)}.json"`,
    },
  });
}
