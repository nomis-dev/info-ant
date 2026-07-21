/**
 * Pure color helpers. No I/O — kept separate so they can be unit tested without
 * network or image decoding.
 */

export type Rgb = { r: number; g: number; b: number };

// Normalize any CSS hex (#rgb, #rgba, #rrggbb, #rrggbbaa) to #rrggbb lowercase.
// Returns null if the input is not a valid hex color.
export function normalizeHex(input: string): string | null {
  const m = input.trim().match(/^#?([0-9a-fA-F]{3,8})$/);
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .slice(0, 3)
      .split('')
      .map((c) => c + c)
      .join('');
  } else if (hex.length === 6 || hex.length === 8) {
    hex = hex.slice(0, 6);
  } else {
    return null;
  }
  return '#' + hex.toLowerCase();
}

export function hexToRgb(hex: string): Rgb | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const n = normalized.slice(1);
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [r, g, b]
      .map((v) => clamp(v).toString(16).padStart(2, '0'))
      .join('')
      .toLowerCase()
  );
}

// Relative luminance per WCAG. Used to classify a color as light or dark.
export function luminance({ r, g, b }: Rgb): number {
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

export function isLight(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  return luminance(rgb) > 0.5;
}

/**
 * Scan arbitrary text (HTML / inline CSS) for hex and rgb() colors and return
 * them ranked by frequency. Pure — used as the CSS-fallback source.
 */export function extractColorsFromText(text: string, limit = 8): string[] {
  const counts = new Map<string, number>();
  const bump = (hex: string) => {
    const n = normalizeHex(hex);
    if (!n) return;
    // Skip pure black/white — they dominate but rarely represent a brand hue.
    if (n === '#000000' || n === '#ffffff') return;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  };

  // #rrggbb / #rgb tokens (bounded to avoid catastrophic backtracking).
  for (const m of text.matchAll(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g)) {
    bump(m[0]);
  }
  // rgb()/rgba() functional notation.
  for (const m of text.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi)) {
    bump(rgbToHex({ r: +m[1], g: +m[2], b: +m[3] }));
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([hex]) => hex);
}

// Squared Euclidean distance in RGB space (0 = identical). Cheap and adequate
// for "are these two brand colors roughly the same hue" comparisons; we skip
// the sqrt since we only ever compare distances against each other.
export function colorDistance(a: string, b: string): number {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  if (!x || !y) return Infinity;
  return (x.r - y.r) ** 2 + (x.g - y.g) ** 2 + (x.b - y.b) ** 2;
}

/**
 * From a list of candidate colors, return the one closest to ANY color in the
 * reference set, provided the closest match is within `maxDistance`. Returns
 * null when no candidate is close enough (caller decides the fallback).
 *
 * `maxDistance` is a squared-RGB threshold; the default (~90 per channel)
 * accepts clearly-related hues while rejecting an unrelated accent (e.g. a
 * yellow token when the icon palette is entirely teal/blue).
 */
export function nearestColor(
  candidates: string[],
  reference: string[],
  maxDistance = 90 * 90 * 3,
): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    for (const r of reference) {
      const d = colorDistance(c, r);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
  }
  return best !== null && bestDist <= maxDistance ? best : null;
}
