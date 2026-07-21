import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHex,
  hexToRgb,
  rgbToHex,
  isLight,
  extractColorsFromText,
  colorDistance,
  nearestColor,
} from '../lib/color.js';

test('normalizeHex expands shorthand and lowercases', () => {
  assert.equal(normalizeHex('#FFF'), '#ffffff');
  assert.equal(normalizeHex('abc'), '#aabbcc');
  assert.equal(normalizeHex('#635BFF'), '#635bff');
  assert.equal(normalizeHex('#112233aa'), '#112233'); // drops alpha
});

test('normalizeHex rejects invalid input', () => {
  assert.equal(normalizeHex('nope'), null);
  assert.equal(normalizeHex('#12'), null);
  assert.equal(normalizeHex(''), null);
});

test('hexToRgb / rgbToHex round-trip', () => {
  assert.deepEqual(hexToRgb('#635bff'), { r: 99, g: 91, b: 255 });
  assert.equal(rgbToHex({ r: 99, g: 91, b: 255 }), '#635bff');
});

test('rgbToHex clamps out-of-range channels', () => {
  assert.equal(rgbToHex({ r: -10, g: 300, b: 128 }), '#00ff80');
});

test('isLight classifies by luminance', () => {
  assert.equal(isLight('#ffffff'), true);
  assert.equal(isLight('#000000'), false);
  assert.equal(isLight('#635bff'), false);
});

test('extractColorsFromText ranks by frequency and skips b/w', () => {
  const css = `
    a { color: #ff0000; }
    b { color: #FF0000; }
    c { background: rgb(255, 0, 0); }
    d { color: #00ff00; }
    e { color: #000; background: #ffffff; }
  `;
  const colors = extractColorsFromText(css);
  assert.equal(colors[0], '#ff0000'); // appears 3x
  assert.ok(colors.includes('#00ff00'));
  assert.ok(!colors.includes('#000000'));
  assert.ok(!colors.includes('#ffffff'));
});

test('colorDistance is zero for identical colors and grows with difference', () => {
  assert.equal(colorDistance('#000000', '#000000'), 0);
  assert.ok(colorDistance('#000000', '#010101') < colorDistance('#000000', '#0f0f0f'));
  assert.equal(colorDistance('#zzz', '#000000'), Infinity); // invalid input
});

test('nearestColor picks the accent candidate that matches the icon palette', () => {
  // haici.com regression: CSS declares yellow/blue/sky accent vars, but only
  // the blues appear in the (teal/blue) favicon — the yellow must be rejected.
  const candidates = ['#ffb040', '#38c7ff', '#22a6f3'];
  const iconPalette = ['#04b8fc', '#3ce4cc', '#015f83', '#016e97'];
  assert.equal(nearestColor(candidates, iconPalette), '#22a6f3');
});

test('nearestColor returns null when no candidate is close enough', () => {
  // A lone yellow accent against an all-teal icon palette is unrelated.
  assert.equal(nearestColor(['#ffb040'], ['#04b8fc', '#3ce4cc']), null);
});
