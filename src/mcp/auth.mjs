// Simple bearer-token auth for the MCP server's HTTP transport.

import { timingSafeEqual } from 'node:crypto';

export function makeBearerAuth(token) {
  const expected = token ? Buffer.from(String(token), 'utf8') : null;
  return function check(req) {
    if (!expected) return true; // No token configured = open (intended for localhost dev)
    const header = req.headers['authorization'] || req.headers['Authorization'];
    if (!header || typeof header !== 'string') return false;
    const [scheme, value] = header.split(/\s+/);
    if (scheme !== 'Bearer' || !value) return false;
    const got = Buffer.from(value, 'utf8');
    if (got.length !== expected.length) return false;
    try {
      return timingSafeEqual(got, expected);
    } catch {
      return false;
    }
  };
}
