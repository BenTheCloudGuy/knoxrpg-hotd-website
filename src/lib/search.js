const { campaignPages } = require("../config");
const { searchEmbeddings, buildEmbeddingContext } = require("./rag");
const azure = require("./azure");

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
    return { ...p, score };
  }).filter(p => p.score > 0).sort((a, b) => b.score - a.score);
}

async function searchCampaign(query) {
  if (!query || query.length < 2) return { results: [], total: 0 };

  const local = searchCampaignLocal(query);

  // Try pgvector semantic search if OpenAI client is available
  if (azure.openaiClient) {
    try {
      const ragResults = await searchEmbeddings(azure.openaiClient, query, {
        includeDmOnly: false,
        limit: 20,
        minScore: 0.25,
      });
      const mapped = ragResults.map(r => ({
        title: r.title || 'Untitled',
        href: r.source_path || '#',
        category: r.source_type || 'Campaign',
        body: (r.chunk_text || '').slice(0, 300),
        score: Math.round(r.score * 100),
      }));
      // Merge: local pages first, then RAG results, deduplicated by title
      const seen = new Set(local.map(l => l.title));
      const merged = [...local, ...mapped.filter(r => !seen.has(r.title))];
      merged.sort((a, b) => b.score - a.score);
      return { results: merged, total: merged.length };
    } catch (err) {
      console.warn("RAG search failed, falling back to local:", err.message);
    }
  }

  return { results: local, total: local.length };
}

async function buildRagContext(query) {
  if (!azure.openaiClient) return "";
  try {
    return await buildEmbeddingContext(azure.openaiClient, query, { includeDmOnly: false });
  } catch (err) {
    console.warn("RAG context build failed:", err.message);
  }
  return "";
}

module.exports = { searchCampaign, buildRagContext };
