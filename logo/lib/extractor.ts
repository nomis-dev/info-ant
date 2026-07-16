import { assertPublicUrl, UnsafeUrlError } from './ssrf.js';
import {
  parseHtmlLogos,
  rankFavicons,
  type LogoCandidate,
  type ParsedLogos,
} from './parse.js';

const USER_AGENT = 'Mozilla/5.0 (compatible; LogoExtractor/1.0; +https://example.com/bot)';
const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_MANIFEST_BYTES = 512 * 1024; // 512 KB
const MAX_MANIFESTS = 2;

export type LogoResult = {
  url: string;
  /** Best single logo guess, or null if none was found. */
  logo: string | null;
  /** Best single favicon guess (highest resolution / most specific). */
  favicon: string | null;
  /** All header/brand logo candidates, most-likely-first. */
  logos: LogoCandidate[];
  /** All favicon/touch-icon candidates, best-first (see rankFavicons). */
  favicons: LogoCandidate[];
};

type Deps = {
  fetchImpl?: typeof fetch;
  resolver?: (host: string) => Promise<string>;
};

function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(t) };
}

// Fetch text (HTML/JSON) through the SSRF guard with a byte cap.
async function fetchTextCapped(
  url: string,
  maxBytes: number,
  fetchImpl: typeof fetch,
): Promise<string> {
  const { signal, clear } = timeoutSignal(FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal,
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT },
    });
    if (!res.ok) throw new Error(`upstream responded ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.subarray(0, maxBytes).toString('utf-8');
  } finally {
    clear();
  }
}

// Matches a CSS custom-property reference, e.g. `var(--brand-color)`. Inline-svg
// / css-bg-svg logos are data: URIs that embed the markup verbatim; if that
// markup styles itself with `var(--…)` it depends on the page's stylesheet,
// which the extracted URI no longer carries — so it renders blank in isolation.
const CSS_VAR_REF = /var\(\s*--/i;

// Guard for the single best-logo guess. A real http(s) URL is always usable.
// A non-URL logo (a data: URI built from inline SVG) is rejected when its
// content references CSS variables, since it can't render on its own.
function isUsableSingleLogo(candidate: LogoCandidate): boolean {
  if (/^https?:\/\//i.test(candidate.url)) return true;
  // Prefer the raw SVG markup; fall back to the (percent-encoded) data URI,
  // decoding it so an encoded `var(--…)` is still caught.
  let content = candidate.svg;
  if (!content) {
    try {
      content = decodeURIComponent(candidate.url);
    } catch {
      content = candidate.url;
    }
  }
  return !CSS_VAR_REF.test(content);
}

type ManifestIcon = { src?: string; sizes?: string; type?: string };
type Manifest = { icons?: ManifestIcon[] };

// Parse manifest JSON into favicon candidates. Never throws.
function iconsFromManifest(json: string, manifestUrl: string): LogoCandidate[] {
  let parsed: Manifest;
  try {
    parsed = JSON.parse(json) as Manifest;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed.icons)) return [];
  const out: LogoCandidate[] = [];
  for (const icon of parsed.icons) {
    if (!icon?.src) continue;
    let abs: string;
    try {
      abs = new URL(icon.src, manifestUrl).href;
    } catch {
      continue;
    }
    out.push({
      url: abs,
      kind: 'favicon',
      source: 'manifest-icon',
      sizes: icon.sizes,
      type: icon.type,
    });
  }
  return out;
}

/**
 * Full pipeline: fetch a page, extract header logos + favicons from its markup,
 * pull any web-app-manifest icons, and synthesize the conventional
 * /favicon.ico fallback. Every outbound URL is SSRF-checked before fetching.
 *
 * Returns absolute links only — images are never downloaded or decoded, so this
 * stays lightweight (no sharp / image codecs).
 */
export async function extractLogos(rawUrl: string, deps: Deps = {}): Promise<LogoResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;

  const url = await assertPublicUrl(rawUrl, deps.resolver);
  const html = await fetchTextCapped(url.href, MAX_HTML_BYTES, fetchImpl);

  const parsed: ParsedLogos = parseHtmlLogos(html, url.href);
  const favicons = [...parsed.favicons];

  // Fetch referenced manifests (bounded) and fold in their icons.
  for (const manifestUrl of parsed.manifestUrls.slice(0, MAX_MANIFESTS)) {
    try {
      await assertPublicUrl(manifestUrl, deps.resolver);
      const json = await fetchTextCapped(manifestUrl, MAX_MANIFEST_BYTES, fetchImpl);
      favicons.push(...iconsFromManifest(json, manifestUrl));
    } catch (e) {
      if (e instanceof UnsafeUrlError) continue;
      // network/parse failure — skip this manifest, keep going
    }
  }

  // Conventional /favicon.ico always exists as a last resort.
  const defaultFavicon = new URL('/favicon.ico', url.href).href;
  if (!favicons.some((f) => f.url === defaultFavicon)) {
    favicons.push({ url: defaultFavicon, kind: 'favicon', source: 'default-favicon' });
  }

  const rankedFavicons = rankFavicons(favicons);

  const bestLogo = parsed.logos[0] ?? null;

  return {
    url: url.href,
    logo: bestLogo && isUsableSingleLogo(bestLogo) ? bestLogo.url : null,
    favicon: rankedFavicons[0]?.url ?? null,
    logos: parsed.logos,
    favicons: rankedFavicons,
  };
}
