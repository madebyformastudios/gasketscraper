import { NextRequest, NextResponse } from 'next/server';
import { getCachedSuggestion, setCachedSuggestion } from '@/lib/cache';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API Key is not configured. Please add GEMINI_API_KEY to your .env.local file.' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { model } = body;

    if (!model || typeof model !== 'string' || model.trim() === '') {
      return NextResponse.json(
        { error: 'Car model parameter is required.' },
        { status: 400 }
      );
    }

    const normalizedModel = model.trim();

    // Check disk cache first
    const cachedHashtags = getCachedSuggestion(normalizedModel, 'hashtags');
    if (cachedHashtags !== null) {
      return NextResponse.json({
        hashtags: cachedHashtags,
        cached: true,
      });
    }

    // Call Gemini API (Free tier gemini-2.5-flash)
    const prompt = `Generate a ranked list of relevant Instagram hashtags for the car model: "${normalizedModel}".
Include:
1. Model-specific tags (e.g., #gt3rs, #porsche911gt3rs)
2. Brand tags (e.g., #porsche, #porsche911)
3. Scene/community tags (e.g., #stance, #jdm, #trackday, #supercars where relevant)
4. Dutch-language variants (e.g., #dutchcars, #autospotter, #nederlandseauto where relevant)

Return the output as a JSON array of strings, for example:
[
  "#hashtag1",
  "#hashtag2"
]
Do not include any code block formatting or markdown wrappers in your output.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Gemini API returned status ${response.status}: ${errorText}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Strip markdown code fences if present (defense in depth)
    if (text.startsWith('```')) {
      text = text.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '');
    }

    let hashtags: string[] = [];
    try {
      if (text) {
        const parsed = JSON.parse(text.trim());
        if (Array.isArray(parsed)) {
          hashtags = parsed.map(h => typeof h === 'string' ? h.trim() : '').filter(Boolean);
        }
      }
    } catch (e) {
      console.error('Error parsing Gemini JSON response, running fallback regex:', e);
      // Fallback regex match for hashtag candidates
      const matches = text.match(/#\w+/g);
      if (matches) {
        hashtags = Array.from(new Set(matches));
      }
    }

    // If we parsed successfully, save to cache
    if (hashtags.length > 0) {
      setCachedSuggestion(normalizedModel, 'hashtags', hashtags);
    }

    return NextResponse.json({
      hashtags,
      cached: false,
    });

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'An unexpected error occurred during suggestion generation.';
    console.error('Error in suggest-hashtags route:', error);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
