import * as cheerio from 'cheerio';

/**
 * A discovered logo or icon link, with enough provenance for a caller to rank
 * or filter. `url` is always absolute. `source` says how it was found; `rel` /
 * `type` / `sizes` carry the original HTML hints when present.
 */
export type LogoCandidate = {
  url: string;
  kind: 'logo' | 'favicon';
  source: LogoSource;
  rel?: string;
  type?: string;
  sizes?: string;
  alt?: string;
  /**
   * True when the element sits inside a link to the site root (`href="/"`,
   * `href="./"`, or an aria-label="home" anchor) — a strong signal that this is
   * the site's own brand mark rather than a third-party/showcase logo.
   */
  homeLink?: boolean;
  /**
   * Raw `<svg>…</svg>` markup, present only for inline-svg logos. For those
   * candidates `url` is a self-contained `data:image/svg+xml` URI built from
   * this markup, so `<img src={url}>` still works.
   */
  svg?: string;
};

export type LogoSource =
  | 'link-icon' // <link rel="icon" | "shortcut icon">
  | 'apple-touch-icon' // <link rel="apple-touch-icon">
  | 'mask-icon' // <link rel="mask-icon"> (Safari pinned tab)
  | 'manifest-icon' // icon listed in a web app manifest
  | 'og-image' // <meta property="og:image">
  | 'header-img' // <img> inside <header> / nav / .logo containers
  | 'svg-logo' // linked SVG (<a class="logo" href="logo.svg">)
  | 'inline-svg' // inline <svg> markup inside a logo container
  | 'css-bg-svg' // inline SVG in a CSS background-image: url(data:…) (e.g. Framer)
  | 'css-bg-img' // external image URL in a CSS background-image: url(https://…)
  | 'default-favicon'; // synthesized /favicon.ico fallback

export type ParsedLogos = {
  /** Header / brand logos, most-likely-first. */
  logos: LogoCandidate[];
  /** Favicons and touch icons, most-specific-first. */
  favicons: LogoCandidate[];
  /** Absolute URLs of any web app manifests referenced by the page. */
  manifestUrls: string[];
};

// Resolve a possibly-relative URL against the page; return null if unusable.
function absolutize(val: string | undefined, baseUrl: string): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (!trimmed || trimmed.startsWith('data:')) return null;
  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return null;
  }
}

// Heuristic: does this attribute soup look like a brand logo?
function looksLikeLogo(hay: string): boolean {
  return /\blogo\b|\bbrand\b|site-?title|site-?logo|navbar-brand/i.test(hay);
}

// Is `$el` inside an anchor pointing at the site root? The header logo almost
// always links home, while customer/showcase logos do not — a strong "this is
// the site's own mark" signal. baseUrl lets us recognize an absolute link back
// to the site root too.
function insideHomeLink($el: ReturnType<cheerio.CheerioAPI>, baseUrl: string): boolean {
  const $a = $el.closest('a');
  if (!$a.length) return false;
  const href = ($a.attr('href') ?? '').trim();
  const aria = ($a.attr('aria-label') ?? '').toLowerCase();
  if (/\bhome\b/.test(aria)) return true;
  if (href === '/' || href === './' || href === '') return true;
  try {
    const target = new URL(href, baseUrl);
    const base = new URL(baseUrl);
    return target.origin === base.origin && (target.pathname === '/' || target.pathname === '');
  } catch {
    return false;
  }
}

const MAX_INLINE_SVG_BYTES = 64 * 1024; // skip giant illustration/sprite SVGs

// Pack inline <svg> markup into a self-contained data: URI usable as an
// <img src>. Uses UTF-8-safe percent-encoding rather than base64 (smaller and
// keeps the SVG human-readable). Returns null if the markup is empty or too big.
function svgToDataUri(svg: string): string | null {
  const trimmed = svg.trim();
  if (!trimmed) return null;
  if (Buffer.byteLength(trimmed, 'utf-8') > MAX_INLINE_SVG_BYTES) return null;
  const encoded = encodeURIComponent(trimmed)
    .replace(/%20/g, ' ')
    .replace(/%3D/g, '=')
    .replace(/%3A/g, ':')
    .replace(/%2F/g, '/')
    .replace(/%22/g, "'");
  return `data:image/svg+xml,${encoded}`;
}

