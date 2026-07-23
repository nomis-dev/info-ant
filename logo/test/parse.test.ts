import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHtmlLogos, rankFavicons } from '../lib/parse.js';

test('parseHtmlLogos extracts rel-based favicons with type and sizes', () => {
  const html = `
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/touch.png">
    <link rel="shortcut icon" href="favicon.ico">
  `;
  const { favicons } = parseHtmlLogos(html, 'https://example.com/page');
  const urls = favicons.map((f) => f.url);
  assert.ok(urls.includes('https://example.com/favicon-32.png'));
  assert.ok(urls.includes('https://example.com/touch.png'));
  assert.ok(urls.includes('https://example.com/favicon.ico'));

  const touch = favicons.find((f) => f.source === 'apple-touch-icon');
  assert.equal(touch?.sizes, '180x180');
});

test('parseHtmlLogos finds header logos via <img> in header/nav', () => {
  const html = `
    <header><a href="/"><img src="/assets/logo.svg" alt="Acme logo"></a></header>
    <main><img src="/hero.jpg" alt="hero"></main>
  `;
  const { logos } = parseHtmlLogos(html, 'https://acme.test');
  const urls = logos.map((l) => l.url);
  assert.ok(urls.includes('https://acme.test/assets/logo.svg'));
  assert.ok(!urls.includes('https://acme.test/hero.jpg'), 'non-header img must be ignored');
  assert.equal(logos[0].alt, 'Acme logo');
});

test('parseHtmlLogos matches logo-ish class/id containers', () => {
  const html = `
    <div class="site-logo"><img src="/brand.png"></div>
    <div id="logo"><img src="/brand2.png"></div>
  `;
  const { logos } = parseHtmlLogos(html, 'https://acme.test');
  const urls = logos.map((l) => l.url);
  assert.ok(urls.includes('https://acme.test/brand.png'));
  assert.ok(urls.includes('https://acme.test/brand2.png'));
});

test('parseHtmlLogos surfaces manifest urls and og:image', () => {
  const html = `
    <link rel="manifest" href="/site.webmanifest">
    <meta property="og:image" content="https://cdn.acme.test/og.png">
  `;
  const { manifestUrls, logos } = parseHtmlLogos(html, 'https://acme.test');
  assert.deepEqual(manifestUrls, ['https://acme.test/site.webmanifest']);
  assert.ok(logos.some((l) => l.source === 'og-image' && l.url === 'https://cdn.acme.test/og.png'));
});

test('parseHtmlLogos ignores data: URIs', () => {
  const html = `<header><img src="data:image/svg+xml;base64,AAAA"></header>`;
  const { logos } = parseHtmlLogos(html, 'https://acme.test');
  assert.equal(logos.length, 0);
});

test('parseHtmlLogos prefers the site\'s own brand over third-party logos', () => {
  const html = `
    <header>
      <img src="/customers/duolingo-logo.svg" alt="Duolingo">
      <a href="/"><img src="/assets/github-logo.svg" alt="GitHub"></a>
    </header>`;
  const { logos } = parseHtmlLogos(html, 'https://github.com');
  assert.equal(logos[0].url, 'https://github.com/assets/github-logo.svg');
});

test('parseHtmlLogos captures inline <svg> logos as markup + data URI', () => {
  const html = `
    <header>
      <a href="/" aria-label="Acme home">
        <svg viewBox="0 0 24 24"><title>Acme</title><path d="M1 1h22v22H1z"/></svg>
      </a>
    </header>`;
  const { logos } = parseHtmlLogos(html, 'https://acme.test');
  const svgLogo = logos.find((l) => l.source === 'inline-svg');
  assert.ok(svgLogo, 'inline svg logo should be found');
  assert.match(svgLogo!.svg ?? '', /^<svg/, 'raw svg markup preserved');
  assert.match(svgLogo!.url, /^data:image\/svg\+xml,/, 'url is an svg data URI');
  assert.ok(svgLogo!.url.includes('viewBox'), 'data URI contains the graphic');
});

