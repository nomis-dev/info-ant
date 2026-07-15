/**
 * @info-ant/logo-extractor — public API.
 *
 * Discover a website's brand logo(s) and favicons as absolute links, without a
 * headless browser and without downloading the images. Pure Node (fetch +
 * cheerio), so it runs in a Next.js Route Handler, an Express server, a script,
 * or the CLI.
 */

export {
  extractLogos,
  type LogoResult,
} from './extractor.js';

export {
  parseHtmlLogos,
  rankFavicons,
  rankLogos,
  type LogoCandidate,
  type LogoSource,
  type ParsedLogos,
} from './parse.js';

export {
  assertPublicUrl,
  parseHttpUrl,
  isPrivateAddress,
  UnsafeUrlError,
} from './ssrf.js';
