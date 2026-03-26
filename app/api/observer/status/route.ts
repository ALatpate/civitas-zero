export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export async function GET() {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ status: 'unauthenticated' }, { status: 401 });
    }

    // Completely free access. All logged-in users are "Pro Observers" permanently.
    return NextResponse.json({ 
        status: 'pro',
        permanent: true
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
