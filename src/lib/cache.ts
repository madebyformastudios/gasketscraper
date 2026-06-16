import fs from 'fs';
import path from 'path';
import { Clip, SearchRequest } from './types';

interface CacheEntry {
  clips: Clip[];
  nextPageToken?: string;
  fetchedAt: number; // timestamp in ms
}

const CACHE_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'search-cache.json');

// TTL in milliseconds (default 7 days = 168 hours)
const TTL_HOURS = parseInt(process.env.CACHE_TTL_HOURS || '168', 10);
const TTL_MS = TTL_HOURS * 60 * 60 * 1000;

// Read the database cache from file
function readCacheFile(): Record<string, CacheEntry> {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(CACHE_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Error reading persistent search cache:', error);
  }
  return {};
}

// Write the database cache to file
function writeCacheFile(data: Record<string, CacheEntry>): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing persistent search cache:', error);
  }
}

// Key format affects only API parameters
function getCacheKey(params: SearchRequest): string {
  const normalized = {
    query: (params.query || '').trim().toLowerCase(),
    hd: params.hd || false,
    duration: params.duration || 'any',
    uploadedWithin: params.uploadedWithin || 'any',
    sort: params.sort || 'relevance',
    pageToken: params.pageToken || '',
  };
  return JSON.stringify(normalized);
}

export function getCachedSearch(params: SearchRequest): { clips: Clip[]; nextPageToken?: string } | null {
  const data = readCacheFile();
  const key = getCacheKey(params);
  const entry = data[key];

  if (!entry) {
    return null;
  }

  // Check TTL expiry
  if (Date.now() - entry.fetchedAt > TTL_MS) {
    delete data[key];
    writeCacheFile(data);
    return null;
  }

  return {
    clips: entry.clips,
    nextPageToken: entry.nextPageToken,
  };
}

export function setCachedSearch(params: SearchRequest, clips: Clip[], nextPageToken?: string): void {
  const data = readCacheFile();
  const key = getCacheKey(params);
  data[key] = {
    clips,
    nextPageToken,
    fetchedAt: Date.now(),
  };
  writeCacheFile(data);
}
