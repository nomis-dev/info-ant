import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * SSRF guard. The extractor accepts arbitrary user-supplied URLs, so before we
 * fetch anything we must reject non-http(s) protocols and any host that resolves
 * to a private / loopback / link-local / reserved IP range. Callers should run
 * assertPublicUrl BEFORE every fetch (including redirected resource URLs).
 */

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

// Parse and validate the protocol. Returns a URL or throws UnsafeUrlError.
export function parseHttpUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeUrlError('invalid url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('only http(s) urls are allowed');
  }
  return url;
}

// IPv4 private / reserved ranges.
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // malformed -> treat as unsafe
  }
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::') return true; // loopback / unspecified
  if (v.startsWith('fe80')) return true; // link-local
  if (v.startsWith('fc') || v.startsWith('fd')) return true; // unique local
  const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateIPv4(ip);
  if (kind === 6) return isPrivateIPv6(ip);
  return true; // not a recognizable IP -> unsafe
}

/**
 * Resolve the URL's hostname and reject if it maps to a private address.
 * Throws UnsafeUrlError on any violation. The resolver is injectable for tests.
 */
export async function assertPublicUrl(
  input: string,
  resolver: (host: string) => Promise<string> = defaultResolver,
): Promise<URL> {
  const url = parseHttpUrl(input);
  const host = url.hostname;

  // Literal IP host — check directly, no DNS.
  if (isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new UnsafeUrlError('url resolves to a private address');
    }
    return url;
  }

  const address = await resolver(host);
  if (isPrivateAddress(address)) {
    throw new UnsafeUrlError('url resolves to a private address');
  }
  return url;
}

async function defaultResolver(host: string): Promise<string> {
  const { address } = await lookup(host);
  return address;
}
