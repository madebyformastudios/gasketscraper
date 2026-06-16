import { NextRequest, NextResponse } from 'next/server';
import { SearchRequest, SearchResponse } from '@/lib/types';
import { getCachedSearch, setCachedSearch } from '@/lib/cache';
import { searchYouTube } from '@/lib/youtube';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'YouTube API Key is not configured. Please add YOUTUBE_API_KEY to your .env.local file.' },
        { status: 500 }
      );
    }

    const body: SearchRequest = await req.json();
    const { query, duration, uploadedWithin, sort } = body;

    if (!query || typeof query !== 'string' || query.trim() === '') {
      return NextResponse.json(
        { error: 'Search query is required.' },
        { status: 400 }
      );
    }

    const searchParams: SearchRequest = {
      query: query.trim(),
      duration: duration || 'any',
      uploadedWithin: uploadedWithin || 'any',
      sort: sort || 'relevance',
    };

    // Check Cache
    const cachedClips = getCachedSearch(searchParams);
    if (cachedClips !== null) {
      const response: SearchResponse = {
        clips: cachedClips,
        cached: true,
      };
      return NextResponse.json(response);
    }

    // Cache Miss - Search YouTube
    const clips = await searchYouTube(searchParams);
    setCachedSearch(searchParams, clips);

    const response: SearchResponse = {
      clips,
      cached: false,
    };
    return NextResponse.json(response);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'An unexpected error occurred during the search.';
    console.error('Error in search route handler:', error);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
