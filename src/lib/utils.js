const fs = require("fs");
const path = require("path");
const { STATIC_ROOT } = require("../config");

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeJson(v, fallback) {
  if (fallback === undefined) fallback = [];
  if (Array.isArray(v) || (v && typeof v === "object" && !Buffer.isBuffer(v))) return v;
  if (typeof v === "string") { try { return JSON.parse(v); } catch (_) {} }
  return fallback;
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html", ".css": "text/css", ".js": "application/javascript",
    ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
    ".ico": "image/x-icon", ".webp": "image/webp", ".woff2": "font/woff2",
    ".woff": "font/woff", ".ttf": "font/ttf",
  };
  return types[ext] || "application/octet-stream";
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not Found"); return; }
    res.writeHead(200, { "Content-Type": mimeType(filePath), "Cache-Control": "public, max-age=3600" });
    res.end(data);
  });
}

function serveStaticFile(relativePath, res) {
  const fullPath = path.join(STATIC_ROOT, relativePath);
  if (!fullPath.startsWith(STATIC_ROOT)) { res.writeHead(403); res.end("Forbidden"); return; }
  serveFile(res, fullPath);
}

function sendJSON(res, obj, status = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

function parseForm(body) {
  const params = new URLSearchParams(body);
  const obj = {};
  for (const [k, v] of params) obj[k] = v;
  return obj;
}

async function parseMultipart(req, contentTypeHeader) {
  const boundaryMatch = contentTypeHeader.match(/boundary=([^;\s]+)/);
  if (!boundaryMatch) { return { fields: {}, file: null }; }
  const boundary = boundaryMatch[1];
  const rawBuf = await new Promise((resolve) => {
    const chunks = []; req.on("data", c => chunks.push(c)); req.on("end", () => resolve(Buffer.concat(chunks)));
  });
  const delimiter = Buffer.from(`--${boundary}`);
  const fields = {};
  let file = null;
  let start = 0;
  while (true) {
    const idx = rawBuf.indexOf(delimiter, start);
    if (idx === -1) break;
    const partStart = idx + delimiter.length;
    if (rawBuf[partStart] === 0x2d && rawBuf[partStart + 1] === 0x2d) break;
    const headerStart = partStart + 2;
    const headerEnd = rawBuf.indexOf(Buffer.from("\r\n\r\n"), headerStart);
    if (headerEnd === -1) { start = partStart; continue; }
    const headerStr = rawBuf.slice(headerStart, headerEnd).toString("utf-8");
    const bodyStart = headerEnd + 4;
    const nextDelim = rawBuf.indexOf(delimiter, bodyStart);
    const bodyEnd = nextDelim !== -1 ? nextDelim - 2 : rawBuf.length;
    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]*)"/);
    if (nameMatch) {
      if (filenameMatch && filenameMatch[1]) {
        const ctMatch = headerStr.match(/Content-Type:\s*(.+)/i);
        file = {
          fieldName: nameMatch[1],
          filename: filenameMatch[1],
          data: rawBuf.slice(bodyStart, bodyEnd),
          contentType: ctMatch ? ctMatch[1].trim() : "application/octet-stream"
        };
      } else {
        fields[nameMatch[1]] = rawBuf.slice(bodyStart, bodyEnd).toString("utf-8");
      }
    }
    start = nextDelim !== -1 ? nextDelim : rawBuf.length;
  }
  return { fields, file };
}

module.exports = {
  esc,
  safeJson,
  mimeType,
  serveFile,
  serveStaticFile,
  sendJSON,
  readBody,
  parseForm,
  parseMultipart,
};
