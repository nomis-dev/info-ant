import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHex,
  hexToRgb,
  rgbToHex,
  isLight,
  extractColorsFromText,
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
