import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHtmlColors, extractColors } from '../lib/extractor.js';

const publicResolver = async () => '93.184.216.34';

// Build a fetch stub that returns the given HTML body for any request.
function htmlFetch(html: string): typeof fetch {
  return (async () =>
    new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })) as unknown as typeof fetch;
}

test('parseHtmlColors extracts theme-color', () => {
  const { themeColor } = parseHtmlColors(
    '<meta name="theme-color" content="#635BFF">',
    'https://example.com',
  );
  assert.equal(themeColor, '#635bff');
});

test('parseHtmlColors resolves and orders image candidates', () => {
  const html = `
    <meta property="og:image" content="/og.png">
    <meta name="twitter:image" content="https://cdn.example.com/tw.png">
    <link rel="icon" href="favicon.ico">
  `;
  const { imageCandidates } = parseHtmlColors(html, 'https://example.com/page');
  assert.equal(imageCandidates[0], 'https://example.com/og.png');
  assert.equal(imageCandidates[1], 'https://cdn.example.com/tw.png');
  assert.equal(imageCandidates[2], 'https://example.com/favicon.ico');
});

test('parseHtmlColors pulls CSS colors from style blocks and attributes', () => {
  const html = `
    <style>.brand { color: #ff5722; }</style>
    <div style="background: #ff5722">hi</div>
  `;
  const { cssColors } = parseHtmlColors(html, 'https://example.com');
  assert.equal(cssColors[0], '#ff5722');
});

test('extractColors prefers theme-color as primary source', async () => {
  const html = '<html><head><meta name="theme-color" content="#0a84ff"></head></html>';
  const result = await extractColors('https://example.com', {
    fetchImpl: htmlFetch(html),
    resolver: publicResolver,
  });
  assert.equal(result.source, 'theme-color');
  assert.equal(result.primary, '#0a84ff');
  assert.equal(result.themeColor, '#0a84ff');
  assert.equal(result.isLight, false);
});

test('extractColors falls back to CSS colors when no theme-color or image', async () => {
  const html = '<html><head><style>a{color:#e91e63}</style></head></html>';
  const result = await extractColors('https://example.com', {
    fetchImpl: htmlFetch(html),
    resolver: publicResolver,
  });
  assert.equal(result.source, 'css');
  assert.equal(result.primary, '#e91e63');
});

test('extractColors returns source "none" for a colorless page', async () => {
  const result = await extractColors('https://example.com', {
    fetchImpl: htmlFetch('<html><body>plain</body></html>'),
    resolver: publicResolver,
  });
  assert.equal(result.source, 'none');
  assert.equal(result.primary, null);
});

test('extractColors rejects private-resolving hosts before fetching', async () => {
  let fetched = false;
  const spyFetch = (async () => {
    fetched = true;
    return new Response('', { status: 200 });
  }) as unknown as typeof fetch;

  await assert.rejects(
    extractColors('https://internal.example.com', {
      fetchImpl: spyFetch,
      resolver: async () => '10.0.0.5',
    }),
  );
  assert.equal(fetched, false, 'must not fetch an SSRF-blocked host');
});
