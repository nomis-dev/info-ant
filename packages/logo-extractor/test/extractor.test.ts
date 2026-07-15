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
