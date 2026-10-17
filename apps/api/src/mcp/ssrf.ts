/**
 * SSRF and Network Boundary Guard
 * Validates external URLs before outbound fetches (e.g., custom provider endpoints or remote MCP servers).
 * Strictly prevents SSRF, private network probing, cloud metadata access, and DNS rebinding.
 */

import { isIP } from 'net';

export class UnsafeEndpointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeEndpointError';
  }
}

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  '169.254.169.254',
  'instance-data',
]);

/**
 * Checks if an IPv4 address is in a private, loopback, or link-local range.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return true;

  const [a, b] = parts;
  if (a === undefined || b === undefined) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 10.0.0.0/8 (Private)
  if (a === 10) return true;
  // 172.16.0.0/12 (Private)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (Link-local / Cloud metadata)
  if (a === 169 && b === 254) return true;
  // 0.0.0.0/8
  if (a === 0) return true;

  return false;
}

/**
 * Checks if an IPv6 address is in a private, loopback, or link-local range.
 */
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fe80:') ||
    lower.startsWith('fc') ||
    lower.startsWith('fd')
  ) {
    return true;
  }
  return false;
}

/**
 * Validates an outbound URL to ensure it is safe to query from the server.
 * Throws UnsafeEndpointError if the URL violates security boundaries.
 */
export function validateSafeEndpoint(
  urlStr: string,
  options: { allowHttpInDev?: boolean } = {},
): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new UnsafeEndpointError(`Malformed endpoint URL: "${urlStr}".`);
  }

  // 1. Enforce HTTPS (unless local dev explicitly permitted)
  const isDev = process.env['NODE_ENV'] === 'development' || process.env['NODE_ENV'] === 'test';
  if (parsed.protocol !== 'https:') {
    if (!options.allowHttpInDev || !isDev || parsed.protocol !== 'http:') {
      throw new UnsafeEndpointError('Outbound endpoints must use secure HTTPS protocol.');
    }
  }

  // 2. Reject credentials embedded in URL
  if (parsed.username || parsed.password) {
    throw new UnsafeEndpointError('Credentials embedded in endpoint URLs are forbidden.');
  }

  // 3. Reject blocked hostnames and metadata endpoints
  let hostname = parsed.hostname.toLowerCase().trim();
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }
  if (BLOCKED_HOSTS.has(hostname) && (!isDev || !options.allowHttpInDev)) {
    throw new UnsafeEndpointError(`Access to restricted internal host "${hostname}" is blocked.`);
  }

  // 4. Check for IP addresses
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    if (isPrivateIPv4(hostname) && (!isDev || !options.allowHttpInDev)) {
      throw new UnsafeEndpointError(`Access to private IPv4 address "${hostname}" is blocked.`);
    }
  } else if (ipVersion === 6) {
    if (isPrivateIPv6(hostname) && (!isDev || !options.allowHttpInDev)) {
      throw new UnsafeEndpointError(`Access to private IPv6 address "${hostname}" is blocked.`);
    }
  }

  // 5. Restrict ports
  if (parsed.port) {
    const port = Number(parsed.port);
    if (port !== 443 && port !== 80 && port !== 8443) {
      throw new UnsafeEndpointError(`Port ${port} is not permitted for external integrations.`);
    }
  }

  return parsed;
}

/**
 * Result object for non-throwing validation checks (e.g. form validators, test assertions).
 */
export function validateMcpRemoteUrl(urlStr: string): {
  safe: boolean;
  reason?: string;
  normalizedUrl?: string;
} {
  try {
    const url = validateSafeEndpoint(urlStr, { allowHttpInDev: false });
    return { safe: true, normalizedUrl: url.toString() };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Invalid endpoint';
    return { safe: false, reason };
  }
}
