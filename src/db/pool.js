const { Pool } = require("pg");

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

// ── URL rewriting ─────────────────────────────────────────────
const { HOTD_CONTENT_DIR, STORAGE_ACCOUNT_NAME } = require("../config");
const OLD_STORAGE_HOST = "knoxrpgwebsitestore.blob.core.windows.net";
const NEW_STORAGE_HOST = `${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`;

{
  const blobPrefix = `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net/hotd-website-content/`;
  const localRewrite = HOTD_CONTENT_DIR ? true : false;
  const originalQuery = pgPool.query.bind(pgPool);
  // Lazy-required so a circular import (telemetry → ... → pool) can't
  // deadlock module init. telemetry.js only depends on metrics.js and
  // loki-shipper.js today, neither of which import this file, but
  // future-proofing keeps the boot path safe.
  let telemetry = null;
  function getTelemetry() {
    if (telemetry !== null) return telemetry;
    try { telemetry = require("../lib/telemetry"); }
    catch (_e) { telemetry = false; }
    return telemetry;
  }
  pgPool.query = async function (...args) {
    const t0 = Date.now();
    let result;
    try {
      result = await originalQuery(...args);
    } catch (err) {
      // Record the failed query so DB-error rates show in Grafana too.
      const t = getTelemetry();
      if (t) {
        try {
          const sql = typeof args[0] === "string" ? args[0]
                    : (args[0] && args[0].text) || "";
          t.trackDbQuery(sql, 0, Date.now() - t0, "error");
        } catch (_) {}
      }
      throw err;
    }
    // Per-query metric so dashboards finally have data even when no
    // DM-AI tool fired. Role label is "app" for the in-process pool
    // (ai-tools.js still calls trackDbQuery directly with "admin" /
    // "player" for its tool-driven lookups, so those keep their own
    // series and aren't double-counted by source).
    const t = getTelemetry();
    if (t) {
      try {
        const sql = typeof args[0] === "string" ? args[0]
                  : (args[0] && args[0].text) || "";
        t.trackDbQuery(sql, (result && result.rows && result.rows.length) || 0, Date.now() - t0, "app");
      } catch (_) {}
    }
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

module.exports = { pgPool, bcrypt };
