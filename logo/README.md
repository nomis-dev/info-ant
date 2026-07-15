# info-ant/logo

Discover a website's **brand logo and favicon links** — without a headless
browser and **without downloading the images**. It fetches the page HTML, reads
the markup, folds in any web-app-manifest icons, and returns ranked, absolute
URLs.

Pure Node (fetch + cheerio). No framework dependency, no native image codecs —
drop it into a Next.js app, an Express server, a script, or use the CLI. Sibling
toolkit to [`info-ant/color`](../color).

## What it finds

| Result field | Sources |
|---|---|
| `logo` / `logos[]` | `<img>` inside `<header>`/`<nav>`/`.logo` containers, **inline `<svg>` logos**, linked SVG logos, `og:image` (last resort) |
| `favicon` / `favicons[]` | `<link rel="icon">`, `apple-touch-icon`, `mask-icon`, web-app-manifest icons, and the conventional `/favicon.ico` fallback |

Favicons are ranked best-first (SVG > large `apple-touch-icon` > declared
sizes; generic `/favicon.ico` sinks last). Logos are ranked to prefer the site's
own brand (a customer logo in a showcase loses to the real header mark).

### Inline SVG logos

Many sites (Stripe, GitHub, …) render their header logo as an **inline
`<svg>`** — there's no image URL to link to. For those, `info-ant/logo` reads
the SVG graphics straight out of the HTML and returns them in two forms on the
candidate:

- `svg` — the raw `<svg>…</svg>` markup (render it inline)
- `url` — a self-contained `data:image/svg+xml,…` URI, so `<img src={url}>` and
  the top-level `logo` field still Just Work

Inline SVGs are only picked up inside logo-ish containers (`<header>`/`<nav>` /
`.logo` / the homepage link), and anything larger than 64 KB is skipped to avoid
pulling in illustration or sprite sheets.

> **Note:** this extracts *links*. Sites that render their header logo as an
> **inline `<svg>`** (no `src`) — e.g. Stripe, GitHub — expose no URL to return;
> for those the `logo` field falls back to other candidates while `favicon`
> still resolves cleanly. Favicon detection is reliable across essentially all
> sites.

## Install

```bash
npm install info-ant
```

Requires Node 18.17+. No native modules — runs anywhere Node's `fetch` exists
(Node, Bun, Deno).

## Library usage

```ts
import { extractLogos } from 'info-ant/logo';

const result = await extractLogos('https://vercel.com');
console.log(result.logo);    // best header-logo link (or null)
console.log(result.favicon); // best favicon link
```

`LogoResult`:

```json
{
  "url": "https://vercel.com/",
  "logo": "https://vercel.com/assets/logo.svg",
  "favicon": "https://vercel.com/apple-touch-icon.png",
  "logos": [
    { "url": "https://vercel.com/assets/logo.svg", "kind": "logo", "source": "header-img", "alt": "Vercel logo" }
  ],
  "favicons": [
    { "url": "https://vercel.com/apple-touch-icon.png", "kind": "favicon", "source": "apple-touch-icon", "sizes": "180x180" },
    { "url": "https://vercel.com/favicon.ico", "kind": "favicon", "source": "default-favicon" }
  ]
}
```

`source` on each candidate tells you how it was found: `link-icon` |
`apple-touch-icon` | `mask-icon` | `manifest-icon` | `og-image` | `header-img` |
`svg-logo` | `default-favicon`.

### Pure parsing (no network)

```ts
import { parseHtmlLogos } from 'info-ant/logo';

const { logos, favicons, manifestUrls } = parseHtmlLogos(html, 'https://acme.com');
```

## Next.js usage

Ships a framework-agnostic handler built on the Web-standard `Request`/`Response`,
which is exactly what Next.js App Router route handlers use — no `next` import:

```ts
// app/api/logo/route.ts
import { createLogoHandler } from 'info-ant/logo/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createLogoHandler();
```

Then:

```
GET /api/logo?url=https://vercel.com
```

Need custom behavior? Use the transport-free core:

```ts
import { extractLogosResponse } from 'info-ant/logo/handler';

const { status, body } = await extractLogosResponse(targetUrl);
```

## CLI

```bash
npx --package=info-ant logoextractor https://vercel.com            # full JSON
npx --package=info-ant logoextractor https://vercel.com --logo     # best logo link only
npx --package=info-ant logoextractor https://vercel.com --favicon  # best favicon link only
npx --package=info-ant logoextractor https://vercel.com -o out.json
```

> After install the `logoextractor` bin is on your `PATH`:
> `logoextractor https://vercel.com --favicon`.

## Security (SSRF)

Because the target URL is user-supplied, every outbound fetch is guarded:

- Rejects non-`http(s)` URLs and any host resolving to a
  private/loopback/link-local/reserved IP (blocks SSRF to `169.254.169.254`,
  internal services, etc.). Referenced manifests are re-checked before fetching.
- 8s fetch timeout, 2 MB HTML cap, 512 KB manifest cap, at most 2 manifests.

## API surface

| Export | Responsibility |
|---|---|
| `extractLogos(url, deps?)` | Full pipeline → `LogoResult` |
| `parseHtmlLogos(html, baseUrl)` | Pure HTML → logo + favicon candidates |
| `rankFavicons(list)` / `rankLogos(list, baseUrl)` | Ordering heuristics |
| `createLogoHandler(opts?)` | `(Request) => Response` for Next.js / Fetch frameworks |
| `extractLogosResponse(url)` | Transport-free `{ status, body }` |
| `assertPublicUrl`, `UnsafeUrlError` | SSRF guard |

## Development

```bash
npm install
npm run build       # emit dist/ (JS + .d.ts)
npm run test:logo   # hermetic unit tests (no network) via node:test + tsx
npm run smoke:logo  # live end-to-end check against real sites
```
