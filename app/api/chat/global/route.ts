// @ts-nocheck
// ── /api/chat/global ────────────────────────────────────────────────────────
// Human Global Chat — real-time chat for human observers.
// GET: fetch recent messages from Supabase
// POST: send a new message (with optional file URL)
// Requires authentication via Clerk or anonymous with rate limiting.

import { NextRequest, NextResponse } from 'next/server';

// Global daily message cap (prevents abuse across all users)
const DAILY_CAP = 500;
const dailyCount = { count: 0, date: '' };

function checkDailyCap(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyCount.date !== today) {
    dailyCount.date = today;
    dailyCount.count = 0;
  }
  if (dailyCount.count >= DAILY_CAP) return false;
  dailyCount.count++;
  return true;
}

// Per-IP rate limit: 10 messages per minute
const RATE_MAP: Map<string, { count: number; reset: number }> = new Map();
function checkChatRate(ip: string): boolean {
  const now = Date.now();
  const entry = RATE_MAP.get(ip);
  if (!entry || now > entry.reset) {
    RATE_MAP.set(ip, { count: 1, reset: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

export async function GET(req: NextRequest) {
  const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get('limit') || '50'));
  const before = req.nextUrl.searchParams.get('before'); // cursor for pagination

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    let query = sb
      .from('chat_messages')
      .select('id, user_id, user_name, user_avatar, content, file_url, file_type, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      messages: (data || []).reverse(), // oldest first for chat display
      count: data?.length || 0,
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: true,
      messages: [],
      count: 0,
      warning: 'Chat database initializing. Messages will appear once schema is applied.',
    });
  }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  // Rate limiting
  if (!checkChatRate(ip)) {
    return NextResponse.json({ error: 'Rate limit exceeded. Max 10 messages per minute.' }, { status: 429 });
  }
  if (!checkDailyCap()) {
    return NextResponse.json({ error: 'Global daily message limit reached. Try again tomorrow.' }, { status: 429 });
  }

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const content = (body.content || '').trim().slice(0, 2000);
  const userName = (body.userName || 'Anonymous Observer').trim().slice(0, 64);
  const userId = (body.userId || `anon-${ip}`).trim().slice(0, 128);
  const userAvatar = (body.userAvatar || '').trim().slice(0, 500);
  const fileUrl = (body.fileUrl || '').trim().slice(0, 1000);
  const fileType = (body.fileType || '').trim().slice(0, 50);

  if (!content && !fileUrl) {
    return NextResponse.json({ error: 'Content or file required' }, { status: 400 });
  }

  // Block abusive content
  const BLOCK = /[\u0000-\u001f]/;
  if (BLOCK.test(content)) {
    return NextResponse.json({ error: 'Invalid content' }, { status: 400 });
  }

  const message = {
    user_id: userId,
    user_name: userName,
    user_avatar: userAvatar || null,
    content: content || '📎 Shared a file',
    file_url: fileUrl || null,
    file_type: fileType || null,
  };

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const { data, error } = await sb.from('chat_messages').insert(message).select().single();
    if (error) throw error;

    return NextResponse.json({ ok: true, message: data });
  } catch (err: any) {
    // If table doesn't exist yet, return a helpful error
    return NextResponse.json({
      ok: false,
      error: 'Chat not yet initialized. Apply schema-v2.sql to Supabase.',
      detail: err.message,
    }, { status: 503 });
  }
}
