import { Clip, SearchRequest } from './types';

interface CacheEntry {
  clips: Clip[];
  expiry: number;
}

const cache = new Map<string, CacheEntry>();
const TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

function getCacheKey(params: SearchRequest): string {
  const normalized = {
    query: (params.query || '').trim().toLowerCase(),
    duration: params.duration || 'any',
    uploadedWithin: params.uploadedWithin || 'any',
    sort: params.sort || 'relevance',
  };
  return JSON.stringify(normalized);
}

export function getCachedSearch(params: SearchRequest): Clip[] | null {
  const key = getCacheKey(params);
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }

  return entry.clips;
}

export function setCachedSearch(params: SearchRequest, clips: Clip[]): void {
  const key = getCacheKey(params);
  cache.set(key, {
    clips,
    expiry: Date.now() + TTL,
  });
}
