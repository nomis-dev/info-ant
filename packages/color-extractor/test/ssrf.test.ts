import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHttpUrl,
  isPrivateAddress,
  assertPublicUrl,
  UnsafeUrlError,
} from '../lib/ssrf.js';

test('parseHttpUrl rejects non-http protocols', () => {
  assert.throws(() => parseHttpUrl('ftp://example.com'), UnsafeUrlError);
  assert.throws(() => parseHttpUrl('file:///etc/passwd'), UnsafeUrlError);
  assert.throws(() => parseHttpUrl('not a url'), UnsafeUrlError);
  assert.ok(parseHttpUrl('https://example.com'));
});

test('isPrivateAddress flags private ranges', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.16.5.5', '169.254.1.1', '::1', 'fe80::1']) {
    assert.equal(isPrivateAddress(ip), true, `${ip} should be private`);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111']) {
    assert.equal(isPrivateAddress(ip), false, `${ip} should be public`);
  }
});

test('assertPublicUrl rejects hosts resolving to private IPs', async () => {
  const privateResolver = async () => '127.0.0.1';
  await assert.rejects(
    assertPublicUrl('https://evil.example.com', privateResolver),
    UnsafeUrlError,
  );
});

test('assertPublicUrl accepts hosts resolving to public IPs', async () => {
  const publicResolver = async () => '93.184.216.34';
  const url = await assertPublicUrl('https://example.com', publicResolver);
  assert.equal(url.hostname, 'example.com');
});

test('assertPublicUrl blocks literal private IP hosts without DNS', async () => {
  await assert.rejects(assertPublicUrl('http://127.0.0.1/admin'), UnsafeUrlError);
  await assert.rejects(assertPublicUrl('http://169.254.169.254/latest/meta-data'), UnsafeUrlError);
});
