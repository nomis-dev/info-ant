# info-ant

Color extraction and design-token tooling — a small monorepo of pure-Node
packages that turn any public website into a color palette and a shareable
design-system brief, **without a headless browser**.

## Packages

| Package | Description |
|---|---|
| [`@info-ant/color-extractor`](./packages/color-extractor) | Extract a site's color palette, semantic tokens, and a `design.md` brief from HTML + a representative image. Ships a library API, a Fetch-standard route handler, and a CLI. Tree-shakeable ESM. |
| [`@info-ant/logo-extractor`](./packages/logo-extractor) | Discover a site's brand logo and favicon **links** (header logos, `apple-touch-icon`, web-manifest icons, `/favicon.ico`) — no browser, no image download. Library API + Fetch handler + CLI. Tree-shakeable ESM. |

## Quick start

```bash
npm install @info-ant/color-extractor
```

```ts
import { extractColors, extractDesign } from '@info-ant/color-extractor';

const result = await extractColors('https://stripe.com');
console.log(result.primary, result.source);

const { tokens, markdown } = await extractDesign('https://stripe.com');
```

See the [package README](./packages/color-extractor/README.md) for the full API,
Next.js integration, CLI usage, and SSRF security notes.

## Repository layout

```
info-ant/
├── packages/
│   └── color-extractor/   # @info-ant/color-extractor
├── package.json           # npm workspaces + turbo scripts
└── turbo.json             # build / test / typecheck pipeline
```

## Development

This is an [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces)
monorepo orchestrated with [Turborepo](https://turbo.build/). Requires
**Node 18.17+**.

```bash
npm install        # install all workspace deps
npm run build      # turbo run build   — compile every package to dist/
npm test           # turbo run test    — hermetic unit tests (no network)
npm run typecheck  # turbo run typecheck
npm run clean      # remove build output and node_modules
```

Per-package scripts (run inside `packages/color-extractor`, or via
`npm run <script> -w @info-ant/color-extractor`):

```bash
npm run smoke      # live end-to-end check against real sites
npm run design     # generate a design.md brief from a URL
```

## License

MIT
