// ══════════════════════════════════════════════════════════════
// ── AUTH ROUTES (login / signup / logout) ─────────────────────
// ══════════════════════════════════════════════════════════════

const { pgPool, bcrypt } = require("../db/pool");
const { readBody, parseForm } = require("../lib/utils");
const { createSession, destroySession, setSessionCookie, clearSessionCookie, validatePassword } = require("../lib/auth");
const { renderLoginPage, renderSignupPage } = require("../pages/auth");

/**
 * Handle auth routes. Returns true if the route was handled, false otherwise.
 */
async function handleAuthRoutes(decoded, req, res, session, url) {

  // ── Login ──────────────────────────────────────────────────
  if (decoded === "/login") {
    if (req.method === "GET") {
      if (session) { res.writeHead(302, { Location: "/account" }); return res.end(); }
      const msg = url.searchParams.get("msg") || "";
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderLoginPage(null, msg));
      return true;
    }
    if (req.method === "POST") {
      try {
        const body = await readBody(req);
        const form = parseForm(body);
        if (!form.username || !form.password) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(renderLoginPage("Username and password are required."));
          return true;
        }
        const result = await pgPool.query("SELECT * FROM account_info WHERE username = $1", [form.username]);
        if (result.rows.length === 0) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(renderLoginPage("Invalid username or password."));
          return true;
        }
        const user = result.rows[0];
        if (!bcrypt) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(renderLoginPage("Server error: bcrypt not available."));
          return true;
        }
        const match = await bcrypt.compare(form.password, user.password_hash);
        if (!match) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(renderLoginPage("Invalid username or password."));
          return true;
        }
        if (!user.is_approved) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(renderLoginPage("Your account has not been approved yet. Please contact an admin."));
          return true;
        }
        const sid = await createSession(user);
        setSessionCookie(res, sid);
        res.writeHead(302, { Location: "/" });
        res.end();
        return true;
      } catch (err) {
        console.error("Login error:", err);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(renderLoginPage("A server error occurred. Please try again."));
        return true;
      }
    }
  }

  // ── Signup ─────────────────────────────────────────────────
  if (decoded === "/signup") {
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderSignupPage());
      return true;
    }
    if (req.method === "POST") {
      try {
        const body = await readBody(req);
        const form = parseForm(body);
        if (!form.firstName || !form.lastName || !form.email || !form.username || !form.password) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(renderSignupPage("All fields are required.", form));
          return true;
        }
        if (form.password !== form.confirmPassword) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(renderSignupPage("Passwords do not match.", form));
          return true;
        }
        const pwErrors = validatePassword(form.password);
        if (pwErrors.length > 0) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(renderSignupPage(pwErrors.join(" "), form));
          return true;
        }
        const existing = await pgPool.query("SELECT id FROM account_info WHERE username = $1 OR email = $2", [form.username, form.email]);
        if (existing.rows.length > 0) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(renderSignupPage("Username or email already exists.", form));
          return true;
        }
        const hash = await bcrypt.hash(form.password, 10);
        await pgPool.query(
          "INSERT INTO account_info (first_name, last_name, email, username, password_hash, role, is_approved) VALUES ($1, $2, $3, $4, $5, 'user', false)",
          [form.firstName, form.lastName, form.email, form.username, hash]
        );
        res.writeHead(302, { Location: "/login?msg=Account created! An admin must approve your account before you can login." });
        res.end();
        return true;
      } catch (err) {
        console.error("Signup error:", err);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(renderSignupPage("A server error occurred. Please try again."));
        return true;
      }
    }
  }

  // ── Logout ─────────────────────────────────────────────────
  if (decoded === "/logout") {
    await destroySession(req);
    clearSessionCookie(res);
    res.writeHead(302, { Location: "/" });
    res.end();
    return true;
  }

  return false;
}

module.exports = { handleAuthRoutes };
