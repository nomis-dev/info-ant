import { extractColors, type ExtractResult } from './extractor.js';
import { UnsafeUrlError } from './ssrf.js';

/**
 * Framework-agnostic request handling for the color extractor.
 *
 * Next.js App Router route handlers receive and return the Web-standard
 * `Request`/`Response`, so `createColorHandler()` plugs straight into a route
 * with no `next` dependency:
 *
 *   // app/api/colors/route.ts
 *   import { createColorHandler } from 'colorextractor/handler';
 *   export const runtime = 'nodejs'; // sharp is a native module
 *   export const GET = createColorHandler();
 *
 * It works equally well anywhere the Fetch API `Request`/`Response` exist
 * (Node 18+, Bun, Deno, Hono, etc.).
 */

export type HandlerResult = {
  status: number;
  body: ExtractResult | { error: string };
};

const CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400';

type ExtractFn = typeof extractColors;

/**
 * Core logic decoupled from any transport: takes a target URL (or null) and
 * returns a status + JSON body. Useful for testing or non-Fetch frameworks.
 */
export async function extractColorsResponse(
  target: string | null,
  extract: ExtractFn = extractColors,
): Promise<HandlerResult> {
  if (!target) {
    return { status: 400, body: { error: 'missing url query parameter' } };
  }

  try {
    const result = await extract(target);
    return { status: 200, body: result };
  } catch (e) {
    if (e instanceof UnsafeUrlError) {
      return { status: 400, body: { error: e.message } };
    }
    return { status: 502, body: { error: 'failed to extract colors' } };
  }
}

export type CreateColorHandlerOptions = {
  /** Query parameter to read the target URL from. Defaults to "url". */
  param?: string;
  /** Override the extractor (e.g. to inject deps in tests). */
  extract?: ExtractFn;
};

/**
 * Build a `(req: Request) => Promise<Response>` handler. Successful responses
 * carry a cache-control header suitable for CDN caching.
 */
export function createColorHandler(
  options: CreateColorHandlerOptions = {},
): (req: Request) => Promise<Response> {
  const param = options.param ?? 'url';
  const extract = options.extract ?? extractColors;

  return async (req: Request): Promise<Response> => {
    const target = new URL(req.url).searchParams.get(param);
    const { status, body } = await extractColorsResponse(target, extract);

    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (status === 200) headers['cache-control'] = CACHE_CONTROL;

    return new Response(JSON.stringify(body), { status, headers });
  };
}
