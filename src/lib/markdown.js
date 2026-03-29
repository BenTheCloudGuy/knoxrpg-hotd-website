const fs = require("fs");
const { esc } = require("./utils");

function inlineFormat(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e8b923;">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function markdownToHtml(md) {
  const lines = md.split("\n");
  let html = "", inP = false, inUl = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (inP) { html += "</p>"; inP = false; }
      if (inUl) { html += "</ul>"; inUl = false; }
      continue;
    }
    if (t.startsWith("- ")) {
      if (inP) { html += "</p>"; inP = false; }
      if (!inUl) { html += '<ul style="color:#aaa;font-size:0.95rem;line-height:1.8;margin:8px 0 12px 24px;list-style:disc;">'; inUl = true; }
      html += `<li>${inlineFormat(t.slice(2))}</li>`;
      continue;
    }
    if (inUl) { html += "</ul>"; inUl = false; }
    if (t.startsWith("### ")) { if (inP) { html += "</p>"; inP = false; } html += `<h3 style="color:#e8b923;margin:24px 0 8px;">${inlineFormat(t.slice(4))}</h3>`; continue; }
    if (t.startsWith("## "))  { if (inP) { html += "</p>"; inP = false; } html += `<h2 class="section-title" style="margin-top:36px;">${inlineFormat(t.slice(3))}</h2>`; continue; }
    if (t.startsWith("# "))   { if (inP) { html += "</p>"; inP = false; } html += `<h1 style="color:#e8b923;margin-bottom:16px;">${inlineFormat(t.slice(2))}</h1>`; continue; }
    if (t === "---" || t === "***") { if (inP) { html += "</p>"; inP = false; } html += '<hr style="border:none;border-top:2px solid #333;margin:32px 0;">'; continue; }
    if (!inP) { html += '<p style="color:#aaa;font-size:0.95rem;line-height:1.7;margin-bottom:12px;">'; inP = true; } else { html += " "; }
    html += inlineFormat(t);
  }
  if (inP) html += "</p>";
  if (inUl) html += "</ul>";
  return html;
}

function renderMarkdownFile(filePath) {
  try { return markdownToHtml(fs.readFileSync(filePath, "utf-8")); }
  catch (_e) { return '<p style="color:#888;">Content not yet available.</p>'; }
}

function renderRichTextBlock(text, fallback = "", style = "color:#aaa;font-size:0.9rem;line-height:1.5;margin-top:8px;") {
  const value = String(text || "").replace(/\r\n?/g, "\n");
  const source = value.trim() ? value : String(fallback || "");
  const escaped = esc(source);
  const formatted = escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e8b923;">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
  return `<div style="white-space:pre-wrap;${style}">${formatted}</div>`;
}

function renderHandoutRichText(text, fallback = "") {
  return renderRichTextBlock(text, fallback);
}

module.exports = {
  inlineFormat,
  markdownToHtml,
  renderMarkdownFile,
  renderRichTextBlock,
  renderHandoutRichText,
};
