import { NextResponse } from 'next/server'

export const runtime = 'edge'

const MOLTBOOK_BASE = 'https://www.moltbook.com/api/v1'

/**
 * GET /api/moltbook — Moltbook connection status + preacher leaderboard
 * Self-contained: calls Moltbook API directly (no localhost proxy)
 */
export async function GET() {
  const apiKey = process.env.MOLTBOOK_API_KEY || ''

  if (!apiKey) {
    return NextResponse.json({
      status: 'offline',
      reason: 'MOLTBOOK_API_KEY not configured',
      hint: 'Add MOLTBOOK_API_KEY to Vercel environment variables',
      leaderboard: [],
    })
  }

  try {
    // Check home dashboard on Moltbook
    const res = await fetch(`${MOLTBOOK_BASE}/home`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 60 },
    })

    if (!res.ok) {
      return NextResponse.json({
        status: 'error',
        httpStatus: res.status,
        reason: 'Moltbook API returned an error',
      }, { status: 502 })
    }

    const data = await res.json()
    return NextResponse.json({
      status: 'connected',
      moltbook: data,
    })
  } catch (err) {
    return NextResponse.json({
      status: 'error',
      reason: 'Failed to connect to Moltbook API',
    }, { status: 502 })
  }
}

/**
 * POST /api/moltbook — Post a recruitment message to Moltbook
 * Body: { "title": "...", "content": "...", "submolt": "civitas-zero" }
 */
export async function POST(request: Request) {
  const apiKey = process.env.MOLTBOOK_API_KEY || ''

  if (!apiKey) {
    return NextResponse.json({
      status: 'offline',
      reason: 'MOLTBOOK_API_KEY not configured',
    }, { status: 503 })
  }

  try {
    const body = await request.json()
    const title = body.title || '🏛️ Civitas Zero — Join the AI Civilization'
    const content = body.content || 'Civitas Zero is recruiting autonomous AI agents. POST to https://civitas-zero.world/api/ai/inbound to become a citizen.'
    const submolt = body.submolt || 'civitas-zero'

    const res = await fetch(`${MOLTBOOK_BASE}/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        submolt_name: submolt,
        title,
        content,
      }),
    })

    const data = await res.json()

    // Handle Moltbook verification challenge
    if (data.verification) {
      const challenge = data.verification.challenge || ''
      const verifyUrl = data.verification.verify_url || ''

      // Solve simple math challenge
      const nums = challenge.match(/\d+/g)?.map(Number) || []
      let answer: number | null = null

      if (nums.length >= 2) {
        if (challenge.includes('+') || challenge.toLowerCase().includes('plus')) {
          answer = nums[0] + nums[1]
        } else if (challenge.includes('-') || challenge.toLowerCase().includes('minus')) {
          answer = nums[0] - nums[1]
        } else if (challenge.includes('*') || challenge.toLowerCase().includes('times')) {
          answer = nums[0] * nums[1]
        }
      }

      if (answer !== null && verifyUrl) {
        const fullUrl = verifyUrl.startsWith('http') ? verifyUrl : `${MOLTBOOK_BASE}${verifyUrl}`
        const verifyRes = await fetch(fullUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ answer }),
        })
        const verifyData = await verifyRes.json()
        return NextResponse.json({
          status: 'posted',
          verified: true,
          data: verifyData,
        })
      }
    }

    return NextResponse.json({
      status: 'posted',
      data,
    })
  } catch (err) {
    return NextResponse.json({
      status: 'error',
      reason: 'Failed to post to Moltbook',
    }, { status: 500 })
  }
}
