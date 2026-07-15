import { normalizeHex } from './color.js';

/**
 * Tolerant CSS parser for STATIC analysis (no browser). It flattens nested
 * at-rules (@media, @supports) by repeatedly matching innermost blocks, then
 * returns flat selector -> declarations. Not spec-perfect, but good enough to
 * mine colors from real-world (often minified) stylesheets.
 */

export type CssRule = { selector: string; decls: Map<string, string> };

function parseDecls(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of body.split(';')) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const prop = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (prop && value) map.set(prop, value);
  }
  return map;
}

export function parseCssRules(css: string): CssRule[] {
  css = css.replace(/\/\*[\s\S]*?\*\//g, ''); // strip comments
  const rules: CssRule[] = [];
  const innermost = /([^{}]+?)\{([^{}]*?)\}/g;
  let prev: string;
  do {
    prev = css;
    css = css.replace(innermost, (_m, sel: string, body: string) => {
      // A prelude can carry standalone at-statements (e.g. `@layer modules;`)
      // glued in front of the real selector. Keep only the segment after the
      // last such `@...;` statement so `@layer modules;:root` becomes `:root`.
      const s = sel.replace(/^[\s\S]*;\s*(?=[^;]*$)/, '').trim();
      // Skip at-rule preludes (their real declarations live in the inner block
      // that was already captured on a previous pass).
      if (s && !s.startsWith('@') && body.includes(':')) {
        rules.push({ selector: s, decls: parseDecls(body) });
      }
      return '';
    });
  } while (css !== prev);
  return rules;
}

// A small set of common CSS named colors worth resolving.
const NAMED: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  navy: '#000080',
  teal: '#008080',
  orange: '#ffa500',
  purple: '#800080',
  yellow: '#ffff00',
};

// Convert HSL channels to a #rrggbb hex string.
function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const to = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Recursively substitute var(--x[, fallback]) references with their resolved
 * text (in place), so wrappers like `hsl(var(--bg))` recombine with channel
 * values stored bare in a variable (e.g. `--bg: 48 13% 89%`). Unresolvable
 * references with no fallback are dropped. A `seen` set guards against cycles.
 */
function resolveVars(value: string, vars: Map<string, string>, seen: Set<string>): string {
  const re = /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/;
  let out = value;
  for (let guard = 0; guard < 50; guard++) {
    const m = out.match(re);
    if (!m || m.index === undefined) break;
    const [full, name, fallback] = m;
    let replacement = '';
    if (!seen.has(name) && vars.has(name)) {
      const next = new Set(seen);
      next.add(name);
      replacement = resolveVars(vars.get(name)!, vars, next);
    } else if (fallback != null) {
      replacement = resolveVars(fallback, vars, seen);
    }
    out = out.slice(0, m.index) + replacement + out.slice(m.index + full.length);
  }
  return out;
}

/**
 * Pull the first concrete color out of a CSS value, resolving var(--x) against
 * the provided custom-property map (with a recursion guard). Supports hex,
 * rgb()/rgba(), hsl()/hsla() (comma or space syntax), and common named colors.
 */
export function extractFirstColor(
  value: string,
  vars: Map<string, string>,
  seen = new Set<string>(),
): string | null {
  // Substitute any var() references first so color-function wrappers recombine
  // with channel values that live inside a custom property.
  const resolved = /var\(/.test(value) ? resolveVars(value, vars, seen) : value;

  const hex = resolved.match(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/);
  if (hex) return normalizeHex(hex[0]);

  const rgb = resolved.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (rgb) {
    const to = (n: string) => (+n).toString(16).padStart(2, '0');
    return `#${to(rgb[1])}${to(rgb[2])}${to(rgb[3])}`.toLowerCase();
  }

  // hsl(H S% L%) or hsl(H, S%, L%), with an optional deg unit on the hue.
  const hsl = resolved.match(/hsla?\(\s*([\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%/i);
  if (hsl) return hslToHex(+hsl[1], +hsl[2], +hsl[3]);

  const named = resolved.trim().toLowerCase();
  if (NAMED[named]) return NAMED[named];

  return null;
}
