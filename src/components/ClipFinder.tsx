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
  CheckCircle2,
  XCircle,
  FolderOpen
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
import { Clip, SearchResponse, DownloadStatus } from '@/lib/types';

export default function ClipFinder() {
  // Search parameters state
  const [query, setQuery] = useState('');
  const [duration, setDuration] = useState<'any' | 'short' | 'medium' | 'long'>('any');
  const [uploadedWithin, setUploadedWithin] = useState<'any' | 'year' | 'month'>('any');
  const [sort, setSort] = useState<'relevance' | 'date' | 'views'>('relevance');

  // Request & results state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [isCached, setIsCached] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  // Download state
  const [downloadStatus, setDownloadStatus] = useState<Record<string, DownloadStatus>>({});
  const [isDownloading, setIsDownloading] = useState(false);

  // Local storage for search history to enhance UX
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('clip_finder_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as string[];
        setTimeout(() => {
          setHistory(parsed);
        }, 0);
      } catch {
        // ignore
      }
    }
  }, []);

  const addToHistory = (q: string) => {
    if (!q || q.trim() === '') return;
    const clean = q.trim();
    const updated = [clean, ...history.filter(h => h.toLowerCase() !== clean.toLowerCase())].slice(0, 5);
    setHistory(updated);
    localStorage.setItem('clip_finder_history', JSON.stringify(updated));
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('clip_finder_history');
  };

  // Run the search
  const handleSearch = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    
    const searchTarget = customQuery || query;
    if (!searchTarget.trim()) return;

    setIsLoading(true);
    setError(null);
    setSelectedIds(new Set()); // Reset selection on new search

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: searchTarget,
          duration,
          uploadedWithin,
          sort,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong during search.');
      }

      const resData = data as SearchResponse;
      setClips(resData.clips);
      setIsCached(resData.cached);
      setHasSearched(true);
      addToHistory(searchTarget);
      if (customQuery) {
        setQuery(customQuery);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to perform search. Please check your connection and API key.';
      setError(errorMsg);
      setClips([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle single selection
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
  const toggleSelectAll = () => {
    if (selectedIds.size === clips.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(clips.map(c => c.videoId)));
    }
  };

  // Copy selected URLs to clipboard
  const handleCopyUrls = async () => {
    const urls = clips
      .filter(c => selectedIds.has(c.videoId))
      .map(c => c.url)
      .join('\n');

    if (!urls) return;

    try {
      await navigator.clipboard.writeText(urls);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Failed to copy to clipboard.');
    }
  };

  // Trigger sequential download via Server-Sent Events (SSE)
  const handleDownloadSelected = async () => {
    const ids = clips
      .filter(c => selectedIds.has(c.videoId))
      .map(c => c.videoId);

    if (ids.length === 0) return;

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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoIds: ids }),
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
              const statusData = JSON.parse(cleanLine.slice(6)) as DownloadStatus & { progress?: number };
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
    } finally {
      setIsDownloading(false);
    }
  };

  // Helper formatting functions
  const formatViews = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
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
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-100 selection:bg-purple-500 selection:text-white">
      {/* Background ambient glows */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 relative z-10 flex flex-col gap-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-zinc-800/80 pb-6 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-xl shadow-lg shadow-purple-900/30">
              <Tv className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
                  Clip Finder
                </h1>
                <Badge variant="outline" className="bg-purple-950/30 border-purple-500/30 text-purple-400 font-mono text-xs px-2 py-0.5">
                  MVP
                </Badge>
              </div>
              <p className="text-sm text-zinc-400 mt-0.5">
                Search and download clean source footage locally
              </p>
            </div>
          </div>
          
          <div className="text-xs font-mono text-zinc-500 bg-zinc-900/50 border border-zinc-800/80 rounded-md px-3 py-1.5 backdrop-blur-sm">
            Status: <span className="text-emerald-400 font-semibold">● Localhost Mode</span>
          </div>
        </header>

        {/* Search and Filters Section */}
        <section className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-6 backdrop-blur-md shadow-xl">
          <form onSubmit={e => handleSearch(e)} className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-3">
              {/* Search input */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-zinc-500" />
                <Input
                  type="text"
                  placeholder="Enter car model (e.g. Porsche 911 GT3 RS, Audi RS6 C8)..."
                  className="pl-10 h-11 bg-zinc-950/80 border-zinc-800 focus-visible:ring-purple-500/50 focus-visible:border-purple-500 text-zinc-100 placeholder:text-zinc-500 rounded-xl"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              
              <Button 
                type="submit" 
                disabled={isLoading || !query.trim()}
                className="h-11 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium shadow-lg shadow-purple-900/20 active:scale-[0.98] transition-transform duration-100"
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

            {/* Filter Dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-400">Duration</label>
                <Select
                  value={duration}
                  onValueChange={(val) => setDuration(val as 'any' | 'short' | 'medium' | 'long')}
                  disabled={isLoading}
                >
                  <SelectTrigger className="bg-zinc-950/80 border-zinc-800 text-zinc-200 h-10 rounded-lg focus:ring-purple-500/30">
                    <SelectValue placeholder="Any duration" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <SelectItem value="any">Any duration</SelectItem>
                    <SelectItem value="short">Short (&lt; 4m)</SelectItem>
                    <SelectItem value="medium">Medium (4m - 20m)</SelectItem>
                    <SelectItem value="long">Long (&gt; 20m)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-400">Upload Date</label>
                <Select
                  value={uploadedWithin}
                  onValueChange={(val) => setUploadedWithin(val as 'any' | 'year' | 'month')}
                  disabled={isLoading}
                >
                  <SelectTrigger className="bg-zinc-950/80 border-zinc-800 text-zinc-200 h-10 rounded-lg focus:ring-purple-500/30">
                    <SelectValue placeholder="Any time" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <SelectItem value="any">Any time</SelectItem>
                    <SelectItem value="month">Past 30 days</SelectItem>
                    <SelectItem value="year">Past year</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-400">Sort By</label>
                <Select
                  value={sort}
                  onValueChange={(val) => setSort(val as 'relevance' | 'date' | 'views')}
                  disabled={isLoading}
                >
                  <SelectTrigger className="bg-zinc-950/80 border-zinc-800 text-zinc-200 h-10 rounded-lg focus:ring-purple-500/30">
                    <SelectValue placeholder="Relevance" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <SelectItem value="relevance">Relevance</SelectItem>
                    <SelectItem value="date">Upload Date</SelectItem>
                    <SelectItem value="views">View Count</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Search History Chips */}
            {history.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-800/40 text-xs">
                <div className="flex items-center gap-1 text-zinc-500">
                  <History className="w-3 h-3" />
                  Recent:
                </div>
                {history.map((h, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSearch(undefined, h)}
                    disabled={isLoading}
                    className="px-2.5 py-1 bg-zinc-900 border border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 hover:border-zinc-750 transition-colors rounded-full font-medium"
                  >
                    {h}
                  </button>
                ))}
                <button
                  key="clear"
                  type="button"
                  onClick={clearHistory}
                  className="text-zinc-650 hover:text-red-400 ml-auto flex items-center gap-0.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear history
                </button>
              </div>
            )}
          </form>
        </section>

        {/* Error State */}
        {error && (
          <div className="p-4 bg-red-950/20 border border-red-500/30 rounded-xl text-red-200 flex gap-3 text-sm animate-in fade-in duration-300">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="whitespace-pre-line flex-1">
              <span className="font-semibold text-red-300">Search Error:</span> {error}
            </div>
          </div>
        )}

        {/* Main Workspace: Results & Downloader Panel */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          
          {/* Results Area */}
          <div className="flex-1 w-full min-w-0">
            
            {/* Header info bar */}
            {clips.length > 0 && (
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-zinc-200">
                    Results ({clips.length})
                  </h2>
                  {isCached && (
                    <Badge className="bg-emerald-950/40 text-emerald-400 hover:bg-emerald-950/40 border border-emerald-500/20 animate-pulse flex gap-1 items-center font-mono text-2xs px-1.5 py-0.5">
                      ⚡ Cached (Quota saved)
                    </Badge>
                  )}
                </div>
                <button
                  onClick={toggleSelectAll}
                  className="text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors"
                >
                  {selectedIds.size === clips.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
            )}

            {/* Results Grid */}
            {isLoading ? (
              // Skeleton Loader Grid
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {[...Array(6)].map((_, i) => (
                  <Card key={i} className="bg-zinc-900/30 border-zinc-800/80 animate-pulse overflow-hidden">
                    <div className="aspect-video bg-zinc-850" />
                    <CardContent className="p-4 space-y-3">
                      <div className="h-4.5 bg-zinc-850 rounded w-5/6" />
                      <div className="h-3.5 bg-zinc-850 rounded w-1/2" />
                      <div className="flex justify-between items-center pt-2">
                        <div className="h-3.5 bg-zinc-850 rounded w-1/3" />
                        <div className="h-3.5 bg-zinc-850 rounded w-1/4" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : clips.length > 0 ? (
              // Real Grid
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {clips.map(clip => {
                  const isSelected = selectedIds.has(clip.videoId);
                  const status = downloadStatus[clip.videoId];

                  return (
                    <Card
                      key={clip.videoId}
                      className={`group overflow-hidden bg-zinc-900/40 hover:bg-zinc-900/60 border transition-all duration-300 relative select-none cursor-pointer flex flex-col h-full ${
                        isSelected
                          ? 'border-purple-500/80 shadow-[0_0_15px_rgba(168,85,247,0.15)] bg-purple-950/10'
                          : 'border-zinc-800/80 hover:border-zinc-700'
                      }`}
                      onClick={() => toggleSelect(clip.videoId)}
                    >
                      {/* Checkbox overlay top-left */}
                      <div className="absolute top-3 left-3 z-20" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(clip.videoId)}
                          className={`w-5 h-5 rounded-md border border-zinc-700 bg-zinc-950 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-500`}
                        />
                      </div>

                      {/* Download status tag overlay top-right */}
                      {status && (
                        <div className="absolute top-3 right-3 z-20">
                          {status.status === 'queued' && (
                            <Badge className="bg-zinc-800 text-zinc-300 border border-zinc-750 font-mono text-[10px] px-2 py-0.5">
                              Queued
                            </Badge>
                          )}
                          {status.status === 'downloading' && (
                            <Badge className="bg-purple-600 text-white border border-purple-500 font-mono text-[10px] px-2 py-0.5 flex gap-1 items-center animate-pulse">
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              {status.progress !== undefined ? `${status.progress}%` : 'Down...'}
                            </Badge>
                          )}
                          {status.status === 'done' && (
                            <Badge className="bg-emerald-950 text-emerald-400 border border-emerald-500/30 font-mono text-[10px] px-2 py-0.5 flex gap-1 items-center">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              Saved
                            </Badge>
                          )}
                          {status.status === 'failed' && (
                            <Badge className="bg-red-950 text-red-400 border border-red-500/30 font-mono text-[10px] px-2 py-0.5 flex gap-1 items-center">
                              <XCircle className="w-3 h-3 text-red-400" />
                              Failed
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Thumbnail with overlay duration */}
                      <div className="aspect-video relative overflow-hidden bg-zinc-950 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={clip.thumbnailUrl}
                          alt={clip.title}
                          className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-500"
                          loading="lazy"
                        />
                        {/* Shimmer Overlay on Selection */}
                        <div className={`absolute inset-0 bg-purple-500/10 transition-opacity duration-300 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />

                        {/* Duration Badge */}
                        <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 backdrop-blur-sm text-zinc-100 text-2xs font-mono font-semibold rounded-md tracking-wider border border-zinc-800/50 z-10">
                          {clip.durationLabel}
                        </span>

                        {/* Link overlay for direct access */}
                        <a
                          href={clip.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open in YouTube"
                          className="absolute bottom-2 left-2 p-1.5 bg-black/60 hover:bg-black/90 backdrop-blur-sm rounded-md border border-zinc-800/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
                          onClick={e => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-zinc-300 hover:text-white" />
                        </a>
                      </div>

                      {/* Content Card details */}
                      <CardContent className="p-4 flex flex-col flex-1 justify-between gap-3 min-w-0">
                        <div className="space-y-1">
                          {/* Title (clamp to 2 lines) */}
                          <h3
                            className="font-medium text-sm leading-snug text-zinc-100 group-hover:text-purple-400 transition-colors line-clamp-2"
                            title={clip.title}
                          >
                            {clip.title}
                          </h3>
                          {/* Channel Title */}
                          <p className="text-xs text-zinc-400 font-medium truncate flex items-center gap-1">
                            {clip.channelTitle}
                          </p>
                        </div>

                        {/* Stats Footer inside Card */}
                        <div className="flex items-center justify-between text-2xs font-mono text-zinc-500 border-t border-zinc-850 pt-2 shrink-0">
                          <span>{formatViews(clip.viewCount)} views</span>
                          <span>{formatRelativeDate(clip.publishedAt)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              // Empty search / Welcome State
              <div className="text-center py-16 px-4 bg-zinc-900/20 border border-zinc-800/40 rounded-2xl flex flex-col items-center gap-4">
                <div className="p-4 bg-zinc-900 rounded-full border border-zinc-800 text-zinc-500">
                  <FileVideo2 className="w-8 h-8" />
                </div>
                {hasSearched ? (
                  <div>
                    <h3 className="text-base font-semibold text-zinc-300">No clips found</h3>
                    <p className="text-sm text-zinc-500 max-w-sm mx-auto mt-1">
                      No results matched the model name and filters. Try adjusting your duration or upload date.
                    </p>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-base font-semibold text-zinc-300">Start Finding Clips</h3>
                    <p className="text-sm text-zinc-500 max-w-sm mx-auto mt-1">
                      Enter a car model to begin searching YouTube for clean source footage.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Download Logs Monitor (Shows up when there are active/past download logs) */}
          {Object.keys(downloadStatus).length > 0 && (
            <aside className="w-full lg:w-80 shrink-0 bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-5 backdrop-blur-md sticky top-6 shadow-xl space-y-4">
              <div className="flex justify-between items-center border-b border-zinc-800 pb-2.5">
                <h3 className="font-semibold text-sm text-zinc-200 flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-purple-400" />
                  Downloads Log
                </h3>
                <button
                  onClick={() => setDownloadStatus({})}
                  className="text-2xs text-zinc-500 hover:text-zinc-300 font-mono transition-colors"
                >
                  Clear Logs
                </button>
              </div>

              {/* Download List */}
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {Object.values(downloadStatus).map(status => {
                  const clip = clips.find(c => c.videoId === status.videoId);
                  const title = clip?.title || `Video ${status.videoId}`;

                  return (
                    <div
                      key={status.videoId}
                      className="p-3 bg-zinc-950/80 border border-zinc-850 rounded-xl space-y-2 text-xs"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-medium text-zinc-200 truncate flex-1" title={title}>
                          {title}
                        </span>
                        <a
                          href={`https://youtube.com/watch?v=${status.videoId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-zinc-650 hover:text-zinc-400 inline-flex"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      {/* Progress bar or info message */}
                      {status.status === 'downloading' && (
                        <div className="space-y-1.5">
                          <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-purple-500 h-full transition-all duration-300"
                              style={{ width: `${status.progress || 0}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-3xs font-mono text-purple-400 font-medium">
                            <span>Downloading...</span>
                            <span>{status.progress || 0}%</span>
                          </div>
                        </div>
                      )}

                      {status.status === 'queued' && (
                        <p className="text-3xs font-mono text-zinc-500">Queued in download sequence...</p>
                      )}

                      {status.status === 'done' && (
                        <div className="space-y-1 text-3xs font-mono text-emerald-400">
                          <p className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Saved successfully
                          </p>
                          {status.filePath && (
                            <p className="text-zinc-500 select-all truncate bg-zinc-900 px-1 py-0.5 rounded" title={status.filePath}>
                              {status.filePath}
                            </p>
                          )}
                        </div>
                      )}

                      {status.status === 'failed' && (
                        <div className="text-3xs font-mono text-red-400 space-y-1 leading-normal">
                          <p className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            Download failed
                          </p>
                          {status.error && (
                            <p className="text-zinc-500 bg-red-950/20 px-1 py-0.5 rounded break-words select-all max-h-16 overflow-y-auto">
                              {status.error}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </aside>
          )}

        </div>

      </div>

      {/* Floating Sticky Actions Bar (appears when items are selected) */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-800 shadow-2xl rounded-full px-5 py-3.5 flex items-center gap-5">
            <span className="text-sm font-semibold text-zinc-100 whitespace-nowrap">
              {selectedIds.size} {selectedIds.size === 1 ? 'clip' : 'clips'} selected
            </span>
            
            <div className="h-4.5 w-px bg-zinc-800" />

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full h-9 border-zinc-850 hover:bg-zinc-800 hover:border-zinc-700 text-zinc-200 text-xs font-semibold px-4 cursor-pointer"
                onClick={handleCopyUrls}
                disabled={isDownloading}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
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
                className="rounded-full h-9 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold px-4 shadow-lg shadow-purple-900/20 cursor-pointer"
                onClick={handleDownloadSelected}
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
    </div>
  );
}
