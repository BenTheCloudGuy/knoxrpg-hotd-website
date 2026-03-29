const { Pool } = require("pg");

// ── PostgreSQL Pool (Cortana override) ────────────────────────
const pgPool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || "5432", 10),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: false,
  max: 5,
});
console.log(`  PG: password auth → ${process.env.PGHOST}`);

const credential = null;
async function getPgAccessToken() { return null; }

// ── Local content URL rewriting ───────────────────────────────
const { HOTD_CONTENT_DIR, STORAGE_ACCOUNT_NAME } = require("../config");
if (HOTD_CONTENT_DIR) {
  const blobPrefix = `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net/hotd-website-content/`;
  const originalQuery = pgPool.query.bind(pgPool);
  pgPool.query = async function (...args) {
    const result = await originalQuery(...args);
    if (result && result.rows) {
      for (const row of result.rows) {
        for (const key of Object.keys(row)) {
          if (typeof row[key] === "string" && row[key].includes(blobPrefix)) {
            row[key] = row[key].replace(blobPrefix, "/hotd-content/");
          }
        }
      }
    }
    return result;
  };
  console.log(`  Content URLs: rewriting blob → /hotd-content/ (${HOTD_CONTENT_DIR})`);
}

// ── bcrypt (optional) ─────────────────────────────────────────
let bcrypt;
try { bcrypt = require("bcryptjs"); } catch (_e) { /* optional in dev */ }

module.exports = { credential, getPgAccessToken, pgPool, bcrypt };
