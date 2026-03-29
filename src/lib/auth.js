const crypto = require("crypto");
const { pgPool } = require("../db/pool");
const { isAzure } = require("../config");

const SESSION_COOKIE_NAME = "knoxrpg_sid";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_SEC = SESSION_TTL_MS / 1000;
const COOKIE_DOMAIN = isAzure ? "; Domain=.knoxrpg.com; Secure" : "";

function generateSessionId() { return crypto.randomBytes(32).toString("hex"); }

async function createSession(user) {
  const sid = generateSessionId();
  await pgPool.query(
    `INSERT INTO sessions (sid, user_id, username, role, first_name, last_name, email, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '${SESSION_TTL_SEC} seconds')`,
    [sid, user.id, user.username, user.role, user.first_name, user.last_name, user.email]
  );
  return sid;
}

// ── In-memory session cache (avoids DB round-trip on every dynamic request) ──
const sessionCache = new Map();
const SESSION_CACHE_TTL = 30 * 1000;

async function getSession(req) {
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  const sid = match[1];

  const cached = sessionCache.get(sid);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  try {
    const result = await pgPool.query(
      "SELECT * FROM sessions WHERE sid = $1 AND expires_at > NOW()", [sid]
    );
    if (result.rows.length === 0) { sessionCache.delete(sid); return null; }
    const row = result.rows[0];
    const data = {
      username: row.username,
      role: row.role,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      userId: row.user_id,
    };
    sessionCache.set(sid, { data, expiresAt: Date.now() + SESSION_CACHE_TTL });
    return data;
  } catch (err) {
    console.error("getSession error:", err.message);
    return null;
  }
}

async function destroySession(req) {
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  if (match) {
    sessionCache.delete(match[1]);
    try { await pgPool.query("DELETE FROM sessions WHERE sid = $1", [match[1]]); }
    catch (err) { console.error("destroySession error:", err.message); }
  }
}

function setSessionCookie(res, sid) {
  const domainCookie = `${SESSION_COOKIE_NAME}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SEC}${COOKIE_DOMAIN}`;
  if (COOKIE_DOMAIN) {
    const clearHostOnly = `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
    res.setHeader("Set-Cookie", [clearHostOnly, domainCookie]);
  } else {
    res.setHeader("Set-Cookie", domainCookie);
  }
}

function clearSessionCookie(res) {
  const domainClear = `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${COOKIE_DOMAIN}`;
  if (COOKIE_DOMAIN) {
    const hostOnlyClear = `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
    res.setHeader("Set-Cookie", [hostOnlyClear, domainClear]);
  } else {
    res.setHeader("Set-Cookie", domainClear);
  }
}

// Periodically purge expired sessions (every 30 minutes)
setInterval(() => {
  pgPool.query("DELETE FROM sessions WHERE expires_at < NOW()").catch(() => {});
}, 30 * 60 * 1000);

function validatePassword(password) {
  const errors = [];
  if (!password || password.length < 10) errors.push("Password must be at least 10 characters.");
  if (!/[A-Z]/.test(password)) errors.push("Password must contain at least 1 capital letter.");
  if (!/[0-9]/.test(password)) errors.push("Password must contain at least 1 number.");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Password must contain at least 1 special character.");
  return errors;
}

module.exports = {
  SESSION_COOKIE_NAME,
  createSession,
  getSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  validatePassword,
};
