import { NextRequest, NextResponse } from 'next/server';
import { getCachedSuggestion, setCachedSuggestion } from '@/lib/cache';
import { CreatorLead } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'YouTube API Key is not configured. Please add YOUTUBE_API_KEY to your .env.local file.' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { model } = body;

    if (!model || typeof model !== 'string' || model.trim() === '') {
      return NextResponse.json(
        { error: 'Car model parameter is required.' },
        { status: 400 }
      );
    }

    const normalizedModel = model.trim();

    // Check disk cache first
    const cachedCreators = getCachedSuggestion(normalizedModel, 'creators');
    if (cachedCreators !== null) {
      return NextResponse.json({
        creators: cachedCreators,
        cached: true,
      });
    }

    // Call YouTube search API for channels
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('type', 'channel');
    searchUrl.searchParams.set('q', normalizedModel);
    searchUrl.searchParams.set('maxResults', '5');
    searchUrl.searchParams.set('key', apiKey);

    const response = await fetch(searchUrl.toString());
    if (!response.ok) {
      const errorText = await response.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        // Ignored
      }
      const apiErrorMessage = errorJson?.error?.message || `YouTube API channels search returned status ${response.status}`;
      return NextResponse.json(
        { error: apiErrorMessage },
        { status: response.status }
      );
    }

    interface YouTubeChannelItem {
      id?: {
        channelId?: string;
      };
      snippet?: {
        title?: string;
        description?: string;
        thumbnails?: {
          default?: { url?: string };
          medium?: { url?: string };
        };
      };
    }

    const data = await response.json();
    const creators: CreatorLead[] = (data.items || []).map((item: YouTubeChannelItem) => {
      const channelId = item.id?.channelId || '';
      const snippet = item.snippet || {};
      return {
        channelId,
        title: snippet.title || '',
        description: snippet.description || '',
        thumbnail: snippet.thumbnails?.default?.url || snippet.thumbnails?.medium?.url || '',
        channelUrl: `https://www.youtube.com/channel/${channelId}`,
      };
    }).filter((c: CreatorLead) => c.channelId);

    // Save to disk cache
    setCachedSuggestion(normalizedModel, 'creators', creators);

    return NextResponse.json({
      creators,
      cached: false,
    });

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'An unexpected error occurred during creator discovery.';
    console.error('Error in creators route:', error);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
