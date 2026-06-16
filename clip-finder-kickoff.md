# Clip Finder — Kickoff Spec

## Goal
Build a single-page **locally-run** internal tool that, given **one car model**, returns a shortlist of candidate YouTube clips (16:9 long-form source footage) and lets me download the selected ones — so I can stop manually searching for hours. I clip and reframe the downloaded footage myself in my editor; the tool downloads **raw, unedited** source files only.

## Build in two milestones
1. **Milestone 1 — Finder:** search + results + caching. Build and verify this first.
2. **Milestone 2 — Download:** download selected clips via yt-dlp. Add this on top once Milestone 1 is verified working.

This tool runs only on my local machine (`next dev`), never deployed — so server-side code may use the filesystem and spawn local processes.

## Tech stack
- Next.js (App Router) + TypeScript (strict mode)
- Tailwind CSS + shadcn/ui
- No database (in-memory cache only)
- Data source: YouTube Data API v3
- Milestone 2 only: `yt-dlp` invoked via Node `child_process` (must be installed on the machine; `ffmpeg` too, used by yt-dlp to merge audio/video streams — **not** for any editing)

## In scope (build this)
**Milestone 1 — Finder**
1. A search page with one text input (car model) plus filter controls.
2. A server-side route handler `POST /api/search` that calls the YouTube Data API and returns normalized results.
3. In-memory caching of search results to save quota.
4. A results grid of clip cards.
5. Client-side selection + a "copy selected URLs" action (no persistence).

**Milestone 2 — Download**
6. A server-side route handler `POST /api/download` that downloads the selected videos via yt-dlp to a local folder (see Download section).
7. A "Download selected" button + basic per-item status in the UI.

## Explicitly OUT of scope — do NOT build
- **No editing of the downloaded files whatsoever** — no aspect-ratio conversion, no 16:9→9:16 reframing, no trimming/clipping, no re-encoding for style. Downloads are raw source files; I edit them myself.
- No database / Supabase / persistence.
- No authentication.
- No deployment config (this runs locally only).

Keep the surface area small.

## YouTube API integration (quota matters — read carefully)
Use **two** calls per search, never more:
1. `search.list` — `part=snippet`, `type=video`, `q=<model>`. Returns video IDs + snippet. Costs **100 quota units**.
2. `videos.list` — `part=contentDetails,statistics,snippet`, `id=<comma-joined IDs>`. Enriches all results with duration + view count in **one** call (1 unit, up to 50 IDs). Do **not** call `videos.list` per video.

### API key handling
- Read the key from `process.env.YOUTUBE_API_KEY` **inside the route handler only**.
- The key must **never** reach the client. All YouTube calls happen server-side.
- Create `.env.example` containing `YOUTUBE_API_KEY=` and add `.env.local` to `.gitignore`.

### Filter → API param mapping
- `duration`: any | short | medium | long → `videoDuration` (short < 4 min, medium 4–20 min, long > 20 min)
- `uploadedWithin`: any | year | month → compute an ISO `publishedAfter` timestamp
- `sort`: relevance | date | views → `order` (relevance | date | viewCount)
- `maxResults`: 25

## Data shape
```ts
type Clip = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  publishedAt: string;       // ISO
  durationSeconds: number;
  durationLabel: string;     // "12:34" or "1:02:33"
  viewCount: number;
  url: string;               // https://www.youtube.com/watch?v=<id>
};
```
Parse the ISO 8601 duration (`PT#M#S`) into seconds, then format a `mm:ss` / `h:mm:ss` label.

## Caching
- A module-level `Map` in the route handler, keyed on a normalized hash of `query + all filters`.
- TTL ~24h. On a cache hit, return the cached results and skip the API call entirely.
- Include a boolean `cached` in the response so the UI can show a small indicator.
- In-memory cache resetting on server restart is acceptable for this MVP.

## UI
**Search bar row:** text input + duration `Select` + upload-date `Select` + sort `Select` + Search button. Show a loading state while fetching.

**Results:** responsive grid (1–3 columns). Each `Card` shows:
- 16:9 thumbnail
- title (clamp to 2 lines)
- channel name
- a duration badge, view count, and relative published date
- an external link "Open on YouTube"
- a selection checkbox/toggle (client state) to add the clip to the current selection

**Selection bar:** with the current selection, offer two actions:
- "Copy N selected URLs" — copies the newline-joined watch URLs to the clipboard.
- "Download N selected" — calls `POST /api/download` (Milestone 2). Show a per-item status (queued / downloading / done / failed).

Include sensible empty and error states (e.g. no API key, quota exceeded, no results).

## Download (Milestone 2)
A route handler `POST /api/download` receives the selected video IDs and downloads each via yt-dlp. This is server-side and local-only, so spawning a process and writing files is fine.

- Spawn `yt-dlp` with Node `child_process` (`spawn`, not `exec`, so output can stream).
- Target folder: read from `process.env.DOWNLOAD_DIR`, default to `./downloads` (create it if missing; add `downloads/` to `.gitignore`).
- Format: download a single best-quality MP4 up to 1080p. Suggested format string: `bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best`, output template `%(title)s [%(id)s].%(ext)s`.
- **Download the full source video as-is. Do NOT trim, cut sections, reframe, or re-encode.** I handle all of that in my editor.
- Preconditions: before downloading, check that `yt-dlp` is available on PATH. If not, return a clear error telling me to install it (and note that `ffmpeg` is required for merging 1080p streams).
- Report status per video back to the UI (success/failure + final file path or error message). Awaiting each download sequentially is fine for the MVP; do not over-engineer a queue.

Security note: only ever pass through video IDs that came from a prior `/api/search` result shape — never interpolate raw user strings straight into the spawned command. Pass arguments as an array to `spawn` (no shell string concatenation).

## Acceptance criteria (verify in the browser)
**Milestone 1**
- Entering a model returns up to 25 results, each with thumbnail / title / channel / duration / views / link.
- Changing any filter changes the results.
- Re-running the identical search uses the cache (`cached: true`, no second API call).
- The browser network tab shows **no API key** in any request — calls go to `/api/search`, not to googleapis.com.
- Selecting clips and clicking "Copy selected URLs" places the correct URLs on the clipboard.

**Milestone 2**
- Clicking "Download selected" writes the chosen videos to the download folder as raw MP4 files.
- Each item shows a status that resolves to done or a clear error.
- With yt-dlp not installed, the UI shows an actionable error instead of failing silently.
- Downloaded files are untouched source video — no trimming or reframing has been applied.

## Conventions
- Strict TypeScript, no `any`. Handle API errors and return a proper HTTP status plus a typed error body.
- Follow the rules in `.agents/rules/stack.md`.
