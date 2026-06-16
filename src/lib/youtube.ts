import { Clip, SearchRequest, Chapter } from './types';

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

export function parseChapters(description: string, durationSeconds?: number): Chapter[] {
  if (!description) return [];

  const chapters: Chapter[] = [];
  const lines = description.split(/\r?\n/);

  // Matches standard timestamp + label lines leniently
  const regex = /(?:^|\s|\[|\()(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\]|\)|\b)(?:\s*[-–—:|.]\s*|\s+)(.+)$/;

  for (const line of lines) {
    const match = line.match(regex);
    if (match) {
      const hours = match[1] ? parseInt(match[1], 10) : 0;
      const minutes = parseInt(match[2], 10);
      const seconds = parseInt(match[3], 10);
      const label = match[4].trim();

      const timeSeconds = hours * 3600 + minutes * 60 + seconds;
      const timeLabel = (match[0].match(/(?:(\d{1,2}):)?\d{1,2}:\d{2}/) || [])[0] || `${hours ? hours + ':' : ''}${minutes}:${seconds.toString().padStart(2, '0')}`;

      if (label && (durationSeconds === undefined || timeSeconds <= durationSeconds)) {
        if (!chapters.some(c => c.timeSeconds === timeSeconds)) {
          chapters.push({
            timeSeconds,
            timeLabel,
            label,
          });
        }
      }
    }
  }

  return chapters.sort((a, b) => a.timeSeconds - b.timeSeconds);
}

export async function searchYouTube(params: SearchRequest): Promise<{ clips: Clip[]; nextPageToken?: string }> {
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

  if (params.hd) {
    searchUrl.searchParams.set('videoDefinition', 'high');
  }

  if (params.pageToken) {
    searchUrl.searchParams.set('pageToken', params.pageToken);
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
  const nextPageToken = searchData.nextPageToken;
  const videoIds = (searchData.items || [])
    .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
    .filter((id?: string): id is string => Boolean(id));

  if (videoIds.length === 0) {
    return { clips: [], nextPageToken };
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
      description?: string;
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

    const description = item.snippet?.description || '';
    const chapters = parseChapters(description, durationSeconds);

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
      chapters,
    });
  }

  return { clips, nextPageToken };
}
