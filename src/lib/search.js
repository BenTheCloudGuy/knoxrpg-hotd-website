const { campaignPages } = require("../config");

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || "";

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

  // Try RAG semantic search first
  if (RAG_SERVICE_URL) {
    try {
      const res = await fetch(`${RAG_SERVICE_URL}/rag/site-search?q=${encodeURIComponent(query)}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        // Merge RAG results with local page results (local gets priority)
        const local = searchCampaignLocal(query);
        const ragResults = (data.results || []).map(r => ({
          title: r.title,
          href: r.href,
          category: r.category,
          body: r.body,
          score: Math.round(r.score * 100),
        }));
        // Deduplicate: local pages win over RAG for same title
        const seen = new Set(local.map(l => l.title));
        const merged = [...local, ...ragResults.filter(r => !seen.has(r.title))];
        merged.sort((a, b) => b.score - a.score);
        return { results: merged, total: merged.length };
      }
    } catch (err) {
      console.warn("RAG search failed, falling back to local:", err.message);
    }
  }

  const results = searchCampaignLocal(query);
  return { results, total: results.length };
}

async function buildRagContext(query) {
  if (!RAG_SERVICE_URL) return "";
  try {
    const res = await fetch(`${RAG_SERVICE_URL}/rag/context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, maxTokens: 3000 }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.context || "";
    }
  } catch (err) {
    console.warn("RAG context build failed:", err.message);
  }
  return "";
}

module.exports = { searchCampaign, buildRagContext };
