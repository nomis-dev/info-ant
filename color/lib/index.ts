/**
 * colorextractor — public API.
 *
 * Extract a website's color palette and design tokens without a headless
 * browser. Everything here is pure Node (fetch + cheerio + node-vibrant), so it
 * runs in a Next.js Route Handler, an Express server, a script, or the CLI.
 */

export {
  extractColors,
  fetchText,
  parseHtmlColors,
  type ExtractResult,
  type ParsedHtml,
} from './extractor.js';

export {
  extractDesign,
  buildDesignMarkdown,
  type DesignResult,
  type DesignTokens,
} from './design.js';

export {
  extractSemanticColors,
  type SemanticColors,
  type ColorVote,
} from './semantic.js';

export {
  assertPublicUrl,
  parseHttpUrl,
  isPrivateAddress,
  UnsafeUrlError,
} from './ssrf.js';

export {
  normalizeHex,
  hexToRgb,
  rgbToHex,
  luminance,
  isLight,
  extractColorsFromText,
  type Rgb,
} from './color.js';

export {
  createColorHandler,
  extractColorsResponse,
  type HandlerResult,
} from './handler.js';
