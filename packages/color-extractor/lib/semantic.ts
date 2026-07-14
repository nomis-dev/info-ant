import { parseCssRules, extractFirstColor, type CssRule } from './cssParse.js';

/**
 * Best-effort SEMANTIC color extraction via static CSS analysis. Without a
 * browser we cannot read computed styles, so we classify colors by matching
 * selector keywords and CSS custom-property names. Results are heuristic hints,
 * not rendered ground truth.
 */

export type ColorVote = { hex: string; weight: number };

export type SemanticColors = {
  background: string | null;
  surface: string | null;
  text: string | null;
  primary: string | null;
  accent: string | null;
  border: string | null;
  muted: string | null;
  fonts: string[];
};

// Selector keyword matchers for each structural role.
const ROLE = {
  background: /(^|[\s,])(html|body|:root|main|\.app|\.page|\.container|section)\b/i,
};

// Custom-property name -> token, longest/most-specific first. Patterns are
// anchored to name segments (delimited by `-`, `_` or start/end) so a brand
// name like `--color-primary-browserbase-red` can't match `base`.
const VAR_TOKEN: [RegExp, keyof SemanticColors][] = [
  [/(^|[-_])(background|bg|surface-?0)([-_]|$)/i, 'background'],
  [/(^|[-_])(surface|card|panel|elevated)([-_]|$)/i, 'surface'],
  [/(^|[-_])(foreground|fg|text|body-?color|on-?background)([-_]|$)/i, 'text'],
  [/(^|[-_])(primary|brand|main)([-_]|$)/i, 'primary'],
  [/(^|[-_])(accent|secondary|highlight)([-_]|$)/i, 'accent'],
  [/(^|[-_])(border|outline|divider|stroke)([-_]|$)/i, 'border'],
  [/(^|[-_])(muted|subtle|secondary-?text|dim)([-_]|$)/i, 'muted'],
];

function pickBest(votes: Map<string, number>): string | null {
  let best: string | null = null;
  let max = 0;
  for (const [hex, w] of votes) {
    if (w > max) {
      max = w;
      best = hex;
    }
  }
  return best;
}

export function extractSemanticColors(css: string): SemanticColors {
  const rules = parseCssRules(css);

  // 1. Build the custom-property map from :root / html / body rules first.
  const vars = new Map<string, string>();
  for (const rule of rules) {
    if (!/(:root|html|body|^\*$|\[data-theme)/i.test(rule.selector)) continue;
    for (const [prop, value] of rule.decls) {
      if (prop.startsWith('--')) vars.set(prop, value);
    }
  }

  // Vote maps per role/property.
  const bg = new Map<string, number>();
  const surface = new Map<string, number>();
  const text = new Map<string, number>();
  const border = new Map<string, number>();

  const vote = (m: Map<string, number>, hex: string | null, w = 1) => {
    if (hex) m.set(hex, (m.get(hex) ?? 0) + w);
  };

  const bgOf = (r: CssRule) =>
    extractFirstColor(r.decls.get('background-color') ?? r.decls.get('background') ?? '', vars);
  const colorOf = (r: CssRule) => extractFirstColor(r.decls.get('color') ?? '', vars);
  const borderOf = (r: CssRule) =>
    extractFirstColor(r.decls.get('border-color') ?? r.decls.get('border') ?? '', vars);

  const fonts = new Set<string>();

  for (const rule of rules) {
    const sel = rule.selector;

    const font = rule.decls.get('font-family');
    if (font && /(body|html|:root|\*)/i.test(sel)) {
      const first = font.split(',')[0].replace(/["']/g, '').trim();
      if (first && !/inherit|initial|var\(/i.test(first)) fonts.add(first);
    }

    if (ROLE.background.test(sel)) {
      // body/html carry the page background + base text color.
      vote(bg, bgOf(rule), /body|html|:root/i.test(sel) ? 3 : 1);
      vote(text, colorOf(rule), /body|html|:root/i.test(sel) ? 3 : 1);
      vote(surface, bgOf(rule));
    }
    vote(border, borderOf(rule));
  }

  // 2. Seed tokens from named custom properties (strong signal when present).
  const fromVar: Partial<Record<keyof SemanticColors, string>> = {};
  for (const [name, value] of vars) {
    for (const [re, token] of VAR_TOKEN) {
      if (re.test(name)) {
        const hex = extractFirstColor(value, vars);
        if (hex && !fromVar[token]) fromVar[token] = hex;
        break;
      }
    }
  }

  return {
    background: fromVar.background ?? pickBest(bg),
    surface: fromVar.surface ?? pickBest(surface),
    text: fromVar.text ?? pickBest(text),
    primary: fromVar.primary ?? null,
    accent: fromVar.accent ?? null,
    border: fromVar.border ?? pickBest(border),
    muted: fromVar.muted ?? null,
    fonts: [...fonts].slice(0, 4),
  };
}
