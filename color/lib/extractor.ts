import * as cheerio from 'cheerio';
import { Vibrant } from 'node-vibrant/node';
import { assertPublicUrl, UnsafeUrlError } from './ssrf.js';
import { extractColorsFromText, isLight, normalizeHex } from './color.js';

const USER_AGENT = 'Mozilla/5.0 (compatible; ColorExtractor/1.0; +https://example.com/bot)';
const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export type ExtractResult = {
  url: string;
  themeColor: string | null;
  primary: string | null;
  isLight: boolean;
  source: 'theme-color' | 'image' | 'css' | 'none';
  palette: Record<string, string | null>;
  cssColors: string[];
  imageUsed: string | null;
};

export type ParsedHtml = {
  themeColor: string | null;
  imageCandidates: string[];
  cssColors: string[];
};

/**
 * Pure HTML parsing. Extracts the declared theme-color, ordered image
 * candidates (og:image > twitter:image > apple-touch-icon > icon), and the
 * highest-frequency CSS colors. baseUrl is used to resolve relative image URLs.
 */
export function parseHtmlColors(html: string, baseUrl: string): ParsedHtml {
  const $ = cheerio.load(html);

  const rawTheme = $('meta[name="theme-color"]').attr('content');
  const themeColor = rawTheme ? normalizeHex(rawTheme) : null;

  const candidates: string[] = [];
  const push = (val: string | undefined) => {
    if (!val) return;
    try {
      candidates.push(new URL(val, baseUrl).href);
    } catch {
      /* ignore unresolvable urls */
    }
  };
  push($('meta[property="og:image"]').attr('content'));
  push($('meta[name="twitter:image"]').attr('content'));
  push($('link[rel="apple-touch-icon"]').attr('href'));
  push($('link[rel~="icon"]').attr('href'));

  // De-duplicate while preserving priority order.
  const imageCandidates = [...new Set(candidates)];

  // CSS fallback: scan inline <style> blocks plus style="" attributes.
  let styleText = '';
  $('style').each((_, el) => {
    styleText += $(el).text() + '\n';
  });
  $('[style]').each((_, el) => {
    styleText += ($(el).attr('style') ?? '') + '\n';
  });
  const cssColors = extractColorsFromText(styleText);

  return { themeColor, imageCandidates, cssColors };
}

type Deps = {
  fetchImpl?: typeof fetch;
  resolver?: (host: string) => Promise<string>;
};

function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(t) };
}

// How to handle a body that exceeds maxBytes:
//   'throw'    — reject (correct for images: a truncated image corrupts palette extraction)
//   'truncate' — keep the first maxBytes and continue (fine for HTML/CSS color scanning)
type OverflowMode = 'throw' | 'truncate';

async function fetchLimited(
  url: string,
  maxBytes: number,
  fetchImpl: typeof fetch,
  overflow: OverflowMode = 'throw',
): Promise<{ buffer: Buffer; contentType: string; truncated: boolean }> {
  const { signal, clear } = timeoutSignal(FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal,
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT },
    });
    if (!res.ok) throw new Error(`upstream responded ${res.status}`);

    const declared = Number(res.headers.get('content-length') ?? '0');
    if (overflow === 'throw' && declared > maxBytes) {
      throw new Error('response too large');
    }

    const { buffer, truncated } = await readCapped(res, maxBytes);
    if (overflow === 'throw' && truncated) {
      throw new Error('response too large');
    }

    return {
      buffer,
      contentType: res.headers.get('content-type') ?? '',
      truncated,
    };
  } finally {
    clear();
  }
}

// Read a response body into a Buffer, stopping once maxBytes is reached.
// Falls back to arrayBuffer() when the body isn't a readable stream (e.g. mocks).
async function readCapped(
  res: Response,
  maxBytes: number,
): Promise<{ buffer: Buffer; truncated: boolean }> {
  const body = res.body;
  if (!body?.getReader) {
    const arr = new Uint8Array(await res.arrayBuffer());
    if (arr.byteLength > maxBytes) {
      return { buffer: Buffer.from(arr.subarray(0, maxBytes)), truncated: true };
    }
    return { buffer: Buffer.from(arr), truncated: false };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = maxBytes - total;
      if (value.byteLength >= remaining) {
        chunks.push(value.subarray(0, remaining));
        total += remaining;
        truncated = true;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  return { buffer: Buffer.concat(chunks, total), truncated };
}

async function extractPalette(buffer: Buffer): Promise<Record<string, string | null>> {
  const swatches = await Vibrant.from(buffer).getPalette();
  const out: Record<string, string | null> = {};
  for (const [name, sw] of Object.entries(swatches)) {
    out[name] = sw?.hex ?? null;
  }
  return out;
}

/**
 * Full pipeline: fetch page -> parse -> pick a primary color from theme-color,
 * then image palette, then CSS frequency. Every outbound URL is SSRF-checked.
 */
export async function extractColors(rawUrl: string, deps: Deps = {}): Promise<ExtractResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;

  const url = await assertPublicUrl(rawUrl, deps.resolver);
  const { buffer } = await fetchLimited(url.href, MAX_HTML_BYTES, fetchImpl, 'truncate');
  const html = buffer.toString('utf-8');

  const { themeColor, imageCandidates, cssColors } = parseHtmlColors(html, url.href);

  let palette: Record<string, string | null> = {};
  let imageUsed: string | null = null;

  // Only try to derive a color from an image if theme-color is absent, but
  // still expose the palette when available for richer clients.
  for (const candidate of imageCandidates) {
    try {
      await assertPublicUrl(candidate, deps.resolver); // re-check each image URL
      const { buffer: imgBuf } = await fetchLimited(candidate, MAX_IMAGE_BYTES, fetchImpl);
      palette = await extractPalette(imgBuf);
      imageUsed = candidate;
      break;
    } catch (e) {
      if (e instanceof UnsafeUrlError) continue; // skip unsafe image, try next
      // Network/decoding failure on this candidate — fall through to next.
    }
  }

  const paletteVibrant = palette.Vibrant ?? palette.DarkVibrant ?? palette.Muted ?? null;

  let primary: string | null;
  let source: ExtractResult['source'];
  if (themeColor) {
    primary = themeColor;
    source = 'theme-color';
  } else if (paletteVibrant) {
    primary = paletteVibrant;
    source = 'image';
  } else if (cssColors.length > 0) {
    primary = cssColors[0];
    source = 'css';
  } else {
    primary = null;
    source = 'none';
  }

  return {
    url: url.href,
    themeColor,
    primary,
    isLight: primary ? isLight(primary) : false,
    source,
    palette,
    cssColors,
    imageUsed,
  };
}

/**
 * Fetch a text resource (HTML or CSS) through the SSRF guard + size cap.
 * Exposed for the design-doc generator which needs raw stylesheet text.
 */
export async function fetchText(rawUrl: string, deps: Deps = {}): Promise<string> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const url = await assertPublicUrl(rawUrl, deps.resolver);
  const { buffer } = await fetchLimited(url.href, MAX_HTML_BYTES, fetchImpl, 'truncate');
  return buffer.toString('utf-8');
}
