'use client';

import React, { useState, useEffect } from 'react';
import {
  Search,
  Copy,
  Check,
  Download,
  ExternalLink,
  Loader2,
  AlertCircle,
  FileVideo2,
  Trash2,
  History,
  Tv,
  FolderOpen,
  X,
  Play,
  Star,
  Info,
  Sparkles,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Clip, SearchResponse, DownloadStatus, CreatorLead } from '@/lib/types';

const SEARCH_CHIPS = ['4K', 'POV', 'walkaround', 'review', 'driving', 'exhaust', 'interior'];

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export default function ClipFinder() {
  // Search state
  const [query, setQuery] = useState('');
  const [duration, setDuration] = useState<'any' | 'short' | 'medium' | 'long'>('any');
  const [uploadedWithin, setUploadedWithin] = useState<'any' | 'year' | 'month'>('any');
  const [sort, setSort] = useState<'relevance' | 'date' | 'views'>('relevance');
  const [hdOnly, setHdOnly] = useState(false);
  const [activeChips, setActiveChips] = useState<string[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);

  // Request & results state
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [isCached, setIsCached] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Client-side filtering & sorting state
  const [clientSort, setClientSort] = useState<'relevance' | 'views' | 'duration' | 'date'>('relevance');
  const [minDuration, setMinDuration] = useState(60); // Default to 60s to hide Shorts
  const [minViews, setMinViews] = useState(0);

  // Selection & Shortlist state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [shortlist, setShortlist] = useState<Clip[]>([]);
  const [copied, setCopied] = useState(false);
  const [shortlistCopied, setShortlistCopied] = useState(false);

  // Modal Preview state
  const [previewVideo, setPreviewVideo] = useState<Clip | null>(null);
  const [playerStartTime, setPlayerStartTime] = useState<number | null>(null);

  // Instagram Discovery states
  const [instagramModel, setInstagramModel] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [creators, setCreators] = useState<CreatorLead[]>([]);
  const [isHashtagsLoading, setIsHashtagsLoading] = useState(false);
  const [isCreatorsLoading, setIsCreatorsLoading] = useState(false);
  const [hashtagsError, setHashtagsError] = useState<string | null>(null);
  const [creatorsError, setCreatorsError] = useState<string | null>(null);
  const [copiedHashtags, setCopiedHashtags] = useState(false);
  const [instagramCached, setInstagramCached] = useState({ hashtags: false, creators: false });
  const [isInstagramPanelOpen, setIsInstagramPanelOpen] = useState(true);

  // Download settings
  const [downloadQuality, setDownloadQuality] = useState<'best (≤1080p)' | '720p' | 'best available'>('best (≤1080p)');
  const [downloadStatus, setDownloadStatus] = useState<Record<string, DownloadStatus>>({});
  const [isDownloading, setIsDownloading] = useState(false);

  // Quality of Life states
  const [history, setHistory] = useState<string[]>([]);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [quotaUsed, setQuotaUsed] = useState(0);

  // 1. Initial Load from LocalStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('clip_finder_history');
    const savedShortlist = localStorage.getItem('clip_finder_shortlist');
    const today = new Date().toISOString().split('T')[0];
    const savedQuota = localStorage.getItem('clip_finder_quota');

    setTimeout(() => {
      // History
      if (savedHistory) {
        try { setHistory(JSON.parse(savedHistory)); } catch { /* ignore */ }
      }

      // Shortlist
      if (savedShortlist) {
        try { setShortlist(JSON.parse(savedShortlist)); } catch { /* ignore */ }
      }

      // Quota tracking
      if (savedQuota) {
        try {
          const parsed = JSON.parse(savedQuota);
          if (parsed.date === today) {
            setQuotaUsed(parsed.used);
          } else {
            localStorage.setItem('clip_finder_quota', JSON.stringify({ date: today, used: 0 }));
            setQuotaUsed(0);
          }
        } catch {
          localStorage.setItem('clip_finder_quota', JSON.stringify({ date: today, used: 0 }));
        }
      } else {
        localStorage.setItem('clip_finder_quota', JSON.stringify({ date: today, used: 0 }));
      }
    }, 0);
  }, []);

  // Update localStorage shortlist
  const saveShortlist = (newShortlist: Clip[]) => {
    setShortlist(newShortlist);
    localStorage.setItem('clip_finder_shortlist', JSON.stringify(newShortlist));
  };

  const loadInstagramDiscovery = async (model: string) => {
    if (!model || !model.trim()) return;
    const cleanModel = model.trim();
    setInstagramModel(cleanModel);
    
    setHashtags([]);
    setCreators([]);
    setHashtagsError(null);
    setCreatorsError(null);
    setInstagramCached({ hashtags: false, creators: false });

    setIsHashtagsLoading(true);
    fetch('/api/suggest-hashtags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cleanModel }),
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to fetch hashtags');
        }
        setHashtags(data.hashtags || []);
        setInstagramCached(prev => ({ ...prev, hashtags: !!data.cached }));
      })
      .catch(err => {
        setHashtagsError(err.message || 'Failed to fetch hashtags');
      })
      .finally(() => setIsHashtagsLoading(false));

    setIsCreatorsLoading(true);
    fetch('/api/creators', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cleanModel }),
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to fetch creators');
        }
        setCreators(data.creators || []);
        setInstagramCached(prev => ({ ...prev, creators: !!data.cached }));
        if (!data.cached) {
          trackQuotaUsage(100);
        }
      })
      .catch(err => {
        setCreatorsError(err.message || 'Failed to fetch creators');
      })
      .finally(() => setIsCreatorsLoading(false));
  };

  const handleCopyAllHashtags = async () => {
    if (hashtags.length === 0) return;
    const allTags = hashtags.join(' ');
    try {
      await navigator.clipboard.writeText(allTags);
      setCopiedHashtags(true);
      setTimeout(() => setCopiedHashtags(false), 2000);
    } catch {
      alert('Failed to copy hashtags.');
    }
  };

  const toggleShortlist = (clip: Clip) => {
    const exists = shortlist.some(c => c.videoId === clip.videoId);
    if (exists) {
      saveShortlist(shortlist.filter(c => c.videoId !== clip.videoId));
    } else {
      saveShortlist([...shortlist, clip]);
    }
  };

  const trackQuotaUsage = (units: number) => {
    const today = new Date().toISOString().split('T')[0];
    setQuotaUsed(prev => {
      const next = prev + units;
      localStorage.setItem('clip_finder_quota', JSON.stringify({ date: today, used: next }));
      return next;
    });
  };

  const toggleChip = (chip: string) => {
    setActiveChips(prev =>
      prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip]
    );
  };

  const addToHistory = (q: string) => {
    if (!q || q.trim() === '') return;
    const clean = q.trim();
    const updated = [clean, ...history.filter(h => h.toLowerCase() !== clean.toLowerCase())].slice(0, 8);
    setHistory(updated);
    localStorage.setItem('clip_finder_history', JSON.stringify(updated));
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('clip_finder_history');
  };

  // 2. Perform Search (Initial page)
  const handleSearch = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    
    const baseQuery = customQuery !== undefined ? customQuery : query;
    if (!baseQuery.trim()) return;

    setIsLoading(true);
    setError(null);
    setSelectedIds(new Set());
    setNextPageToken(null);
    
    // Combine base query with active keyword chips
    const fullQuery = activeChips.length > 0 
      ? `${baseQuery.trim()} ${activeChips.join(' ')}` 
      : baseQuery.trim();

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: fullQuery,
          duration,
          uploadedWithin,
          sort,
          hd: hdOnly,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong during search.');
      }

      const resData = data as SearchResponse;
      setClips(resData.clips);
      setNextPageToken(resData.nextPageToken || null);
      setIsCached(resData.cached);
      setHasSearched(true);
      addToHistory(baseQuery);
      if (customQuery !== undefined) {
        setQuery(customQuery);
      }
      
      // Load Instagram Discovery helper data
      loadInstagramDiscovery(baseQuery);
      
      // Quota tracking: API hit costs 101 units (100 search + 1 enrich)
      if (!resData.cached) {
        trackQuotaUsage(101);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to perform search. Please check your connection and API key.';
      setError(errorMsg);
      setClips([]);
    } finally {
      setIsLoading(false);
      setShowHistoryDropdown(false);
    }
  };

  // 3. Load More (Pagination)
  const handleLoadMore = async () => {
    if (!nextPageToken || isLoadingMore) return;

    setIsLoadingMore(true);
    setError(null);

    const baseQuery = query;
    const fullQuery = activeChips.length > 0 
      ? `${baseQuery.trim()} ${activeChips.join(' ')}` 
      : baseQuery.trim();

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: fullQuery,
          duration,
          uploadedWithin,
          sort,
          hd: hdOnly,
          pageToken: nextPageToken,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong while loading more clips.');
      }

      const resData = data as SearchResponse;
      // Append results
      setClips(prev => [...prev, ...resData.clips]);
      setNextPageToken(resData.nextPageToken || null);
      setIsCached(resData.cached);

      if (!resData.cached) {
        trackQuotaUsage(101);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load more clips.';
      setError(errorMsg);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // 4. Toggle single selection
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle all selection
  const toggleSelectAll = (visibleClips: Clip[]) => {
    const visibleIds = visibleClips.map(c => c.videoId);
    const allSelected = visibleIds.every(id => selectedIds.has(id));

    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach(id => next.delete(id));
      } else {
        visibleIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  // 5. Copy selected URLs to clipboard
  const handleCopyUrls = async (clipList: Clip[], isShortlist = false) => {
    const urls = clipList.map(c => c.url).join('\n');
    if (!urls) return;

    try {
      await navigator.clipboard.writeText(urls);
      if (isShortlist) {
        setShortlistCopied(true);
        setTimeout(() => setShortlistCopied(false), 2000);
      } else {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      alert('Failed to copy to clipboard.');
    }
  };

  // 6. Trigger sequential download via Server-Sent Events (SSE)
  const handleDownloadClips = async (ids: string[]) => {
    if (ids.length === 0 || isDownloading) return;

    setIsDownloading(true);

    // Initial status setup
    setDownloadStatus(prev => {
      const next = { ...prev };
      for (const id of ids) {
        next[id] = { videoId: id, status: 'queued' };
      }
      return next;
    });

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          videoIds: ids,
          quality: downloadQuality 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start downloading');
      }

      if (!response.body) {
        throw new Error('No stream response from server');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete lines in buffer

        for (const line of lines) {
          const cleanLine = line.trim();
          if (cleanLine.startsWith('data: ')) {
            try {
              const statusData = JSON.parse(cleanLine.slice(6)) as DownloadStatus;
              setDownloadStatus(prev => ({
                ...prev,
                [statusData.videoId]: statusData,
              }));
            } catch (err) {
              console.error('Failed to parse SSE line data:', cleanLine, err);
            }
          }
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Lost connection to download service.';
      // Mark outstanding selections as failed
      setDownloadStatus(prev => {
        const next = { ...prev };
        for (const id of ids) {
          if (next[id]?.status === 'queued' || next[id]?.status === 'downloading') {
            next[id] = {
              videoId: id,
              status: 'failed',
              error: errorMsg,
            };
          }
        }
        return next;
      });
      
      // Also surface error message to user
      setError(errorMsg);
    } finally {
      setIsDownloading(false);
    }
  };

  // 7. Client-side Filters & Sorts Processing
  const processedClips = React.useMemo(() => {
    let list = clips.filter(clip => {
      if (clip.durationSeconds < minDuration) return false;
      if (clip.viewCount < minViews) return false;
      return true;
    });

    if (clientSort === 'views') {
      list = [...list].sort((a, b) => b.viewCount - a.viewCount);
    } else if (clientSort === 'duration') {
      list = [...list].sort((a, b) => b.durationSeconds - a.durationSeconds);
    } else if (clientSort === 'date') {
      list = [...list].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    }

    return list;
  }, [clips, clientSort, minDuration, minViews]);

  // Formatting helpers
  const formatViews = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
  };

  const formatRelativeDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays} days ago`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths === 1) return '1 month ago';
    if (diffMonths < 12) return `${diffMonths} months ago`;
    const diffYears = Math.floor(diffMonths / 12);
    if (diffYears === 1) return '1 year ago';
    return `${diffYears} years ago`;
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 text-zinc-900 selection:bg-purple-500 selection:text-white relative">
      {/* Main Container */}
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 relative z-10 flex flex-col gap-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-zinc-200 pb-6 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-xl shadow-md shadow-purple-200">
              <Tv className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-700 bg-clip-text text-transparent">
                  Clip Finder
                </h1>
                <Badge className="bg-purple-50 border border-purple-200 text-purple-700 font-mono text-xs px-2 py-0.5">
                  MVP
                </Badge>
              </div>
              <p className="text-sm text-zinc-550 mt-0.5">
                Search, filter, and download clean source footage locally
              </p>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
            {/* Daily Quota Counter display */}
            <div className="text-xs font-mono text-zinc-500 bg-white border border-zinc-200 rounded-md px-3 py-1.5 shadow-sm flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              Quota: <span className="font-semibold text-zinc-700">~{quotaUsed}</span> / 10,000 units
            </div>
            <div className="text-xs font-mono text-zinc-500 bg-white border border-zinc-200 rounded-md px-3 py-1.5 shadow-sm">
              Status: <span className="text-emerald-600 font-semibold">● Localhost Mode</span>
            </div>
          </div>
        </header>

        {/* Search and Filters Section */}
        <section className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-sm space-y-4">
          <form onSubmit={e => handleSearch(e)} className="flex flex-col gap-4 relative">
            <div className="flex flex-col md:flex-row gap-3">
              {/* Search input with recent searches history dropdown */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-zinc-400" />
                <Input
                  type="text"
                  placeholder="Enter car model (e.g. Porsche 911 GT3 RS, Audi RS6 C8)..."
                  className="pl-10 h-11 bg-zinc-50 border-zinc-200 focus-visible:ring-purple-500/10 focus-visible:border-purple-500 text-zinc-950 placeholder:text-zinc-400 rounded-xl"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onFocus={() => setShowHistoryDropdown(history.length > 0)}
                  disabled={isLoading}
                />
                
                {/* History dropdown */}
                {showHistoryDropdown && history.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-zinc-200 rounded-xl shadow-lg z-30 max-h-56 overflow-y-auto py-1">
                    <div className="flex justify-between items-center px-3.5 py-1.5 border-b border-zinc-100 text-2xs text-zinc-400 font-medium">
                      <span>RECENT SEARCHES</span>
                      <button 
                        type="button" 
                        onClick={(e) => { e.stopPropagation(); clearHistory(); setShowHistoryDropdown(false); }}
                        className="hover:text-red-500 flex items-center gap-0.5"
                      >
                        <Trash2 className="w-3 h-3" />
                        Clear
                      </button>
                    </div>
                    {history.map((h, i) => (
                      <button
                        key={i}
                        type="button"
                        className="w-full text-left px-3.5 py-2 hover:bg-zinc-50 text-xs text-zinc-700 font-medium flex items-center justify-between"
                        onClick={() => {
                          setQuery(h);
                          setShowHistoryDropdown(false);
                          handleSearch(undefined, h);
                        }}
                      >
                        <span className="truncate">{h}</span>
                        <History className="w-3.5 h-3.5 text-zinc-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <Button 
                type="submit" 
                disabled={isLoading || !query.trim()}
                className="h-11 px-6 rounded-xl bg-purple-600 hover:bg-purple-750 text-white font-medium shadow-sm hover:shadow active:scale-[0.98] transition-transform duration-100 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Find Clips
                  </>
                )}
              </Button>
            </div>

            {/* Keyword Chips row (Section B) */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
              <span className="text-2xs font-semibold text-zinc-400 mr-1.5 tracking-wider uppercase">Quick Modifiers:</span>
              {SEARCH_CHIPS.map(chip => {
                const isActive = activeChips.includes(chip);
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => toggleChip(chip)}
                    className={`px-3 py-1 text-2xs font-semibold rounded-full border transition-all ${
                      isActive 
                        ? 'bg-purple-50 border-purple-300 text-purple-700 shadow-sm' 
                        : 'bg-zinc-50 border-zinc-200 text-zinc-650 hover:bg-zinc-100 hover:text-zinc-800'
                    }`}
                  >
                    +{chip}
                  </button>
                );
              })}
            </div>

            {/* Close history dropdown on background click */}
            {showHistoryDropdown && (
              <div 
                className="fixed inset-0 z-20" 
                onClick={() => setShowHistoryDropdown(false)} 
              />
            )}

            {/* Filter Dropdowns & HD Toggle */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 items-end">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-500">Duration (API)</label>
                <Select
                  value={duration}
                  onValueChange={(val) => setDuration(val as 'any' | 'short' | 'medium' | 'long')}
                  disabled={isLoading}
                >
                  <SelectTrigger className="bg-zinc-50 border-zinc-200 text-zinc-800 h-10 rounded-lg focus:ring-purple-500/10">
                    <SelectValue placeholder="Any duration" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-zinc-200 text-zinc-800">
                    <SelectItem value="any">Any duration</SelectItem>
                    <SelectItem value="short">Short (&lt; 4m)</SelectItem>
                    <SelectItem value="medium">Medium (4m - 20m)</SelectItem>
                    <SelectItem value="long">Long (&gt; 20m)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-500">Upload Date (API)</label>
                <Select
                  value={uploadedWithin}
                  onValueChange={(val) => setUploadedWithin(val as 'any' | 'year' | 'month')}
                  disabled={isLoading}
                >
                  <SelectTrigger className="bg-zinc-50 border-zinc-200 text-zinc-800 h-10 rounded-lg focus:ring-purple-500/10">
                    <SelectValue placeholder="Any time" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-zinc-200 text-zinc-800">
                    <SelectItem value="any">Any time</SelectItem>
                    <SelectItem value="month">Past 30 days</SelectItem>
                    <SelectItem value="year">Past year</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-500">Sort By (API)</label>
                <Select
                  value={sort}
                  onValueChange={(val) => setSort(val as 'relevance' | 'date' | 'views')}
                  disabled={isLoading}
                >
                  <SelectTrigger className="bg-zinc-50 border-zinc-200 text-zinc-800 h-10 rounded-lg focus:ring-purple-500/10">
                    <SelectValue placeholder="Relevance" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-zinc-200 text-zinc-800">
                    <SelectItem value="relevance">Relevance</SelectItem>
                    <SelectItem value="date">Upload Date</SelectItem>
                    <SelectItem value="views">View Count</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* HD Only switch toggle (Section A) */}
              <div className="flex items-center h-10 gap-2.5 px-3 bg-zinc-50 border border-zinc-200 rounded-lg select-none">
                <Checkbox
                  id="hd-toggle"
                  checked={hdOnly}
                  onCheckedChange={(checked) => setHdOnly(Boolean(checked))}
                  disabled={isLoading}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500/20 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-500"
                />
                <label htmlFor="hd-toggle" className="text-xs font-semibold text-zinc-700 cursor-pointer">
                  HD Definition Only
                </label>
              </div>
            </div>
          </form>
        </section>

        {/* Error State */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 flex gap-3 text-sm animate-in fade-in duration-300">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="whitespace-pre-line flex-1">
              <span className="font-semibold text-red-650">Search Error:</span> {error}
            </div>
          </div>
        )}

        {/* Main Workspace: Results & Shortlist & Downloader */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          
          {/* Results Area */}
          <div className="flex-1 w-full min-w-0 flex flex-col gap-6">
            
            {/* Result-side controls toolbar (Section C) */}
            {clips.length > 0 && (
              <div className="bg-white border border-zinc-200/80 rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-2xs">
                
                {/* Count & Cache Indicator */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-zinc-800">
                    Visible: {processedClips.length} / {clips.length}
                  </span>
                  {isCached && (
                    <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50 text-2xs px-2 py-0.5 flex gap-1 items-center font-mono">
                      ⚡ Cached
                    </Badge>
                  )}
                </div>

                {/* Client side sorting / filters controls */}
                <div className="w-full md:w-auto flex flex-wrap items-center gap-4 text-xs font-medium">
                  {/* Client side re-sort */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-500">Client Sort:</span>
                    <Select
                      value={clientSort}
                      onValueChange={(val) => setClientSort(val as 'relevance' | 'views' | 'duration' | 'date')}
                    >
                      <SelectTrigger className="h-8 border-zinc-200 bg-white text-zinc-850 px-2.5 rounded-lg focus:ring-0 w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-zinc-250 text-zinc-800">
                        <SelectItem value="relevance">Original</SelectItem>
                        <SelectItem value="views">Views</SelectItem>
                        <SelectItem value="duration">Duration</SelectItem>
                        <SelectItem value="date">Newest</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Min duration slider (seconds) - Default hides sub-60s vertical Shorts */}
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 whitespace-nowrap">Min Duration:</span>
                    <span className="font-mono text-zinc-800 bg-zinc-100 px-1.5 py-0.5 rounded text-2xs min-w-[32px] text-center font-bold">
                      {minDuration}s
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="600"
                      step="10"
                      value={minDuration}
                      onChange={e => setMinDuration(parseInt(e.target.value))}
                      className="w-24 accent-purple-600 cursor-pointer h-1 bg-zinc-200 rounded-lg appearance-none"
                    />
                  </div>

                  {/* Min views input box */}
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500">Min Views:</span>
                    <Input
                      type="number"
                      placeholder="0"
                      min="0"
                      step="1000"
                      value={minViews || ''}
                      onChange={e => setMinViews(parseInt(e.target.value) || 0)}
                      className="h-8 w-24 bg-white border-zinc-200 px-2 rounded-lg text-zinc-800"
                    />
                  </div>
                </div>

                {/* Select All */}
                <button
                  onClick={() => toggleSelectAll(processedClips)}
                  className="text-xs text-purple-600 hover:text-purple-700 font-bold transition-colors shrink-0"
                >
                  {processedClips.every(c => selectedIds.has(c.videoId)) ? 'Deselect All' : 'Select All'}
                </button>

              </div>
            )}

            {/* Results Grid */}
            {isLoading ? (
              // Skeleton Loader Grid
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {[...Array(6)].map((_, i) => (
                  <Card key={i} className="bg-white border border-zinc-200 animate-pulse overflow-hidden">
                    <div className="aspect-video bg-zinc-100" />
                    <CardContent className="p-4 space-y-3">
                      <div className="h-4.5 bg-zinc-100 rounded w-5/6" />
                      <div className="h-3.5 bg-zinc-100 rounded w-1/2" />
                      <div className="flex justify-between items-center pt-2">
                        <div className="h-3.5 bg-zinc-100 rounded w-1/3" />
                        <div className="h-3.5 bg-zinc-100 rounded w-1/4" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : processedClips.length > 0 ? (
              // Real Grid
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 animate-in fade-in duration-200">
                {processedClips.map(clip => {
                  const isSelected = selectedIds.has(clip.videoId);
                  const isShortlisted = shortlist.some(c => c.videoId === clip.videoId);
                  const status = downloadStatus[clip.videoId];

                  return (
                    <Card
                      key={clip.videoId}
                      className={`group overflow-hidden bg-white hover:bg-zinc-50/30 border transition-all duration-300 relative select-none cursor-pointer flex flex-col h-full ${
                        isSelected
                          ? 'border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.06)] bg-purple-50/10'
                          : 'border-zinc-200 hover:border-zinc-300'
                      }`}
                      onClick={() => toggleSelect(clip.videoId)}
                    >
                      {/* Checkbox overlay top-left */}
                      <div className="absolute top-3 left-3 z-20" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(clip.videoId)}
                          className={`w-5 h-5 rounded-md border-zinc-300 bg-white data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-500`}
                        />
                      </div>

                      {/* Top-right Actions overlay (Preview and Shortlist) */}
                      <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        {/* Shortlist star */}
                        <button
                          onClick={() => toggleShortlist(clip)}
                          className={`p-1.5 rounded-lg border shadow-sm transition-colors ${
                            isShortlisted
                              ? 'bg-amber-50 border-amber-200 text-amber-500 hover:bg-amber-100'
                              : 'bg-white/95 border-zinc-200 text-zinc-400 hover:text-amber-500 hover:bg-white'
                          }`}
                          title={isShortlisted ? 'Remove from Shortlist' : 'Add to Shortlist'}
                        >
                          <Star className={`w-3.5 h-3.5 ${isShortlisted ? 'fill-amber-400' : ''}`} />
                        </button>

                        {/* Inline Preview Play */}
                        <button
                          onClick={() => { setPlayerStartTime(null); setPreviewVideo(clip); }}
                          className="p-1.5 bg-white/95 border border-zinc-200 rounded-lg text-zinc-500 hover:text-purple-650 hover:bg-white shadow-sm transition-colors"
                          title="Open Video Preview"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                      </div>

                      {/* Thumbnail with overlay duration */}
                      <div className="aspect-video relative overflow-hidden bg-zinc-100 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={clip.thumbnailUrl}
                          alt={clip.title}
                          className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-500"
                          loading="lazy"
                        />
                        <div className={`absolute inset-0 bg-purple-500/5 transition-opacity duration-300 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />

                        {/* Duration Badge */}
                        <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/75 backdrop-blur-sm text-zinc-100 text-2xs font-mono font-semibold rounded-md tracking-wider border border-zinc-800/20 z-10">
                          {clip.durationLabel}
                        </span>

                        {/* Direct link overlay */}
                        <a
                          href={clip.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open on YouTube"
                          className="absolute bottom-2 left-2 p-1.5 bg-white/90 hover:bg-white backdrop-blur-sm rounded-md border border-zinc-200 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
                          onClick={e => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-800" />
                        </a>
                      </div>

                      {/* Content Card details */}
                      <CardContent className="p-4 flex flex-col flex-1 justify-between gap-3 min-w-0 bg-white">
                        <div className="space-y-1">
                          <h3
                            className="font-medium text-sm leading-snug text-zinc-800 group-hover:text-purple-600 transition-colors line-clamp-2"
                            title={clip.title}
                          >
                            {clip.title}
                          </h3>
                          <p className="text-xs text-zinc-550 font-medium truncate">
                            {clip.channelTitle}
                          </p>
                        </div>

                        {/* Download status indication badge inside results card */}
                        <div className="flex items-center justify-between text-2xs font-mono text-zinc-450 border-t border-zinc-105 pt-2 shrink-0">
                          <div className="flex items-center gap-1.5 min-w-0 truncate">
                            <span>{formatViews(clip.viewCount)} views</span>
                            {clip.chapters && clip.chapters.length > 0 && (
                              <Badge className="bg-purple-50 border border-purple-100 text-purple-700 text-3xs px-1 py-0 shadow-none shrink-0 font-medium pointer-events-none">
                                {clip.chapters.length} ch
                              </Badge>
                            )}
                          </div>
                          {status ? (
                            <span className={`font-semibold ${
                              status.status === 'done' ? 'text-emerald-600' : 
                              status.status === 'failed' ? 'text-red-500' : 'text-purple-600 animate-pulse'
                            }`}>
                              {status.status === 'downloading' ? `Down... ${status.progress || 0}%` : status.status}
                            </span>
                          ) : (
                            <span>{formatRelativeDate(clip.publishedAt)}</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              // Empty search / Welcome State
              <div className="text-center py-16 px-4 bg-white border border-zinc-200 rounded-2xl flex flex-col items-center gap-4 shadow-sm">
                <div className="p-4 bg-zinc-50 rounded-full border border-zinc-100 text-zinc-400">
                  <FileVideo2 className="w-8 h-8" />
                </div>
                {hasSearched ? (
                  <div>
                    <h3 className="text-base font-semibold text-zinc-800">No clips matches client filters</h3>
                    <p className="text-sm text-zinc-500 max-w-sm mx-auto mt-1">
                      Try resetting your minimum duration, minimum views slider, or active keyword chips.
                    </p>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-base font-semibold text-zinc-800">Start Finding Clips</h3>
                    <p className="text-sm text-zinc-500 max-w-sm mx-auto mt-1">
                      Enter a car model to begin searching YouTube for clean source footage.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Load More pagination button (Section C) */}
            {nextPageToken && clips.length > 0 && !isLoading && (
              <div className="flex justify-center pt-2">
                <div className="relative group">
                  <Button
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    className="bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 font-semibold px-6 py-2 rounded-full cursor-pointer h-10 shadow-2xs"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin text-purple-600" />
                        Loading More...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2 text-purple-500" />
                        Load More Results
                      </>
                    )}
                  </Button>
                  
                  {/* Quota tooltip warning */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-zinc-900 text-white font-mono text-[10px] py-1 px-2.5 rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 w-52 text-center z-15">
                    ⚠️ Costs ~100 API quota units
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Persistent Shortlist panel sidebar (Section E) & Downloads log */}
          <aside className="w-full lg:w-80 shrink-0 flex flex-col gap-6 sticky top-6">
            
            {/* Instagram Discovery Helper (Section B) */}
            {hasSearched && instagramModel && (
              <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex justify-between items-center border-b border-zinc-100 pb-2.5">
                  <h3 className="font-semibold text-sm text-zinc-800 flex items-center gap-2">
                    <InstagramIcon className="w-4 h-4 text-purple-600" />
                    Instagram Helper (manual)
                  </h3>
                  <button
                    onClick={() => setIsInstagramPanelOpen(!isInstagramPanelOpen)}
                    className="text-zinc-400 hover:text-zinc-650 transition-colors p-0.5 rounded"
                  >
                    {isInstagramPanelOpen ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {isInstagramPanelOpen && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    {/* Model Info */}
                    <div className="text-2xs text-zinc-450 font-medium bg-zinc-50 border border-zinc-150 rounded-lg p-2.5">
                      Target model: <span className="font-semibold text-zinc-700">{instagramModel}</span>
                    </div>

                    {/* Hashtags Segment */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-2xs font-bold text-zinc-700 uppercase tracking-wide flex items-center gap-1">
                          Hashtags
                          {instagramCached.hashtags && (
                            <span className="font-mono text-3xs text-emerald-600 font-semibold lowercase">⚡ cached</span>
                          )}
                        </span>
                        {hashtags.length > 0 && (
                          <button
                            onClick={handleCopyAllHashtags}
                            className="text-3xs text-purple-600 hover:text-purple-750 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            {copiedHashtags ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                Copy All
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {isHashtagsLoading ? (
                        <div className="flex items-center gap-2 py-4 text-xs text-zinc-450">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                          Generating hashtags...
                        </div>
                      ) : hashtagsError ? (
                        <p className="text-3xs text-red-500 font-medium bg-red-50/50 border border-red-100 rounded-lg p-2">
                          {hashtagsError}
                        </p>
                      ) : hashtags.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 bg-zinc-50 border border-zinc-150 rounded-xl">
                            {hashtags.map((tag, idx) => (
                              <button
                                key={idx}
                                onClick={() => {
                                  navigator.clipboard.writeText(tag);
                                }}
                                className="px-2 py-0.5 bg-white hover:bg-zinc-100 border border-zinc-200 text-3xs font-medium text-zinc-700 rounded-md transition-colors cursor-pointer select-all"
                                title="Click to copy single hashtag"
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                          <p className="text-4xs text-zinc-400 italic">
                            Suggested candidates — not verified for live volume. Check on Instagram.
                          </p>
                        </div>
                      ) : (
                        <p className="text-3xs text-zinc-450 italic py-2">No hashtag suggestions found.</p>
                      )}
                    </div>

                    {/* Creator Leads Segment */}
                    <div className="space-y-2 border-t border-zinc-100 pt-3">
                      <div className="flex justify-between items-center">
                        <span className="text-2xs font-bold text-zinc-700 uppercase tracking-wide flex items-center gap-1 group relative">
                          Creator Leads
                          {instagramCached.creators && (
                            <span className="font-mono text-3xs text-emerald-600 font-semibold lowercase">⚡ cached</span>
                          )}
                          <Info className="w-3 h-3 text-zinc-450 shrink-0 cursor-help" />
                          <span className="absolute bottom-full left-0 mb-1 bg-zinc-900 text-white font-mono text-[9px] py-1 px-2 rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 w-48 text-center z-15">
                            Real channels. Channel search costs ~100 API quota units
                          </span>
                        </span>
                      </div>

                      {isCreatorsLoading ? (
                        <div className="flex items-center gap-2 py-4 text-xs text-zinc-450">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                          Searching channels...
                        </div>
                      ) : creatorsError ? (
                        <p className="text-3xs text-red-500 font-medium bg-red-50/50 border border-red-100 rounded-lg p-2">
                          {creatorsError}
                        </p>
                      ) : creators.length > 0 ? (
                        <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                          {creators.map(creator => (
                            <div
                              key={creator.channelId}
                              className="flex gap-2 p-2 bg-zinc-50 border border-zinc-150 rounded-xl relative group/creator text-2xs"
                            >
                              {creator.thumbnail && (
                                <img
                                  src={creator.thumbnail}
                                  alt={creator.title}
                                  className="w-8 h-8 rounded-full object-cover border border-zinc-200 shrink-0"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-zinc-800 truncate" title={creator.title}>
                                  {creator.title}
                                </h4>
                                <p className="text-3xs text-zinc-450 line-clamp-1 leading-normal" title={creator.description}>
                                  {creator.description}
                                </p>
                                
                                <div className="flex items-center gap-2.5 mt-1.5 font-semibold font-mono">
                                  <a
                                    href={creator.channelUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-purple-650 hover:text-purple-750 inline-flex items-center gap-0.5"
                                  >
                                    YouTube <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                  <a
                                    href={`https://www.google.com/search?q=site:instagram.com "${encodeURIComponent(creator.title)}"`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-zinc-550 hover:text-zinc-850 inline-flex items-center gap-0.5"
                                  >
                                    Instagram Search <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-3xs text-zinc-450 italic py-2">No creator leads found.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Shortlist Sidebar Card */}
            <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
                <h3 className="font-semibold text-sm text-zinc-800 flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                  Shortlist ({shortlist.length})
                </h3>
                {shortlist.length > 0 && (
                  <button
                    onClick={() => saveShortlist([])}
                    className="text-2xs text-zinc-400 hover:text-red-500 transition-colors font-medium"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {shortlist.length > 0 ? (
                <div className="space-y-4">
                  {/* Shortlist actions */}
                  <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 border-zinc-200 hover:bg-zinc-50 text-zinc-700 rounded-lg cursor-pointer"
                      onClick={() => handleCopyUrls(shortlist, true)}
                    >
                      {shortlistCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 mr-1 text-emerald-650" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 mr-1" />
                          Copy URLs
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 bg-purple-600 hover:bg-purple-750 text-white rounded-lg cursor-pointer shadow-xs"
                      onClick={() => handleDownloadClips(shortlist.map(c => c.videoId))}
                      disabled={isDownloading}
                    >
                      <Download className="w-3.5 h-3.5 mr-1" />
                      Download All
                    </Button>
                  </div>

                  {/* List items */}
                  <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                    {shortlist.map(item => (
                      <div key={item.videoId} className="flex gap-2.5 p-2 bg-zinc-50 border border-zinc-150 rounded-xl relative group/item">
                        <div className="w-16 aspect-video rounded-lg overflow-hidden bg-zinc-200 shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0 pr-4">
                          <p className="text-2xs font-semibold text-zinc-800 line-clamp-2 leading-tight" title={item.title}>
                            {item.title}
                          </p>
                          <span className="text-3xs text-zinc-400 font-mono font-medium">{item.durationLabel}</span>
                        </div>
                        <button
                          onClick={() => saveShortlist(shortlist.filter(c => c.videoId !== item.videoId))}
                          className="absolute right-2 top-2 text-zinc-400 hover:text-red-500 rounded p-0.5 transition-colors bg-white/80 md:opacity-0 md:group-hover/item:opacity-100"
                          title="Remove item"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-zinc-450 text-center py-6 leading-relaxed">
                  Your shortlist is empty. Click the star icon on any result card to add clean clips here.
                </p>
              )}
            </div>

            {/* Download Logs Monitor */}
            {Object.keys(downloadStatus).length > 0 && (
              <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex justify-between items-center border-b border-zinc-100 pb-2.5">
                  <h3 className="font-semibold text-sm text-zinc-800 flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-purple-600" />
                    Downloads Log
                  </h3>
                  <button
                    onClick={() => setDownloadStatus({})}
                    className="text-2xs text-zinc-400 hover:text-zinc-600 font-mono transition-colors"
                  >
                    Clear Logs
                  </button>
                </div>

                {/* Download List */}
                <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
                  {Object.values(downloadStatus).map(status => {
                    const clip = clips.find(c => c.videoId === status.videoId) || shortlist.find(c => c.videoId === status.videoId);
                    const title = clip?.title || `Video ${status.videoId}`;

                    return (
                      <div
                        key={status.videoId}
                        className="p-3 bg-zinc-50 border border-zinc-150 rounded-xl space-y-2 text-xs"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <span className="font-semibold text-zinc-800 truncate flex-1" title={title}>
                            {title}
                          </span>
                          <a
                            href={`https://youtube.com/watch?v=${status.videoId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-zinc-400 hover:text-zinc-650 inline-flex"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>

                        {/* Progress bar or info message */}
                        {status.status === 'downloading' && (
                          <div className="space-y-1.5">
                            <div className="w-full bg-zinc-250 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-purple-650 h-full transition-all duration-300"
                                style={{ width: `${status.progress || 0}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-3xs font-mono text-purple-650 font-bold">
                              <span>Downloading...</span>
                              <span>{status.progress || 0}%</span>
                            </div>
                          </div>
                        )}

                        {status.status === 'queued' && (
                          <p className="text-3xs font-mono text-zinc-450">Queued in download sequence...</p>
                        )}

                        {status.status === 'done' && (
                          <div className="space-y-1 text-3xs font-mono text-emerald-700 font-medium">
                            <p className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                              Saved successfully
                            </p>
                            {status.filePath && (
                              <p className="text-zinc-500 select-all truncate bg-white border border-zinc-200 px-1 py-0.5 rounded" title={status.filePath}>
                                {status.filePath}
                              </p>
                            )}
                          </div>
                        )}

                        {status.status === 'failed' && (
                          <div className="text-3xs font-mono text-red-700 space-y-1 leading-normal font-medium">
                            <p className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-650" />
                              Download failed
                            </p>
                            {status.error && (
                              <p className="text-zinc-550 bg-red-50 border border-red-100 px-1 py-0.5 rounded break-words select-all max-h-16 overflow-y-auto">
                                {status.error}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </aside>
          
        </div>

      </div>

      {/* Floating Sticky Actions Bar (appears when items are selected) */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-white/95 border border-zinc-200/80 shadow-2xl rounded-full px-5 py-3.5 flex flex-col sm:flex-row items-center gap-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold text-zinc-800 whitespace-nowrap">
                {selectedIds.size} {selectedIds.size === 1 ? 'clip' : 'clips'} selected
              </span>
              
              <div className="h-4.5 w-px bg-zinc-200" />

              {/* Quality selector dropdown (Section F) */}
              <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
                <span>Quality:</span>
                <Select
                  value={downloadQuality}
                  onValueChange={(val) => setDownloadQuality(val as 'best (≤1080p)' | '720p' | 'best available')}
                >
                  <SelectTrigger className="h-8 border-zinc-200 bg-white text-zinc-800 px-2 rounded-lg focus:ring-0 w-32 font-semibold text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-zinc-200 text-zinc-800">
                    <SelectItem value="best (≤1080p)">best (≤1080p)</SelectItem>
                    <SelectItem value="720p">720p</SelectItem>
                    <SelectItem value="best available">best available</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full h-9 border-zinc-200 hover:bg-zinc-100 hover:border-zinc-300 text-zinc-700 text-xs font-semibold px-4 cursor-pointer"
                onClick={() => handleCopyUrls(clips.filter(c => selectedIds.has(c.videoId)))}
                disabled={isDownloading}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-650" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    Copy URLs
                  </>
                )}
              </Button>

              <Button
                size="sm"
                className="rounded-full h-9 bg-purple-600 hover:bg-purple-750 text-white text-xs font-semibold px-4 shadow-md shadow-purple-200 cursor-pointer"
                onClick={() => handleDownloadClips(Array.from(selectedIds))}
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Download Selected
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Inline embedded preview Modal overlay (Section D) */}
      {previewVideo && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200 px-4 py-8"
          onClick={() => setPreviewVideo(null)}
        >
          <div 
            className="bg-white border border-zinc-200 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center px-5 py-4 border-b border-zinc-150 shrink-0">
              <h3 className="font-bold text-sm text-zinc-800 truncate pr-4" title={previewVideo.title}>
                {previewVideo.title}
              </h3>
              <button 
                onClick={() => setPreviewVideo(null)}
                className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Embedded youtube-nocookie Player */}
            <div className="aspect-video bg-black relative shrink-0">
              <iframe
                key={`${previewVideo.videoId}-${playerStartTime || 0}`}
                src={`https://www.youtube-nocookie.com/embed/${previewVideo.videoId}?autoplay=1${playerStartTime !== null ? `&start=${playerStartTime}` : ''}`}
                title={previewVideo.title}
                className="w-full h-full border-0 absolute inset-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>

            {/* Modal Body & Controls */}
            <div className="p-5 flex flex-col gap-4 overflow-y-auto">
              {/* Channel and view stats metadata */}
              <div className="flex flex-wrap justify-between items-center text-xs text-zinc-500 font-medium">
                <span>By: <span className="font-semibold text-zinc-700">{previewVideo.channelTitle}</span></span>
                <div className="flex gap-4">
                  <span>{formatViews(previewVideo.viewCount)} views</span>
                  <span>Duration: {previewVideo.durationLabel}</span>
                  <span>{formatRelativeDate(previewVideo.publishedAt)}</span>
                </div>
              </div>

              {/* Chapters list if present */}
              {previewVideo.chapters && previewVideo.chapters.length > 0 && (
                <div className="border-t border-zinc-100 pt-3 flex flex-col gap-1.5">
                  <h4 className="text-2xs font-bold text-zinc-700 tracking-wide uppercase">Chapters</h4>
                  <div className="flex flex-col gap-1 max-h-32 overflow-y-auto pr-1">
                    {previewVideo.chapters.map((chapter, index) => {
                      const isCurrent = playerStartTime === chapter.timeSeconds;
                      return (
                        <button
                          key={index}
                          type="button"
                          className={`text-left text-xs px-2.5 py-1.5 rounded-lg border transition-all flex justify-between items-center ${
                            isCurrent
                              ? 'bg-purple-50 border-purple-200 text-purple-700 font-semibold shadow-xs'
                              : 'bg-zinc-50 hover:bg-zinc-100 border-zinc-200 text-zinc-750 hover:text-zinc-900'
                          }`}
                          onClick={() => setPlayerStartTime(chapter.timeSeconds)}
                        >
                          <span className="truncate pr-4">{chapter.label}</span>
                          <span className="font-mono text-2xs opacity-80 shrink-0">{chapter.timeLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4 mt-2">
                <div className="flex gap-2">
                  {/* Shortlist Toggle */}
                  <Button
                    variant="outline"
                    size="sm"
                    className={`h-9 px-4 rounded-xl font-semibold border-zinc-250 cursor-pointer flex gap-1.5 items-center ${
                      shortlist.some(c => c.videoId === previewVideo.videoId)
                        ? 'bg-amber-50 border-amber-300 text-amber-600 hover:bg-amber-100'
                        : 'bg-white hover:bg-zinc-50 text-zinc-700'
                    }`}
                    onClick={() => toggleShortlist(previewVideo)}
                  >
                    <Star className={`w-4 h-4 ${shortlist.some(c => c.videoId === previewVideo.videoId) ? 'fill-amber-400 text-amber-500' : ''}`} />
                    {shortlist.some(c => c.videoId === previewVideo.videoId) ? 'Shortlisted' : 'Shortlist'}
                  </Button>

                  {/* External Youtube link */}
                  <a
                    href={previewVideo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 px-4 rounded-xl border border-zinc-250 items-center justify-center text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4 mr-1.5 text-zinc-500" />
                    Open on YouTube
                  </a>
                </div>

                {/* Direct Download in modal */}
                <Button
                  size="sm"
                  className="h-9 px-4 bg-purple-600 hover:bg-purple-750 text-white font-semibold rounded-xl cursor-pointer shadow-xs flex gap-1.5 items-center"
                  onClick={() => {
                    handleDownloadClips([previewVideo.videoId]);
                    setPreviewVideo(null); // Close player on download
                  }}
                  disabled={isDownloading}
                >
                  <Download className="w-4 h-4" />
                  Download Clip
                </Button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
