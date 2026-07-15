# info-ant/color

Extract a website's color palette and design tokens **without a headless
browser**. It fetches the page HTML and a representative image, then derives
colors from three prioritized sources:

1. `<meta name="theme-color">` — the site's own declared theme color (fastest, most accurate)
2. **og:image / twitter:image / favicon** — downloaded and quantized with [`node-vibrant`](https://github.com/Vibrant-Colors/node-vibrant) (`sharp` backend, no browser)
3. **Inline CSS colors** — highest-frequency `#hex` / `rgb()` values as a fallback

Pure Node (fetch + cheerio + node-vibrant). No framework dependency — drop it
into a Next.js app, an Express server, a script, or use the CLI.

## Install

```bash
npm install info-ant
```

Requires Node 18.17+. `sharp` (a native module, pulled in by `node-vibrant`)
means this must run on a **Node runtime** — not an edge/browser runtime.

## Library usage

```ts
import { extractColors } from 'info-ant/color';

const result = await extractColors('https://stripe.com');
console.log(result.primary, result.source);
```

`ExtractResult`:

```json
{
  "url": "https://stripe.com/",
  "themeColor": null,
  "primary": "#fc8815",
  "isLight": false,
  "source": "image",
  "palette": { "Vibrant": "#fc8815", "DarkVibrant": "#824201" },
  "cssColors": [],
  "imageUsed": "https://images.stripeassets.com/.../Stripe.jpg"
}
```

`source` tells you which strategy produced `primary`: `theme-color` | `image` | `css` | `none`.

### Design tokens / design.md

```ts
import { extractDesign } from 'info-ant/color';

const { tokens, markdown } = await extractDesign('https://stripe.com');
// tokens: semantic roles (background, text, primary, header/footer/button...)
// markdown: a ready-to-share design-system brief
```

## Next.js usage

The package ships a framework-agnostic handler built on the Web-standard
`Request`/`Response`, which is exactly what Next.js App Router route handlers
use — so no `next` import is needed:

```ts
// app/api/colors/route.ts
import { createColorHandler } from 'info-ant/color/handler';

// sharp is a native module -> must run on the Node runtime, not Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createColorHandler();
```

Then:

```
GET /api/colors?url=https://stripe.com
```

Need custom behavior? Use the transport-free core:

```ts
import { extractColorsResponse } from 'info-ant/color/handler';

const { status, body } = await extractColorsResponse(targetUrl);
```

## CLI

```bash
npx --package=info-ant colorextractor https://stripe.com             # print ExtractResult JSON
npx --package=info-ant colorextractor https://stripe.com --design     # print a design.md brief
npx --package=info-ant colorextractor https://stripe.com -d -o out.md # write the brief to a file
```

> Installed the package? The `colorextractor` bin is on your `PATH`:
> `colorextractor https://stripe.com`.

## Security (SSRF)

Because the target URL is user-supplied, every outbound fetch is guarded:

- Rejects non-`http(s)` URLs and any host resolving to a
  private/loopback/link-local/reserved IP (blocks SSRF to `169.254.169.254`,
  internal services, etc.). Each image URL is re-checked after redirects.
- 8s fetch timeout, 2 MB HTML cap, 5 MB image cap.

## API surface

| Export | Responsibility |
|---|---|
| `extractColors(url, deps?)` | Full pipeline → `ExtractResult` |
| `extractDesign(url)` | Semantic tokens + `design.md` markdown |
| `parseHtmlColors(html, baseUrl)` | Pure HTML → theme-color / images / CSS colors |
| `extractSemanticColors(css)` | Static CSS → semantic color roles |
| `createColorHandler(opts?)` | `(Request) => Response` for Next.js / Fetch frameworks |
| `extractColorsResponse(url)` | Transport-free `{ status, body }` |
| `assertPublicUrl`, `UnsafeUrlError` | SSRF guard |
| `normalizeHex`, `hexToRgb`, `isLight`, … | Pure color helpers |

## Development

```bash
npm install
npm run build        # emit dist/ (JS + .d.ts)
npm run test:color   # hermetic unit tests (no network) via node:test + tsx
npm run smoke:color  # live end-to-end check against real sites
```
