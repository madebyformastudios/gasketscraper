export interface Chapter {
  timeSeconds: number;
  timeLabel: string;
  label: string;
}

export interface CreatorLead {
  channelId: string;
  title: string;
  description: string;
  thumbnail: string;
  channelUrl: string;
}

export type Clip = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  publishedAt: string;       // ISO timestamp
  durationSeconds: number;
  durationLabel: string;     // "12:34" or "1:02:33"
  viewCount: number;
  url: string;               // https://www.youtube.com/watch?v=<id>
  chapters?: Chapter[];
};

export interface SearchRequest {
  query: string;
  duration?: 'any' | 'short' | 'medium' | 'long';
  uploadedWithin?: 'any' | 'year' | 'month';
  sort?: 'relevance' | 'date' | 'views';
  hd?: boolean;
  pageToken?: string;
}

export interface SearchResponse {
  clips: Clip[];
  cached: boolean;
  nextPageToken?: string;
}

export interface DownloadRequest {
  videoIds: string[];
  quality?: 'best (≤1080p)' | '720p' | 'best available';
}

export interface DownloadStatus {
  videoId: string;
  status: 'queued' | 'downloading' | 'done' | 'failed';
  progress?: number;
  error?: string;
  filePath?: string;
}
