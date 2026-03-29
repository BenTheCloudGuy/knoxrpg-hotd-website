// ══════════════════════════════════════════════════════════════
// ── AUTH PAGES ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

const { esc } = require("../lib/utils");
const { pageShell } = require("../components/shell");

function renderLoginPage(errorMsg, successMsg) {
  const body = `
  <div class="auth-page">
    <h2>Login</h2>
    ${errorMsg ? `<div class="auth-error">${esc(errorMsg)}</div>` : ""}
    ${successMsg ? `<div class="auth-success">${esc(successMsg)}</div>` : ""}
    <form method="POST" action="/login">
      <label for="username">Username</label>
      <input type="text" id="username" name="username" required autocomplete="username">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required autocomplete="current-password">
      <button type="submit" class="auth-btn auth-btn-primary">Login</button>
    </form>
    <br>
    <a href="/signup" class="auth-link">Don't have an account? Sign up</a>
  </div>`;
  return pageShell("Login — Halls of the Damned", "/login", body);
}

function renderSignupPage(errorMsg, formData) {
  const fd = formData || {};
  const body = `
  <div class="auth-page">
    <h2>Create Account</h2>
    ${errorMsg ? `<div class="auth-error">${esc(errorMsg)}</div>` : ""}
    <form method="POST" action="/signup">
      <label for="firstName">First Name</label>
      <input type="text" id="firstName" name="firstName" required value="${esc(fd.firstName || "")}">
      <label for="lastName">Last Name</label>
      <input type="text" id="lastName" name="lastName" required value="${esc(fd.lastName || "")}">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required value="${esc(fd.email || "")}">
      <label for="username">Username</label>
      <input type="text" id="username" name="username" required value="${esc(fd.username || "")}">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required autocomplete="new-password">
      <label for="confirmPassword">Confirm Password</label>
      <input type="password" id="confirmPassword" name="confirmPassword" required autocomplete="new-password">
      <button type="submit" class="auth-btn auth-btn-primary">Sign Up</button>
    </form>
    <br>
    <a href="/login" class="auth-link">Already have an account? Login</a>
    <p style="color:#888;font-size:0.8rem;text-align:center;margin-top:12px;">An admin must approve your account before you can login.</p>
  </div>`;
  return pageShell("Sign Up — Halls of the Damned", "/signup", body);
}

function renderUserAccountPage(session, msg, err) {
  const body = `
  <div class="content">
    <h2 class="section-title">My Account</h2>
    ${err ? `<div class="auth-error">${esc(err)}</div>` : ""}
    ${msg ? `<div class="auth-success">${esc(msg)}</div>` : ""}
    <div class="account-section">
      <h3>Profile</h3>
      <form method="POST" action="/account/update" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div><label style="color:#888;font-size:0.82rem;">First Name</label><input type="text" name="firstName" value="${esc(session.firstName)}" style="width:100%;padding:8px;background:#0d0d0d;border:1px solid #333;color:#e0ddd5;border-radius:4px;"></div>
        <div><label style="color:#888;font-size:0.82rem;">Last Name</label><input type="text" name="lastName" value="${esc(session.lastName)}" style="width:100%;padding:8px;background:#0d0d0d;border:1px solid #333;color:#e0ddd5;border-radius:4px;"></div>
        <div style="grid-column:span 2;"><label style="color:#888;font-size:0.82rem;">Email</label><input type="email" name="email" value="${esc(session.email)}" style="width:100%;padding:8px;background:#0d0d0d;border:1px solid #333;color:#e0ddd5;border-radius:4px;"></div>
        <div style="grid-column:span 2;"><button type="submit" class="auth-btn auth-btn-primary" style="width:100%;">Update Profile</button></div>
      </form>
    </div>
    <div class="account-section">
      <h3>Session Info</h3>
      <p style="color:#888;font-size:0.85rem;">Logged in as <strong style="color:#e8b923;">${esc(session.username)}</strong> &bull; Role: <strong>${esc(session.role)}</strong></p>
      <br>
      <a href="/logout" class="auth-btn auth-btn-secondary" style="display:inline-block;text-decoration:none;text-align:center;">Logout</a>
    </div>
  </div>`;
  return pageShell("Account — Halls of the Damned", "/account", body, session);
}

function renderAdminAccountPage(session, users, msg, err) {
  const userRows = (users || []).map(u => `
    <tr>
      <td>${esc(u.username)}</td><td>${esc(u.first_name)} ${esc(u.last_name)}</td>
      <td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${u.is_approved ? "&#9989;" : "&#10060;"}</td>
      <td>
        ${!u.is_approved ? `<form method="POST" action="/admin/approve-user" style="display:inline;"><input type="hidden" name="userId" value="${u.id}"><button class="admin-btn admin-btn-approve">Approve</button></form>` : ""}
        ${u.role === "user" ? `<form method="POST" action="/admin/promote-user" style="display:inline;"><input type="hidden" name="userId" value="${u.id}"><button class="admin-btn admin-btn-promote">Promote</button></form>` : ""}
        ${u.role === "admin" && u.username !== session.username ? `<form method="POST" action="/admin/demote-user" style="display:inline;"><input type="hidden" name="userId" value="${u.id}"><button class="admin-btn admin-btn-demote">Demote</button></form>` : ""}
        ${u.username !== session.username ? `<form method="POST" action="/admin/delete-user" style="display:inline;" onsubmit="return confirm('Delete ${esc(u.username)}?')"><input type="hidden" name="userId" value="${u.id}"><button class="admin-btn admin-btn-delete">Delete</button></form>` : ""}
      </td>
    </tr>`).join("");

  const body = `
  <div class="content">
    <h2 class="section-title">Admin Dashboard</h2>
    ${err ? `<div class="auth-error">${esc(err)}</div>` : ""}
    ${msg ? `<div class="auth-success">${esc(msg)}</div>` : ""}
    <div class="account-section">
      <h3>User Management</h3>
      <div style="overflow-x:auto;">
      <table class="account-table">
        <thead><tr><th>Username</th><th>Name</th><th>Email</th><th>Role</th><th>Approved</th><th>Actions</th></tr></thead>
        <tbody>${userRows}</tbody>
      </table>
      </div>
    </div>
    <div class="account-section">
      <h3>Your Session</h3>
      <p style="color:#888;font-size:0.85rem;">Logged in as <strong style="color:#e8b923;">${esc(session.username)}</strong> &bull; Role: <strong>admin</strong></p>
      <br>
      <a href="/logout" class="auth-btn auth-btn-secondary" style="display:inline-block;text-decoration:none;text-align:center;">Logout</a>
    </div>
  </div>`;
  return pageShell("Admin — Halls of the Damned", "/account", body, session);
}

module.exports = {
  renderLoginPage,
  renderSignupPage,
  renderUserAccountPage,
  renderAdminAccountPage,
};
