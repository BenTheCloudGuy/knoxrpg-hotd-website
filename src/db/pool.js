const { Pool } = require("pg");

// ── Azure Credential (Arc managed identity on Cortana) ─────────
let credential = null;
let DefaultAzureCredential;
try { ({ DefaultAzureCredential } = require("@azure/identity")); } catch (_e) {}

if (DefaultAzureCredential && process.env.IDENTITY_ENDPOINT) {
  try {
    credential = new DefaultAzureCredential();
    console.log(`  Azure: credential initialized (Arc managed identity)`);
  } catch (err) {
    console.warn(`  Azure: credential init failed: ${err.message}`);
  }
} else {
  console.log(`  Azure: no managed identity (IDENTITY_ENDPOINT not set)`);
}

// ── PostgreSQL Pool ───────────────────────────────────────────
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

async function getPgAccessToken() { return null; }

// ── URL rewriting ─────────────────────────────────────────────
const { HOTD_CONTENT_DIR, STORAGE_ACCOUNT_NAME } = require("../config");
const OLD_STORAGE_HOST = "knoxrpgwebsitestore.blob.core.windows.net";
const NEW_STORAGE_HOST = `${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`;

{
  const blobPrefix = `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net/hotd-website-content/`;
  const localRewrite = HOTD_CONTENT_DIR ? true : false;
  const originalQuery = pgPool.query.bind(pgPool);
  pgPool.query = async function (...args) {
    const result = await originalQuery(...args);
    if (result && result.rows) {
      for (const row of result.rows) {
        for (const key of Object.keys(row)) {
          if (typeof row[key] !== "string") continue;
          // Rewrite old deleted storage account → current storage account
          if (row[key].includes(OLD_STORAGE_HOST)) {
            row[key] = row[key].replace(OLD_STORAGE_HOST, NEW_STORAGE_HOST);
          }
          // Rewrite blob URLs → local content path (dev mode)
          if (localRewrite && row[key].includes(blobPrefix)) {
            row[key] = row[key].replace(blobPrefix, "/hotd-content/");
          }
        }
      }
    }
    return result;
  };
  if (localRewrite) console.log(`  Content URLs: rewriting blob → /hotd-content/ (${HOTD_CONTENT_DIR})`);
  console.log(`  Storage URLs: rewriting ${OLD_STORAGE_HOST} → ${NEW_STORAGE_HOST}`);
}

// ── bcrypt (optional) ─────────────────────────────────────────
let bcrypt;
try { bcrypt = require("bcryptjs"); } catch (_e) { /* optional in dev */ }

module.exports = { credential, getPgAccessToken, pgPool, bcrypt };
