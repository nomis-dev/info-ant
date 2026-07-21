import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCssRules, extractFirstColor } from '../lib/cssParse.js';
import { extractSemanticColors } from '../lib/semantic.js';

test('parseCssRules flattens nested at-rules', () => {
  const rules = parseCssRules('@media (min-width:600px){.a{color:#111}} .b{color:#222}');
  const selectors = rules.map((r) => r.selector);
  assert.ok(selectors.includes('.a'));
  assert.ok(selectors.includes('.b'));
  assert.equal(rules.find((r) => r.selector === '.a')?.decls.get('color'), '#111');
});

test('extractFirstColor resolves var() with fallback', () => {
  const vars = new Map([['--brand', '#635bff']]);
  assert.equal(extractFirstColor('var(--brand)', vars), '#635bff');
  assert.equal(extractFirstColor('var(--missing, #ff0000)', vars), '#ff0000');
  assert.equal(extractFirstColor('1px solid rgb(10, 20, 30)', vars), '#0a141e');
});

test('parseCssRules recovers a selector glued to a leading at-statement', () => {
  // Minified CSS can place a standalone `@layer …;` statement directly in front
  // of the next rule's selector, e.g. `@layer modules;:root{…}`.
  const rules = parseCssRules('@layer modules;:root{--color-white:#fff}');
  const root = rules.find((r) => r.selector === ':root');
  assert.ok(root, ':root rule should be recovered');
  assert.equal(root?.decls.get('--color-white'), '#fff');
});

test('extractSemanticColors resolves multi-hop var chains and ignores brand-name keywords', () => {
  // `--color-primary-browserbase-red` must not match the `bg`/`base` background
  // heuristic, and `--color-bg` should resolve through the var chain to a hex.
  const css = `
    @layer modules;:root {
      --color-white: #ffffff;
      --color-primary-browserbase-red: #ff4500;
      --color-light: var(--color-white);
      --color-bg: var(--color-light);
      --color-primary: var(--color-primary-browserbase-red);
    }
    html { background: var(--color-bg); }
  `;
  const s = extractSemanticColors(css);
  assert.equal(s.background, '#ffffff');
  assert.equal(s.primary, '#ff4500');
});

test('extractSemanticColors buckets colors by selector role', () => {
  const css = `
    :root { --primary: #ff5722; --bg: #0d1117; --text-color: #e6edf3; }
    body { background: var(--bg); color: var(--text-color); }
  `;
  const s = extractSemanticColors(css);
  assert.equal(s.primary, '#ff5722');
  assert.equal(s.background, '#0d1117');
  assert.equal(s.text, '#e6edf3');
});

test('extractSemanticColors reads brand tokens from component-scoped (non :root) rules', () => {
  // SPA / CSS-Modules builds (e.g. UmiJS) declare design tokens on hashed
  // component classes like `.root___12PKk`, not on :root. The brand color must
  // still be picked up from there — otherwise extraction falls back to guessing
  // from a favicon and returns an unrelated color (the haici.com regression).
  const css = `
    body { background: #ffffff; color: #000000; }
    .root___12PKk {
      --color-primary: #3eceb6;
      --color-accent-yellow: #ffb040;
      --color-accent-blue: #38c7ff;
      --color-accent-sky: #22a6f3;
    }
    /* framework noise must NOT hijack the page background */
    .tip { --antd-arrow-background-color: linear-gradient(to right, rgba(0,0,0,0.65), rgba(0,0,0,0.75)); }
  `;
  const s = extractSemanticColors(css);
  assert.equal(s.primary, '#3eceb6');
  assert.equal(s.accent, '#ffb040'); // first candidate (CSS-only best guess)
  // All accent hues are collected so the design layer can reconcile them
  // against the favicon palette.
  assert.deepEqual(s.accentCandidates, ['#ffb040', '#38c7ff', '#22a6f3']);
  // Structural roles ignore component-scoped vars, so the body background wins.
  assert.equal(s.background, '#ffffff');
});
