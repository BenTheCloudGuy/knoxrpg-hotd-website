// RAG health / coverage query for the MCP server.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { pgPool } = require('../db/pool.js');

export async function ragStatus() {
  const totalR = await pgPool.query('SELECT COUNT(*)::int AS n FROM hotd_embeddings');
  const dmR = await pgPool.query(
    'SELECT COUNT(*)::int AS n FROM hotd_embeddings WHERE is_dm_only = TRUE'
  );
  const bySourceR = await pgPool.query(`
    SELECT source_type,
           COUNT(*)::int      AS chunks,
           MAX(updated_at)    AS last_updated,
           MIN(updated_at)    AS first_indexed
    FROM hotd_embeddings
    GROUP BY source_type
    ORDER BY chunks DESC
  `);

  return {
    total: totalR.rows[0].n,
    dmOnly: dmR.rows[0].n,
    sources: bySourceR.rows,
    timestamp: new Date().toISOString(),
  };
}