// Pull an `background-image: url(<data:image/svg+xml,…>)` out of a style
// attribute and normalize it into a usable data: URI. Returns { url, svg } or
// null. Some builders (Framer) HTML-escape the SVG (&lt; &gt; &quot;) and quote
// the url() with single/double/no quotes — handle all of it.
function svgFromCssBackground(style: string): { url: string; svg: string } | null {
  // Two shapes:
  //   url('data:…')  /  url("data:…")  — delimited by the quote, so the SVG may
  //                                       freely contain ')' (e.g. rgb(…)).
  //   url(data:…)                      — unquoted; match up to the final ')'.
  const quoted = style.match(
    /background-image\s*:\s*url\(\s*(['"])(data:image\/svg\+xml,.*?)\1\s*\)/is,
  );
  const unquoted = style.match(
    /background-image\s*:\s*url\(\s*(data:image\/svg\+xml,[^'"]*)\)/is,
  );
  const captured = quoted?.[2] ?? unquoted?.[1];
  if (!captured) return null;
  // Un-escape HTML entities the style attribute may carry.
  const raw = captured
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  // Recover the raw <svg> markup from the data URI payload for the `svg` field.
  const payload = raw.slice('data:image/svg+xml,'.length);
  let svg: string;
  try {
    svg = payload.startsWith('base64,')
      ? Buffer.from(payload.slice('base64,'.length), 'base64').toString('utf-8')
      : decodeURIComponent(payload);
  } catch {
    svg = payload;
  }
  if (!/<svg[\s>]/i.test(svg)) return null;
  const normalized = svgToDataUri(svg);
  return normalized ? { url: normalized, svg: svg.trim() } : null;
}

// Pull an *external* image URL out of a `background-image: url(…)` (or the
// `background:` shorthand) and absolutize it. Handles single/double/no quotes.
// Skips data: URIs — those belong to svgFromCssBackground. Returns an absolute
// URL or null. Some builders (Next, Framer) render the header wordmark this way:
// a <span style="background-image:url(https://…/logo.svg)"> inside the home link.
function urlFromCssBackground(style: string, baseUrl: string): string | null {
  const m = style.match(/background(?:-image)?\s*:[^;]*?url\(\s*(['"]?)([^'")]+)\1\s*\)/i);
  const raw = m?.[2]?.trim();
  if (!raw || raw.startsWith('data:')) return null;
  return absolutize(raw, baseUrl);
}

/**
 * Pure HTML parsing. Extracts header/brand logos and favicons from a page's
 * markup. No network I/O — manifest icons are surfaced as `manifestUrls` for
 * the caller to fetch separately (see extractLogos).
 *
 * baseUrl resolves relative hrefs and is also the origin used to synthesize the
 * conventional /favicon.ico fallback.
 */
export function parseHtmlLogos(html: string, baseUrl: string): ParsedLogos {
  const $ = cheerio.load(html);

  const favicons: LogoCandidate[] = [];
  const seenFavicon = new Set<string>();
  const pushFavicon = (c: LogoCandidate) => {
    if (seenFavicon.has(c.url)) return;
    seenFavicon.add(c.url);
    favicons.push(c);
  };

  // rel-based icons. rel can be multi-valued ("shortcut icon").
  $('link[rel]').each((_, el) => {
    const rel = ($(el).attr('rel') ?? '').toLowerCase();
    const href = absolutize($(el).attr('href'), baseUrl);
    if (!href) return;
    const tokens = rel.split(/\s+/);

    let source: LogoSource | null = null;
    if (tokens.includes('apple-touch-icon') || tokens.includes('apple-touch-icon-precomposed')) {
      source = 'apple-touch-icon';
    } else if (tokens.includes('mask-icon')) {
      source = 'mask-icon';
    } else if (tokens.includes('icon')) {
      source = 'link-icon';
    }
    if (!source) return;

    pushFavicon({
      url: href,
      kind: 'favicon',
      source,
      rel,
      type: $(el).attr('type') ?? undefined,
      sizes: $(el).attr('sizes') ?? undefined,
    });
  });

  // Web app manifests — icons live inside, fetched separately by the caller.
  const manifestUrls: string[] = [];
  $('link[rel~="manifest"]').each((_, el) => {
    const href = absolutize($(el).attr('href'), baseUrl);
    if (href && !manifestUrls.includes(href)) manifestUrls.push(href);
  });

  // Header / brand logos.
  const logos: LogoCandidate[] = [];
  const seenLogo = new Set<string>();
  const pushLogo = (c: LogoCandidate) => {
    if (seenLogo.has(c.url)) return;
    seenLogo.add(c.url);
    logos.push(c);
  };

  // <img> elements whose surrounding markup screams "logo": inside <header>,
  // nav, or an element with a logo-ish class/id/alt.
  $('header img, nav img, [class*="logo" i] img, [id*="logo" i] img, img[class*="logo" i], img[alt*="logo" i]').each(
    (_, el) => {
      const $el = $(el);
      const src = absolutize($el.attr('src') ?? $el.attr('data-src'), baseUrl);
      if (!src) return;
      const alt = $el.attr('alt') ?? undefined;
      pushLogo({ url: src, kind: 'logo', source: 'header-img', alt, homeLink: insideHomeLink($el, baseUrl) });
    },
  );

  // Linked SVGs used as logos (<img src="logo.svg"> already covered above;
  // also catch <a class="logo"><svg>… as a signal we found *a* logo, and
  // <object>/<use href> pointing at an svg).
  $('a[href][class*="logo" i], [class*="logo" i] a[href]').each((_, el) => {
    const href = absolutize($(el).attr('href'), baseUrl);
    if (href && /\.svg(\?|#|$)/i.test(href)) {
      pushLogo({ url: href, kind: 'logo', source: 'svg-logo' });
    }
  });

  // Inline <svg> logos: the graphics live in the HTML, not at a URL. Capture
  // the markup and expose it both as raw `svg` and a data: URI so callers can
  // render it without a second request. Scope to logo-ish containers to avoid
  // picking up decorative/icon SVGs.
  $('header svg, nav svg, [class*="logo" i] svg, [id*="logo" i] svg, a[aria-label*="home" i] svg, a[href="/"] svg').each(
    (_, el) => {
      const $el = $(el);
      const markup = $.html($el).trim();
      const dataUri = svgToDataUri(markup);
      if (!dataUri) return;
      const alt =
        $el.attr('aria-label') ??
        $el.find('title').first().text().trim() ??
        $el.closest('a').attr('aria-label') ??
        undefined;
      pushLogo({ url: dataUri, kind: 'logo', source: 'inline-svg', alt: alt || undefined, svg: markup, homeLink: insideHomeLink($el, baseUrl) });
    },
  );

  // CSS-background SVG logos: some page builders (Framer) render the logo as a
  // <div> whose graphic lives in `style="background-image:url(data:image/svg…)"`
  // — no <img>, no inline <svg>. Decorative icons use the same trick, so scope
  // strictly to the header, a logo-named container, or the homepage link.
  $(
    'header [style*="svg+xml" i], nav [style*="svg+xml" i], ' +
      '[class*="logo" i] [style*="svg+xml" i], [id*="logo" i] [style*="svg+xml" i], ' +
      '[data-framer-name*="logo" i] [style*="svg+xml" i], ' +
      'a[href="/"] [style*="svg+xml" i], a[href="./"] [style*="svg+xml" i], ' +
      'a[aria-label*="home" i] [style*="svg+xml" i]',
  ).each((_, el) => {
    const $el = $(el);
    const found = svgFromCssBackground($el.attr('style') ?? '');
    if (!found) return;
    const alt = $el.attr('aria-label') ?? $el.closest('a').attr('aria-label') ?? undefined;
    pushLogo({ url: found.url, kind: 'logo', source: 'css-bg-svg', alt: alt || undefined, svg: found.svg, homeLink: insideHomeLink($el, baseUrl) });
  });

  // CSS-background *external* image logos: same idea as css-bg-svg, but the
  // graphic lives at a URL (background-image: url(https://…/logo.svg)) instead
  // of inline. Hero/section backgrounds use this trick too, so scope strictly to
  // logo-named containers and the homepage link — never a bare <header>/<nav>,
  // which routinely carry full-bleed background images.
  $(
    '[class*="logo" i] [style*="background" i], [id*="logo" i] [style*="background" i], ' +
      '[data-framer-name*="logo" i] [style*="background" i], ' +
      'a[href="/"] [style*="background" i], a[href="./"] [style*="background" i], ' +
      'a[aria-label*="home" i] [style*="background" i]',
  ).each((_, el) => {
    const $el = $(el);
    const found = urlFromCssBackground($el.attr('style') ?? '', baseUrl);
    if (!found) return;
    const alt = $el.attr('aria-label') ?? $el.closest('a').attr('aria-label') ?? undefined;
    pushLogo({ url: found, kind: 'logo', source: 'css-bg-img', alt: alt || undefined, homeLink: insideHomeLink($el, baseUrl) });
  });

  // og:image is a decent last-resort brand image on many marketing pages.
  const ogImage = absolutize($('meta[property="og:image"]').attr('content'), baseUrl);
  if (ogImage) {
    pushLogo({ url: ogImage, kind: 'logo', source: 'og-image' });
  }

  return { logos: rankLogos(logos, baseUrl), favicons, manifestUrls };
}

// The registrable brand token, e.g. "https://www.github.com" -> "github".
function brandToken(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname.replace(/^www\./, '');
    const parts = host.split('.');
    // second-level label: github.com -> github, foo.co.uk -> foo
    return (parts.length >= 2 ? parts[parts.length - 2] : parts[0]) ?? '';
  } catch {
    return '';
  }
}

/**
 * Order logo candidates best-first. Prefers ones that name the site's own brand
 * (so a customer/partner logo in a showcase loses to the real header mark),
 * boosts explicit "logo" hints and SVGs, and pushes the og:image last-resort
 * to the bottom.
 */
export function rankLogos(logos: LogoCandidate[], baseUrl: string): LogoCandidate[] {
  const brand = brandToken(baseUrl).toLowerCase();
  const weight = (c: LogoCandidate): number => {
    // Match brand against the path + alt only — the absolute URL always
    // contains the host, which would make every candidate look on-brand. For
    // data-URI logos (inline-svg / css-bg-svg) the "url" is the whole graphic,
    // so ignore it and match on alt/aria-label only.
    const isDataUriLogo = c.source === 'inline-svg' || c.source === 'css-bg-svg';
    let path = '';
    if (!isDataUriLogo) {
      path = c.url;
      try {
        const u = new URL(c.url);
        path = u.pathname + u.search;
      } catch {
        /* keep raw */
      }
    }
    const alt = (c.alt ?? '').toLowerCase();
    const hay = `${path} ${alt}`.toLowerCase();
    let score = 0;
    if (c.homeLink) score += 1500; // inside the homepage link — the site's own mark
    // An alt/aria-label that literally says "logo" is the strongest explicit
    // intent signal — prefer it over a brand-name alt (e.g. alt="Logo" beats
    // alt="Acme" pointing at a wordmark), so it must outweigh the brand match
    // below. Word-boundary so "logotype" in a filename doesn't leak in via the
    // combined haystack.
    if (/\blogo\b/.test(alt)) score += 1100;
    if (brand && brand.length >= 3 && hay.includes(brand)) score += 1000; // own brand
    if (/\blogo\b/.test(path)) score += 200; // weaker: "logo" in the filename/path
    if (isDataUriLogo) score += 400; // real header mark, crisp + scalable
    if (/\.svg(\?|#|$)/i.test(c.url)) score += 100; // crisp, scalable
    if (c.source === 'header-img') score += 50;
    if (c.source === 'css-bg-img') score += 50; // external URL brand mark in a CSS bg
    if (c.source === 'og-image') score -= 500; // social card, last resort
    return score;
  };
  return [...logos].sort((a, b) => weight(b) - weight(a));
}

// Larger declared icon sizes sort first (e.g. "180x180" > "32x32").
function sizeScore(sizes: string | undefined): number {
  if (!sizes) return 0;
  if (/any/i.test(sizes)) return 1_000_000; // scalable
  let best = 0;
  for (const m of sizes.matchAll(/(\d+)\s*[x×]\s*(\d+)/gi)) {
    best = Math.max(best, Number(m[1]) * Number(m[2]));
  }
  return best;
}

/**
 * Order favicons best-first: apple-touch-icons and larger declared sizes win,
 * SVG/scalable icons are boosted, and the generic /favicon.ico fallback sinks
 * to the bottom.
 */
export function rankFavicons(favicons: LogoCandidate[]): LogoCandidate[] {
  const weight = (c: LogoCandidate): number => {
    let score = sizeScore(c.sizes);
    if (c.source === 'apple-touch-icon') score += 200_000; // usually crisp 180px
    if (c.type === 'image/svg+xml' || /\.svg(\?|#|$)/i.test(c.url)) score += 500_000;
    if (c.source === 'default-favicon') score -= 1_000_000;
    return score;
  };
  // Stable sort by descending weight.
  return [...favicons].sort((a, b) => weight(b) - weight(a));
}
