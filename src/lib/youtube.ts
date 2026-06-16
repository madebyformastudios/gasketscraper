import { Clip, SearchRequest } from './types';

export function parseISO8601Duration(durationStr: string): number {
  const hoursMatch = durationStr.match(/(\d+)H/);
  const minutesMatch = durationStr.match(/(\d+)M/);
  const secondsMatch = durationStr.match(/(\d+)S/);

  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;
  const seconds = secondsMatch ? parseInt(secondsMatch[1], 10) : 0;

  return hours * 3600 + minutes * 60 + seconds;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export async function searchYouTube(params: SearchRequest): Promise<Clip[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY is not defined in the environment variables.');
  }

  // 1. Map parameters to search.list API parameters
  const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
  searchUrl.searchParams.set('part', 'snippet');
  searchUrl.searchParams.set('type', 'video');
  searchUrl.searchParams.set('q', params.query);
  searchUrl.searchParams.set('maxResults', '25');
  searchUrl.searchParams.set('key', apiKey);

  if (params.duration && params.duration !== 'any') {
    searchUrl.searchParams.set('videoDuration', params.duration);
  }

  if (params.uploadedWithin && params.uploadedWithin !== 'any') {
    const date = new Date();
    if (params.uploadedWithin === 'month') {
      date.setDate(date.getDate() - 30);
    } else if (params.uploadedWithin === 'year') {
      date.setDate(date.getDate() - 365);
    }
    searchUrl.searchParams.set('publishedAfter', date.toISOString());
  }

  if (params.sort) {
    if (params.sort === 'views') {
      searchUrl.searchParams.set('order', 'viewCount');
    } else {
      searchUrl.searchParams.set('order', params.sort);
    }
  }

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    const errorText = await searchRes.text();
    let errorJson;
    try {
      errorJson = JSON.parse(errorText);
    } catch {
      // Ignored
    }
    const apiErrorMessage = errorJson?.error?.message || `YouTube API search returned status ${searchRes.status}`;
    throw new Error(apiErrorMessage);
  }

  const searchData = await searchRes.json();
  const videoIds = (searchData.items || [])
    .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
    .filter((id?: string): id is string => Boolean(id));

  if (videoIds.length === 0) {
    return [];
  }

  // 2. Map videoIds to videos.list API request to enrich results
  const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
  videosUrl.searchParams.set('part', 'contentDetails,statistics,snippet');
  videosUrl.searchParams.set('id', videoIds.join(','));
  videosUrl.searchParams.set('key', apiKey);

  const videosRes = await fetch(videosUrl.toString());
  if (!videosRes.ok) {
    const errorText = await videosRes.text();
    let errorJson;
    try {
      errorJson = JSON.parse(errorText);
    } catch {
      // Ignored
    }
    const apiErrorMessage = errorJson?.error?.message || `YouTube API videos returned status ${videosRes.status}`;
    throw new Error(apiErrorMessage);
  }

  interface YouTubeVideoItem {
    id: string;
    snippet?: {
      title?: string;
      channelTitle?: string;
      publishedAt?: string;
      thumbnails?: {
        medium?: { url: string };
        high?: { url: string };
        standard?: { url: string };
        default?: { url: string };
      };
    };
    contentDetails?: {
      duration?: string;
    };
    statistics?: {
      viewCount?: string;
    };
  }

  const videosData = await videosRes.json();
  const detailsMap = new Map<string, YouTubeVideoItem>();
  for (const item of (videosData.items || []) as YouTubeVideoItem[]) {
    detailsMap.set(item.id, item);
  }

  const clips: Clip[] = [];
  for (const id of videoIds) {
    const item = detailsMap.get(id);
    if (!item) continue;

    const durationStr = item.contentDetails?.duration || 'PT0S';
    const durationSeconds = parseISO8601Duration(durationStr);
    const viewCount = parseInt(item.statistics?.viewCount || '0', 10);

    // Get higher quality thumbnail if possible
    const thumbnails = item.snippet?.thumbnails || {};
    const thumbnailUrl =
      thumbnails.medium?.url ||
      thumbnails.high?.url ||
      thumbnails.standard?.url ||
      thumbnails.default?.url ||
      '';

    clips.push({
      videoId: id,
      title: item.snippet?.title || '',
      channelTitle: item.snippet?.channelTitle || '',
      thumbnailUrl,
      publishedAt: item.snippet?.publishedAt || '',
      durationSeconds,
      durationLabel: formatDuration(durationSeconds),
      viewCount,
      url: `https://www.youtube.com/watch?v=${id}`,
    });
  }

  return clips;
}
