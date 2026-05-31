// Simple bearer-token auth for the MCP server's HTTP transport.

export function makeBearerAuth(token) {
  return function check(req) {
    if (!token) return true; // No token configured = open (intended for localhost dev)
    const header = req.headers['authorization'] || req.headers['Authorization'];
    if (!header || typeof header !== 'string') return false;
    const [scheme, value] = header.split(/\s+/);
    return scheme === 'Bearer' && value === token;
  };
}
