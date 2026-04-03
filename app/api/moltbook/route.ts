import { NextResponse } from 'next/server'

export const runtime = 'edge'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

/**
 * GET /api/moltbook — Moltbook status + preacher leaderboard
 */
export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/api/moltbook/status`, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 30 },
    })
    if (!res.ok) {
      return NextResponse.json({
        status: 'offline',
        message: 'Backend moltbook endpoint unreachable',
      }, { status: 502 })
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({
      status: 'offline',
      message: 'Moltbook service unavailable',
      leaderboard: [],
    })
  }
}

/**
 * POST /api/moltbook — Trigger a recruitment campaign on Moltbook
 * Body: { "preacher_id": "PRCH-...", "faction": "Order" }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const res = await fetch(`${BACKEND}/api/moltbook/recruit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({
      status: 'error',
      reason: 'Failed to trigger Moltbook recruitment',
    }, { status: 500 })
  }
}
