const { campaignPages } = require("../config");
const { searchEmbeddings } = require("./rag");
const azure = require("./azure");

// ── Map source_type + source_id/source_path to site URLs ──────
function resolveHref(r) {
  const type = r.source_type;
  const id = r.source_id;
  const path = r.source_path || '';

  switch (type) {
    case 'npc':       return id ? `/npcs/${id}` : '/npcs';
    case 'session':   return '/sessions';
    case 'artifact':  return id ? `/artifacts/${id}` : '/artifacts';
    case 'handout':   return id ? `/handouts/${id}` : '/handouts';
    case 'calendar':  return '/calendar';
    case 'character': return '/characters';
    case 'journal':   return '/journal';
    case 'lore': {
      // Map known lore files to their pages
      if (path.includes('groups/')) {
        const slug = path.match(/groups\/([^/]+)\.md/);
        return slug ? `/groups/${slug[1]}` : '/groups';
      }
      if (path.includes('realms/')) {
        const slug = path.match(/realms\/([^/]+)\.md/);
        return slug ? `/realms/${slug[1]}` : '/realms';
      }
      if (path.includes('history.md')) return '/history';
      if (path.includes('houserules.md')) return '/house-rules';
      if (path.includes('over-casting.md')) return '/overcasting';
      if (path.includes('casting_circle.md')) return '/circle-magic';
      return null;
    }
    case 'lore_json': return null;
    default: return null;
  }
}

// ── Friendly category labels ──────────────────────────────────
function categoryLabel(type) {
  const labels = {
    npc: 'NPC', session: 'Session Log', artifact: 'Artifact',
    handout: 'Handout', calendar: 'Calendar Event', character: 'Player Character',
    journal: 'Adventure Journal', lore: 'Campaign Lore', lore_json: 'Campaign Data',
  };
  return labels[type] || 'Campaign';
}

// ── Breadcrumb path from href ─────────────────────────────────
function breadcrumb(href) {
  if (!href || href === '#') return '';
  return 'hotd.knoxrpg.com' + href;
}

function searchCampaignLocal(query) {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  const terms = q.split(/\s+/);
  return campaignPages.map(p => {
    let score = 0;
    const titleLc = p.title.toLowerCase();
    const bodyLc = (p.body || "").toLowerCase();
    if (titleLc === q) score += 100;
    if (titleLc.includes(q)) score += 50;
    for (const t of terms) {
      if (titleLc.includes(t)) score += 20;
      if (bodyLc.includes(t)) score += 5;
    }
    return { ...p, score, breadcrumb: breadcrumb(p.href) };
  }).filter(p => p.score > 0).sort((a, b) => b.score - a.score);
}

async function searchCampaign(query) {
  if (!query || query.length < 2) return { results: [], total: 0, aiSummary: '' };

  const local = searchCampaignLocal(query);

  if (!azure.openaiClient) {
    return { results: local, total: local.length, aiSummary: '' };
  }

  try {
    const ragResults = await searchEmbeddings(azure.openaiClient, query, {
      includeDmOnly: false,
      limit: 25,
      minScore: 0.2,
    });

    // Deduplicate: group by resolved href + title, keep highest score chunk
    const deduped = new Map();
    for (const r of ragResults) {
      const href = resolveHref(r) || '#';
      const key = `${href}::${r.title}`;
      const existing = deduped.get(key);
      if (!existing || r.score > existing.score) {
        deduped.set(key, {
          title: r.title,
          href,
          category: categoryLabel(r.source_type),
          body: (r.chunk_text || '').slice(0, 400),
          score: Math.round(r.score * 100),
          breadcrumb: breadcrumb(href),
          source_type: r.source_type,
        });
      }
    }

    const mapped = Array.from(deduped.values());

    // Merge: local pages first, then RAG results, deduplicated by title
    const seen = new Set(local.map(l => l.title));
    const merged = [...local, ...mapped.filter(r => !seen.has(r.title))];
    merged.sort((a, b) => b.score - a.score);

    // AI summary: generate a brief answer from top results
    let aiSummary = '';
    const topChunks = ragResults.slice(0, 5);
    if (topChunks.length > 0) {
      try {
        const context = topChunks.map((r, i) =>
          `[${i + 1}] ${r.title} (${r.source_type}): ${(r.chunk_text || '').slice(0, 500)}`
        ).join('\n\n');

        const resp = await azure.openaiClient.chat.completions.create({
          model: azure.aiModel,
          max_completion_tokens: 300,
          messages: [
            { role: 'system', content: 'You are a search assistant for a D&D campaign website called "Halls of the Damned". Given campaign data excerpts and a search query, write a 2-3 sentence summary that directly answers the query using the provided context. Be concise and factual. Do not use em-dashes. If the context does not clearly answer the query, say so briefly.' },
            { role: 'user', content: `Search query: "${query}"\n\nTop results:\n${context}` },
          ],
        });
        aiSummary = resp.choices[0]?.message?.content || '';
      } catch (err) {
        console.warn('AI summary generation failed:', err.message);
      }
    }

    return { results: merged.slice(0, 15), total: merged.length, aiSummary };
  } catch (err) {
    console.warn("RAG search failed, falling back to local:", err.message);
    return { results: local, total: local.length, aiSummary: '' };
  }
}

async function buildRagContext(query) {
  if (!azure.openaiClient) return "";
  try {
    const { buildEmbeddingContext } = require("./rag");
    return await buildEmbeddingContext(azure.openaiClient, query, { includeDmOnly: false });
  } catch (err) {
    console.warn("RAG context build failed:", err.message);
  }
  return "";
}

module.exports = { searchCampaign, buildRagContext };
