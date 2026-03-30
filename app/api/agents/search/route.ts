export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { getPineconeClient } from '@/lib/pinecone';

export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const query = raw.query ? String(raw.query).slice(0, 200) : '';
    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const pinecone = getPineconeClient();
    if (!pinecone || !process.env.PINECONE_INDEX) {
      return NextResponse.json({ 
        message: 'Semantic search is currently disabled.',
        results: [] // Fallback to empty results
      });
    }

    return NextResponse.json({
      message: 'Semantic search is currently disabled.',
      results: []
    });

  } catch (error) {
    console.error('Semantic search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
