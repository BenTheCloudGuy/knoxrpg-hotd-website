const fs = require("fs");
const { esc } = require("./utils");

function inlineFormat(text) {
  return text
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:10px;margin:16px 0;box-shadow:0 4px 24px rgba(0,0,0,0.5);" />')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e8b923;">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function markdownToHtml(md) {
  const lines = md.split("\n");
  let html = "", inP = false, inUl = false, inSubUl = false, inTable = false, inBlockquote = false;

  function closeOpen() {
    if (inSubUl) { html += "</ul></li>"; inSubUl = false; }
    if (inUl) { html += "</ul>"; inUl = false; }
    if (inP) { html += "</p>"; inP = false; }
    if (inTable) { html += "</tbody></table></div>"; inTable = false; }
    if (inBlockquote) { html += "</blockquote>"; inBlockquote = false; }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();

    // blank line
    if (!t) { closeOpen(); continue; }

    // blockquote
    if (t.startsWith("> ") || t === ">") {
      if (!inBlockquote) {
        if (inP) { html += "</p>"; inP = false; }
        if (inSubUl) { html += "</ul></li>"; inSubUl = false; }
        if (inUl) { html += "</ul>"; inUl = false; }
        html += '<blockquote style="border-left:3px solid #e8b923;padding:8px 16px;margin:12px 0;color:#999;font-style:italic;">';
        inBlockquote = true;
      } else {
        html += " ";
      }
      html += inlineFormat(t.replace(/^>\s?/, ""));
      continue;
    }
    if (inBlockquote) { html += "</blockquote>"; inBlockquote = false; }

    // table row
    if (t.startsWith("|") && t.endsWith("|")) {
      // skip separator row
      if (/^\|[\s:|-]+\|$/.test(t)) continue;
      const cells = t.split("|").slice(1, -1).map(c => c.trim());
      if (!inTable) {
        if (inP) { html += "</p>"; inP = false; }
        if (inSubUl) { html += "</ul></li>"; inSubUl = false; }
        if (inUl) { html += "</ul>"; inUl = false; }
        html += '<div style="overflow-x:auto;margin:12px 0;"><table style="border-collapse:collapse;width:auto;color:#aaa;font-size:0.95rem;">';
        html += "<thead><tr>";
        for (const c of cells) html += `<th style="border:1px solid #444;padding:6px 14px;color:#e8b923;text-align:left;">${inlineFormat(c)}</th>`;
        html += "</tr></thead><tbody>";
        inTable = true;
        continue;
      }
      html += "<tr>";
      for (const c of cells) html += `<td style="border:1px solid #444;padding:6px 14px;">${inlineFormat(c)}</td>`;
      html += "</tr>";
      continue;
    }
    if (inTable) { html += "</tbody></table></div>"; inTable = false; }

    // sub-list items (4-space or tab indented)
    if (/^(\s{2,}|\t)- /.test(raw)) {
      const content = t.slice(2);
      if (!inSubUl) {
        html += '<ul style="color:#aaa;font-size:0.93rem;line-height:1.7;margin:4px 0 4px 24px;list-style:circle;">';
        inSubUl = true;
      }
      html += `<li>${inlineFormat(content)}</li>`;
      continue;
    }
    if (inSubUl) { html += "</ul></li>"; inSubUl = false; }

    // top-level list items
    if (t.startsWith("- ")) {
      if (inP) { html += "</p>"; inP = false; }
      if (!inUl) { html += '<ul style="color:#aaa;font-size:0.95rem;line-height:1.8;margin:8px 0 12px 24px;list-style:disc;">'; inUl = true; }
      html += `<li>${inlineFormat(t.slice(2))}`;
      // check if next line is a sub-list; if not, close li
      const next = (i + 1 < lines.length) ? lines[i + 1] : "";
      if (!/^(\s{2,}|\t)- /.test(next)) html += "</li>";
      continue;
    }
    if (inUl) { html += "</ul>"; inUl = false; }

    // headings
    if (t.startsWith("#### ")) { if (inP) { html += "</p>"; inP = false; } html += `<h4 style="color:#d4a82a;margin:20px 0 6px;font-size:1rem;">${inlineFormat(t.slice(5))}</h4>`; continue; }
    if (t.startsWith("### ")) { if (inP) { html += "</p>"; inP = false; } html += `<h3 style="color:#e8b923;margin:24px 0 8px;">${inlineFormat(t.slice(4))}</h3>`; continue; }
    if (t.startsWith("## "))  { if (inP) { html += "</p>"; inP = false; } html += `<h2 class="section-title" style="margin-top:36px;">${inlineFormat(t.slice(3))}</h2>`; continue; }
    if (t.startsWith("# "))   { if (inP) { html += "</p>"; inP = false; } html += `<h1 style="color:#e8b923;margin-bottom:16px;">${inlineFormat(t.slice(2))}</h1>`; continue; }
    if (t === "---" || t === "***") { if (inP) { html += "</p>"; inP = false; } html += '<hr style="border:none;border-top:2px solid #333;margin:32px 0;">'; continue; }

    // paragraph text
    if (!inP) { html += '<p style="color:#aaa;font-size:0.95rem;line-height:1.7;margin-bottom:12px;">'; inP = true; } else { html += " "; }
    html += inlineFormat(t);
  }
  closeOpen();
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
