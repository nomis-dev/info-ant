import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLogos } from '../lib/extractor.js';

const publicResolver = async () => '93.184.216.34';

// Build a fetch stub keyed by URL substring -> { body, contentType }.
function routedFetch(routes: Record<string, string>): typeof fetch {
  return (async (input: string | URL) => {
    const href = typeof input === 'string' ? input : input.href;
    for (const [needle, body] of Object.entries(routes)) {
      if (href.includes(needle)) {
        return new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
      }
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

test('extractLogos returns best logo + favicon and full candidate lists', async () => {
  const html = `
    <html><head>
      <link rel="icon" sizes="32x32" href="/favicon-32.png">
      <link rel="apple-touch-icon" sizes="180x180" href="/touch.png">
    </head><body>
      <header><a href="/"><img src="/logo.svg" alt="Acme logo"></a></header>
    </body></html>`;

  const result = await extractLogos('https://acme.test', {
    fetchImpl: routedFetch({ 'acme.test': html }),
    resolver: publicResolver,
  });

  assert.equal(result.logo, 'https://acme.test/logo.svg');
  assert.equal(result.favicon, 'https://acme.test/touch.png'); // 180x180 beats 32x32
  assert.ok(result.favicons.some((f) => f.source === 'default-favicon'));
});

test('extractLogos folds in web-manifest icons', async () => {
  const html = `<link rel="manifest" href="/app.webmanifest">`;
  const manifest = JSON.stringify({
    icons: [{ src: '/icons/512.png', sizes: '512x512', type: 'image/png' }],
  });

  const result = await extractLogos('https://acme.test', {
    fetchImpl: routedFetch({ 'acme.test/app.webmanifest': manifest, 'acme.test': html }),
    resolver: publicResolver,
  });

  const fromManifest = result.favicons.find((f) => f.source === 'manifest-icon');
  assert.equal(fromManifest?.url, 'https://acme.test/icons/512.png');
});

test('extractLogos always synthesizes /favicon.ico fallback', async () => {
  const result = await extractLogos('https://acme.test/some/deep/page', {
    fetchImpl: routedFetch({ 'acme.test': '<html></html>' }),
    resolver: publicResolver,
  });
  assert.equal(result.favicon, 'https://acme.test/favicon.ico');
  assert.equal(result.logo, null);
});

test('extractLogos rejects an inline-svg logo that depends on CSS variables', async () => {
  // Inline header SVG that styles its fill with a page-level CSS variable — the
  // extracted data: URI can't resolve it, so `logo` must be null even though the
  // candidate still appears in the full `logos` list.
  const html = `
    <html><body>
      <header><a href="/" aria-label="Home">
        <svg viewBox="0 0 10 10"><rect width="10" height="10" fill="var(--brand)"/></svg>
      </a></header>
    </body></html>`;

  const result = await extractLogos('https://acme.test', {
    fetchImpl: routedFetch({ 'acme.test': html }),
    resolver: publicResolver,
  });

  assert.equal(result.logo, null);
  assert.ok(result.logos.some((l) => l.source === 'inline-svg'));
});

test('extractLogos keeps an inline-svg logo with no CSS variables', async () => {
  const html = `
    <html><body>
      <header><a href="/" aria-label="Home">
        <svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#f00"/></svg>
      </a></header>
    </body></html>`;

  const result = await extractLogos('https://acme.test', {
    fetchImpl: routedFetch({ 'acme.test': html }),
    resolver: publicResolver,
  });

  assert.ok(result.logo?.startsWith('data:image/svg+xml,'));
});

test('extractLogos rejects private-resolving hosts before fetching', async () => {
  let fetched = false;
  const spyFetch = (async () => {
    fetched = true;
    return new Response('', { status: 200 });
  }) as unknown as typeof fetch;

  await assert.rejects(
    extractLogos('https://internal.example.com', {
      fetchImpl: spyFetch,
      resolver: async () => '10.0.0.5',
    }),
  );
  assert.equal(fetched, false, 'must not fetch an SSRF-blocked host');
});
