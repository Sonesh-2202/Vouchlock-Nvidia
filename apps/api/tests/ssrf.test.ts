/**
 * SSRF and remote MCP endpoint security validation tests.
 * Ensures that private IP ranges, cloud metadata, restricted ports,
 * embedded credentials, and invalid protocols are rejected.
 */

import { describe, test, expect } from 'vitest';
import { validateMcpRemoteUrl } from '../src/mcp/ssrf.js';

describe('MCP SSRF Protection & Safe Remote Endpoints', () => {
  describe('Rejection of unsafe URLs', () => {
    test('blocks loopback IP addresses (127.0.0.1, localhost)', () => {
      const res1 = validateMcpRemoteUrl('https://127.0.0.1:8080/mcp');
      expect(res1.safe).toBe(false);
      expect(res1.reason).toContain('blocked');

      const res2 = validateMcpRemoteUrl('https://localhost/mcp');
      expect(res2.safe).toBe(false);
      expect(res2.reason).toContain('blocked');
    });

    test('blocks private IPv4 ranges (RFC 1918)', () => {
      // 10.0.0.0/8
      const res10 = validateMcpRemoteUrl('https://10.0.1.25/mcp');
      expect(res10.safe).toBe(false);
      expect(res10.reason).toContain('private IPv4');

      // 172.16.0.0/12
      const res172 = validateMcpRemoteUrl('https://172.20.10.5/mcp');
      expect(res172.safe).toBe(false);
      expect(res172.reason).toContain('private IPv4');

      // 192.168.0.0/16
      const res192 = validateMcpRemoteUrl('https://192.168.1.100/mcp');
      expect(res192.safe).toBe(false);
      expect(res192.reason).toContain('private IPv4');
    });

    test('blocks cloud metadata service endpoints (AWS, GCP, Azure)', () => {
      // Link-local / AWS metadata
      const resAws = validateMcpRemoteUrl('https://169.254.169.254/latest/meta-data/');
      expect(resAws.safe).toBe(false);
      expect(resAws.reason).toContain('blocked');

      // GCP metadata DNS
      const resGcp = validateMcpRemoteUrl('https://metadata.google.internal/computeMetadata/v1/');
      expect(resGcp.safe).toBe(false);
      expect(resGcp.reason).toContain('blocked');
    });

    test('blocks IPv6 loopback and unspecified addresses', () => {
      const resIpv6 = validateMcpRemoteUrl('https://[::1]:8080/mcp');
      expect(resIpv6.safe).toBe(false);
      expect(resIpv6.reason).toContain('blocked');
    });

    test('blocks dangerous internal service ports', () => {
      // SSH (22)
      expect(validateMcpRemoteUrl('https://mcp.external-service.org:22/mcp').safe).toBe(false);
      // PostgreSQL (5432)
      expect(validateMcpRemoteUrl('https://mcp.external-service.org:5432/mcp').safe).toBe(false);
      // Redis (6379)
      expect(validateMcpRemoteUrl('https://mcp.external-service.org:6379/mcp').safe).toBe(false);
    });

    test('blocks embedded credentials in URLs to prevent credential leakage', () => {
      const resCreds = validateMcpRemoteUrl('https://admin:secret123@mcp.company.com/sse');
      expect(resCreds.safe).toBe(false);
      expect(resCreds.reason?.toLowerCase()).toContain('credential');
    });

    test('blocks non-HTTP protocols (file, gopher, ftp)', () => {
      expect(validateMcpRemoteUrl('file:///etc/passwd').safe).toBe(false);
      expect(validateMcpRemoteUrl('gopher://evil.com/').safe).toBe(false);
      expect(validateMcpRemoteUrl('ftp://ftp.example.com/').safe).toBe(false);
    });

    test('blocks malformed URL strings', () => {
      expect(validateMcpRemoteUrl('not-a-valid-url').safe).toBe(false);
      expect(validateMcpRemoteUrl('').safe).toBe(false);
    });
  });

  describe('Allowance of valid public endpoints', () => {
    test('accepts public HTTPS MCP endpoints on standard ports', () => {
      const res1 = validateMcpRemoteUrl('https://mcp.linear.app/sse');
      expect(res1.safe).toBe(true);
      expect(res1.normalizedUrl).toBe('https://mcp.linear.app/sse');

      const res2 = validateMcpRemoteUrl('https://api.github.com/mcp');
      expect(res2.safe).toBe(true);
      expect(res2.normalizedUrl).toBe('https://api.github.com/mcp');
    });

    test('accepts allowed custom HTTPS ports (e.g. 8443)', () => {
      const res = validateMcpRemoteUrl('https://mcp.secure-company.com:8443/mcp');
      expect(res.safe).toBe(true);
    });
  });
});
