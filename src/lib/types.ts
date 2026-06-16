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
};

export interface SearchRequest {
  query: string;
  duration?: 'any' | 'short' | 'medium' | 'long';
  uploadedWithin?: 'any' | 'year' | 'month';
  sort?: 'relevance' | 'date' | 'views';
}

export interface SearchResponse {
  clips: Clip[];
  cached: boolean;
}

export interface DownloadRequest {
  videoIds: string[];
}

export interface DownloadStatus {
  videoId: string;
  status: 'queued' | 'downloading' | 'done' | 'failed';
  progress?: number;
  error?: string;
  filePath?: string;
}
