# info-ant

Color extraction and design-token tooling — a single pure-Node package that
turns any public website into a color palette, a shareable design-system brief,
and its brand logo / favicon links, **without a headless browser**.

## Toolkits

The package exposes two independent toolkits under their own subpaths:

| Subpath | Description |
| --- | --- |
| [`info-ant/color`](./color) | Extract a site's color palette, semantic tokens, and a `design.md` brief from HTML + a representative image. Ships a library API, a Fetch-standard route handler, and a CLI. Tree-shakeable ESM. |
| [`info-ant/logo`](./logo) | Discover a site's brand logo and favicon **links** (header logos, `apple-touch-icon`, web-manifest icons, `/favicon.ico`) — no browser, no image download. Library API + Fetch handler + CLI. Tree-shakeable ESM. |

## Quick start

```bash
npm install info-ant
```

```ts
// Prefer subpath imports for tree-shaking:
import { extractColors, extractDesign } from 'info-ant/color';
import { extractLogos } from 'info-ant/logo';

const result = await extractColors('https://stripe.com');
console.log(result.primary, result.source);

const { tokens, markdown } = await extractDesign('https://stripe.com');

const { logo, favicon } = await extractLogos('https://stripe.com');
```

The root entry also re-exports both toolkits as namespaces, which avoids their
identically-named exports colliding:

```ts
import { color, logo } from 'info-ant';

await color.extractColors('https://stripe.com');
await logo.extractLogos('https://stripe.com');
```

See the [`color` README](./color/README.md) and [`logo` README](./logo/README.md)
for the full API, Next.js integration, CLI usage, and SSRF security notes.

## Repository layout

```text
info-ant/
├── src/
│   └── index.ts        # namespaced root entry (re-exports color + logo)
├── color/              # info-ant/color toolkit
│   ├── lib/
│   ├── scripts/
│   └── test/
├── logo/               # info-ant/logo toolkit
│   ├── lib/
│   ├── scripts/
│   └── test/
├── package.json        # single package with ./color and ./logo subpath exports
└── tsconfig.json       # build / typecheck config
```

## Development

A single package (no workspaces, no Turborepo). Requires **Node 18.17+**.

```bash
npm install        # install deps
npm run build      # tsc -p tsconfig.json — compile to dist/
npm test           # hermetic unit tests (no network) for both toolkits
npm run typecheck  # tsc --noEmit
npm run clean      # remove build output
```

Per-toolkit scripts:

```bash
npm run test:color   # unit tests for the color toolkit
npm run test:logo    # unit tests for the logo toolkit
npm run smoke:color  # live end-to-end check against real sites (color)
npm run smoke:logo   # live end-to-end check against real sites (logo)
npm run design       # generate a design.md brief from a URL
npm run try          # try the logo extractor against a URL
```

## License

MIT