test('parseHtmlLogos extracts SVG from a CSS background-image (Framer-style)', () => {
  // Framer renders the logo as a <div> with an HTML-escaped, quoted data URI,
  // and the SVG contains rgb(...) — so ) must not terminate the match early.
  const html = `
    <header>
      <a href="./" data-framer-page-link-current="true">
        <div data-framer-component-type="SVG" class="framer-ngytjn"
          style="background-image:url('data:image/svg+xml,&lt;svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 24%22&gt;&lt;path d=%22M 16 0 L 16 8 Z%22 fill=%22rgb(255, 255, 255)%22&gt;&lt;/path&gt;&lt;/svg&gt;')"></div>
      </a>
    </header>`;
  const { logos } = parseHtmlLogos(html, 'https://www.framer.com/');
  const bg = logos.find((l) => l.source === 'css-bg-svg');
  assert.ok(bg, 'css background svg logo should be found');
  assert.match(bg!.svg ?? '', /viewBox="0 0 16 24"/, 'svg markup recovered + unescaped');
  assert.match(bg!.svg ?? '', /rgb\(255, 255, 255\)/, 'rgb() preserved, not truncated at )');
  assert.match(bg!.url, /^data:image\/svg\+xml,/);
  assert.equal(bg!.homeLink, true, 'sits inside the homepage link');
  // The home-linked logo must win over any other candidate.
  assert.equal(logos[0].source, 'css-bg-svg');
});

test('parseHtmlLogos extracts an external image URL from a CSS background-image', () => {
  // Next/Framer builders render the header wordmark as a <span> whose brand mark
  // lives at a URL (not inline). The empty-alt hero <img> in the same header must
  // lose to the real logo inside the homepage link (regression: fypro.ai).
  const html = `
    <nav>
      <a class="brand" aria-label="acme home" href="/">
        <span aria-hidden="true"
          style="background-image:url(https://cdn.acme.com/_next/static/media/logowithbrand.abc123.svg)"></span>
      </a>
    </nav>
    <header id="home" style="background:linear-gradient(98deg, #FFF 7%, #FFF 47%)">
      <img alt="" class="object-cover" src="https://cdn.acme.com/static/p1_bg.webp" />
    </header>`;
  const { logos } = parseHtmlLogos(html, 'https://www.acme.com/');
  const bg = logos.find((l) => l.source === 'css-bg-img');
  assert.ok(bg, 'css background external-image logo should be found');
  assert.equal(bg!.url, 'https://cdn.acme.com/_next/static/media/logowithbrand.abc123.svg');
  assert.equal(bg!.homeLink, true, 'sits inside the homepage link');
  // The home-linked logo must win over the empty-alt hero image.
  assert.equal(logos[0].source, 'css-bg-img');
});

test('parseHtmlLogos ranks an on-brand inline svg above a customer <img>', () => {
  const html = `
    <header>
      <img src="/customers/duolingo.png" alt="Duolingo">
      <a href="/" aria-label="GitHub"><svg><title>GitHub</title><path/></svg></a>
    </header>`;
  const { logos } = parseHtmlLogos(html, 'https://github.com');
  assert.equal(logos[0].source, 'inline-svg');
});

test('parseHtmlLogos prefers an alt="Logo" mark over a same-origin wordmark (siteup-style)', () => {
  // siteup.ai ships both a compact logo (alt="Logo") and a wordmark whose alt
  // carries the brand name. The alt="logo" signal must beat the brand match so
  // the icon — not the wordmark — is chosen as the primary logo.
  const html = `
    <header>
      <img src="https://static.siteup.ai/geo/public/icons/logotype.b379e5c3.svg" alt="Siteup.AI">
      <img src="https://static.siteup.ai/geo/public/icons/logo.c7e6978e.svg" alt="Logo">
    </header>`;
  const { logos } = parseHtmlLogos(html, 'https://siteup.ai');
  assert.equal(logos[0].url, 'https://static.siteup.ai/geo/public/icons/logo.c7e6978e.svg');
});

test('rankFavicons prefers svg, then apple-touch-icon and larger sizes, sinks default', () => {
  const ranked = rankFavicons([
    { url: 'https://x.test/favicon.ico', kind: 'favicon', source: 'default-favicon' },
    { url: 'https://x.test/icon-32.png', kind: 'favicon', source: 'link-icon', sizes: '32x32' },
    { url: 'https://x.test/touch.png', kind: 'favicon', source: 'apple-touch-icon', sizes: '180x180' },
    { url: 'https://x.test/icon.svg', kind: 'favicon', source: 'link-icon', type: 'image/svg+xml' },
  ]);
  assert.equal(ranked[0].url, 'https://x.test/icon.svg', 'svg wins');
  assert.equal(ranked[ranked.length - 1].source, 'default-favicon', 'generic favicon.ico last');
});
