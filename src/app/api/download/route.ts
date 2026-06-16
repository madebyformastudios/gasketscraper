import { NextRequest, NextResponse } from 'next/server';
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { DownloadRequest } from '@/lib/types';

// Regular expression to safely validate YouTube video IDs
const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export async function POST(req: NextRequest) {
  try {
    // 1. Check if yt-dlp is available in the system PATH
    try {
      execSync('yt-dlp --version', { stdio: 'ignore' });
    } catch {
      return NextResponse.json(
        {
          error:
            'yt-dlp is not installed or not available in the system PATH.\n\n' +
            'Please install it and ensure it is available (e.g. run "brew install yt-dlp ffmpeg" on macOS).\n' +
            'Note: ffmpeg is also required for yt-dlp to merge audio and video streams for 1080p quality.',
        },
        { status: 500 }
      );
    }

    const body: DownloadRequest = await req.json();
    const { videoIds, quality } = body;

    if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
      return NextResponse.json(
        { error: 'A list of video IDs is required.' },
        { status: 400 }
      );
    }

    // Sanitize and validate video IDs
    for (const id of videoIds) {
      if (!YOUTUBE_ID_REGEX.test(id)) {
        return NextResponse.json(
          { error: `Invalid video ID format detected: "${id}". Only standard YouTube video IDs are permitted.` },
          { status: 400 }
        );
      }
    }

    // 2. Setup download directory
    const downloadDir = path.resolve(/*turbopackIgnore: true*/ process.env.DOWNLOAD_DIR || './downloads');
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    // 3. Setup Streaming Response (SSE)
    const responseStream = new TransformStream();
    const writer = responseStream.writable.getWriter();
    const encoder = new TextEncoder();

    // Map quality selector to corresponding yt-dlp format options
    let formatString = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
    if (quality === '720p') {
      formatString = 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=720]/best';
    } else if (quality === 'best available') {
      formatString = 'bestvideo+bestaudio/best';
    }

    // Perform downloads sequentially in the background
    (async () => {
      try {
        for (const videoId of videoIds) {
          // Send "started/queued" status
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({ videoId, status: 'downloading', progress: 0 })}\n\n`
            )
          );

          try {
            const filePath = await new Promise<string>((resolve, reject) => {
              const args = [
                '-f',
                formatString,
                '-o',
                '%(title)s [%(id)s].%(ext)s',
                '--paths',
                downloadDir,
                `https://www.youtube.com/watch?v=${videoId}`,
              ];

              const child = spawn('yt-dlp', args);
              let errorOutput = '';
              let detectedPath = '';
              let lastPercent = 0;

              child.stdout.on('data', async (data) => {
                const text = data.toString();

                // Extract merged file path
                const mergerMatch = text.match(/Merging formats into "([^"]+)"/);
                if (mergerMatch) {
                  detectedPath = mergerMatch[1];
                } else {
                  // Extract downloaded file path if already merged or single stream
                  const destMatch = text.match(/Destination:\s*(.+)/);
                  if (destMatch && !destMatch[1].endsWith('.temp') && !destMatch[1].includes('.f')) {
                    detectedPath = destMatch[1].trim();
                  } else {
                    const alreadyMatch = text.match(/\[download\]\s*(.+?)\s*has already been downloaded/);
                    if (alreadyMatch) {
                      detectedPath = alreadyMatch[1].trim();
                    }
                  }
                }

                // Parse progress percentage
                const progressMatch = text.match(/\[download\]\s+(\d+\.\d+)%/);
                if (progressMatch) {
                  const percent = Math.round(parseFloat(progressMatch[1]));
                  if (percent !== lastPercent) {
                    lastPercent = percent;
                    // Send progress update to client
                    writer.write(
                      encoder.encode(
                        `data: ${JSON.stringify({ videoId, status: 'downloading', progress: percent })}\n\n`
                      )
                    ).catch(() => {});
                  }
                }
              });

              child.stderr.on('data', (data) => {
                errorOutput += data.toString();
              });

              child.on('close', (code) => {
                if (code === 0) {
                  // If path is absolute, try to make it relative/friendly or keep it
                  const finalPath = detectedPath
                    ? path.relative(/*turbopackIgnore: true*/ process.cwd(), detectedPath)
                    : path.join(path.relative(/*turbopackIgnore: true*/ process.cwd(), downloadDir), `[Video ${videoId}].mp4`);
                  resolve(finalPath);
                } else {
                  reject(new Error(errorOutput || `yt-dlp process exited with code ${code}`));
                }
              });
            });

            // Send success event
            await writer.write(
              encoder.encode(
                `data: ${JSON.stringify({ videoId, status: 'done', filePath })}\n\n`
              )
            );
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : 'Download failed during yt-dlp execution.';
            console.error(`Error downloading video ${videoId}:`, err);
            // Send failure event
            await writer.write(
              encoder.encode(
                `data: ${JSON.stringify({
                  videoId,
                  status: 'failed',
                  error: errorMsg,
                })}\n\n`
              )
            );
          }
        }
      } catch (streamErr) {
        console.error('Error during download stream processing:', streamErr);
      } finally {
        writer.close().catch(() => {});
      }
    })();

    return new NextResponse(responseStream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'An unexpected error occurred during downloader setup.';
    console.error('Error in download route handler:', error);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
