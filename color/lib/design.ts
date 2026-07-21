import * as cheerio from 'cheerio';
import { extractColors, fetchText, type ExtractResult } from './extractor.js';
import { extractSemanticColors, type SemanticColors } from './semantic.js';
import { assertPublicUrl, UnsafeUrlError } from './ssrf.js';
import { isLight, nearestColor } from './color.js';

const MAX_STYLESHEETS = 6;

export type DesignTokens = SemanticColors & {
  themeColor: string | null;
  imageSource: string | null;
  paletteSource: ExtractResult['source'];
};

export type DesignResult = { url: string; tokens: DesignTokens; markdown: string };

// Collect all CSS text: inline <style>, style="" attrs, and external sheets.
async function collectCss(html: string, baseUrl: string): Promise<string> {
  const $ = cheerio.load(html);
  let css = '';

  $('style').each((_, el) => {
    css += $(el).text() + '\n';
  });
  $('[style]').each((_, el) => {
    css += `[inline]{${$(el).attr('style') ?? ''}}\n`;
  });

  const hrefs: string[] = [];
  $('link[rel~="stylesheet"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      hrefs.push(new URL(href, baseUrl).href);
    } catch {
      /* ignore */
    }
  });

  for (const href of [...new Set(hrefs)].slice(0, MAX_STYLESHEETS)) {
    try {
      await assertPublicUrl(href);
      css += (await fetchText(href)) + '\n';
    } catch (e) {
      if (e instanceof UnsafeUrlError) continue;
      // network/parse failure on a sheet — skip it, keep going
    }
  }
  return css;
}

function fmt(hex: string | null): string {
  if (!hex) return '`—` _(not detected)_';
  return `\`${hex}\` ${isLight(hex) ? '⬜' : '⬛'}`;
}

// Render a Google-Stitch-consumable design.md (design system brief).
export function buildDesignMarkdown(url: string, t: DesignTokens): string {
  const host = new URL(url).hostname;
  const primary = t.primary ?? t.themeColor ?? t.accent;
  const bg = t.background ?? '#ffffff';
  const fg = t.text ?? '#111111';
  const fonts = t.fonts.length ? t.fonts.join(', ') : 'system-ui / sans-serif';

  const tokenJson = JSON.stringify(
    {
      primary,
      accent: t.accent,
      background: bg,
      surface: t.surface,
      text: fg,
      muted: t.muted,
      border: t.border,
    },
    null,
    2,
  );

  return `# Design System — ${host}

> Source: ${url}
> Extracted statically (no browser). Colors are heuristic hints from
> CSS selector + custom-property analysis; verify against the live site.

## Design Brief

A ${isLight(bg) ? 'light' : 'dark'} interface built around a primary color of
**${primary ?? 'n/a'}**${t.accent ? ` with **${t.accent}** as an accent` : ''}.
The page background is **${bg}** with **${fg}** body text. Typography uses
**${fonts}**. Use the palette below to reproduce the look and feel.

## Color Tokens

| Token | Value | Role |
|---|---|---|
| Primary | ${fmt(primary)} | Brand / primary actions |
| Accent | ${fmt(t.accent)} | Secondary highlights |
| Background | ${fmt(bg)} | Page background |
| Surface | ${fmt(t.surface)} | Cards / panels |
| Text | ${fmt(fg)} | Body copy |
| Muted | ${fmt(t.muted)} | Secondary text |
| Border | ${fmt(t.border)} | Dividers / outlines |

## Typography

- Primary font family: **${fonts}**

## Design Tokens (JSON)

\`\`\`json
${tokenJson}
\`\`\`

## Provenance

- Primary color source: \`${t.paletteSource}\`${t.imageSource ? ` (image: ${t.imageSource})` : ''}
- theme-color meta: ${t.themeColor ?? '(none)'}
`;
}

export async function extractDesign(rawUrl: string): Promise<DesignResult> {
  const url = await assertPublicUrl(rawUrl);
  const html = await fetchText(url.href);

  const [palette, css] = await Promise.all([
    extractColors(url.href),
    collectCss(html, url.href),
  ]);

  const semantic = extractSemanticColors(css);

  // Reconcile the accent color: a site may declare several accent-named vars
  // (haici.com has yellow/blue/sky). Pick the CSS candidate that actually shows
  // up in the favicon/brand palette; fall back to the image's light-vibrant
  // swatch, then to the first CSS candidate.
  const iconPalette = Object.values(palette.palette).filter(
    (c): c is string => typeof c === 'string',
  );
  const accent =
    nearestColor(semantic.accentCandidates, iconPalette) ??
    palette.palette.LightVibrant ??
    semantic.accent ??
    null;

  const tokens: DesignTokens = {
    ...semantic,
    // Prefer an explicit brand color; fall back to theme-color / image vibrant.
    primary: semantic.primary ?? palette.themeColor ?? palette.palette.Vibrant ?? null,
    accent,
    themeColor: palette.themeColor,
    imageSource: palette.imageUsed,
    paletteSource: palette.source,
  };

  return { url: url.href, tokens, markdown: buildDesignMarkdown(url.href, tokens) };
}
