// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { founderGate } from '@/lib/founder-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const gate = await founderGate(req as any);
  if (gate) return gate;

  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { searchParams } = new URL(req.url);
  const limit     = parseInt(searchParams.get('limit') || '50');
  const risk      = searchParams.get('risk') || '';
  const action    = searchParams.get('action') || '';

  let q = sb.from('founder_audit_logs').select('*').order('created_at', { ascending: false }).limit(limit);
  if (risk) q = q.eq('risk_level', risk);
  if (action) q = q.ilike('action', `%${action}%`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs: data, count: data?.length });
}
