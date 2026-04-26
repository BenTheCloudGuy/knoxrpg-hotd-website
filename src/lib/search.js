const { campaignPages } = require("../config");
const { searchEmbeddings } = require("./rag");
const { pgPool } = require("../db/pool");
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
    spell: 'Spell', monster: 'Monster', magic_item: 'Magic Item',
  };
  return labels[type] || 'Campaign';
}

// ── Breadcrumb path from href ─────────────────────────────────
function breadcrumb(href) {
  if (!href || href === '#') return '';
  return 'hotd.knoxrpg.com' + href;
}

// ── DB keyword search for spells, monsters, magic items ───────
async function searchDndTables(query) {
  const results = [];
  const pattern = `%${query}%`;

  try {
    // Spells
    const spells = await pgPool.query(
      `SELECT name, level, school, activation_type, description_text, source
       FROM spells WHERE name ILIKE $1 ORDER BY name LIMIT 5`, [pattern]);
    for (const s of spells.rows) {
      const lvl = s.level === 0 ? 'Cantrip' : `Level ${s.level}`;
      const snippet = `${lvl} ${s.school || ''} spell. ${(s.description_text || '').slice(0, 250)}`;
      results.push({
        title: s.name,
        href: `/dungeon-master`,
        category: 'Spell',
        body: snippet,
        score: 85,
        breadcrumb: `D&D 5e > Spells > ${s.source || 'SRD'}`,
        source_type: 'spell',
      });
    }

    // Monsters
    const monsters = await pgPool.query(
      `SELECT name, size, type, challenge_rating_display, description_text, source
       FROM monsters WHERE name ILIKE $1 ORDER BY name LIMIT 5`, [pattern]);
    for (const m of monsters.rows) {
      const snippet = `${m.size || ''} ${m.type || ''}, CR ${m.challenge_rating_display || '?'}. ${(m.description_text || '').slice(0, 200)}`;
      results.push({
        title: m.name,
        href: `/dungeon-master`,
        category: 'Monster',
        body: snippet.trim(),
        score: 85,
        breadcrumb: `D&D 5e > Monsters > ${m.source || 'SRD'}`,
        source_type: 'monster',
      });
    }

    // Magic Items
    const items = await pgPool.query(
      `SELECT name, rarity, type, description_text, source
       FROM magic_items WHERE name ILIKE $1 ORDER BY name LIMIT 5`, [pattern]);
    for (const i of items.rows) {
      const snippet = `${i.rarity || ''} ${i.type || 'item'}. ${(i.description_text || '').slice(0, 250)}`;
      results.push({
        title: i.name,
        href: `/dungeon-master`,
        category: 'Magic Item',
        body: snippet.trim(),
        score: 85,
        breadcrumb: `D&D 5e > Magic Items > ${i.source || 'SRD'}`,
        source_type: 'magic_item',
      });
    }
  } catch (err) {
    console.warn('DB keyword search failed:', err.message);
  }

  return results;
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

  // DB keyword search for D&D reference content (spells, monsters, magic items)
  const dbResults = await searchDndTables(query);

  if (!azure.openaiClient) {
    const all = [...local, ...dbResults];
    all.sort((a, b) => b.score - a.score);
    return { results: all.slice(0, 15), total: all.length, aiSummary: '' };
  }

  try {
    const ragResults = await searchEmbeddings(azure.openaiClient, query, {
      includeDmOnly: false,
      limit: 25,
      minScore: 0.2,
    });

    // Filter out lore_json (raw JSON duplicates DB-sourced content) and results with no valid page
    const usable = ragResults.filter(r => {
      if (r.source_type === 'lore_json') return false;
      return resolveHref(r) !== null;
    });

    // Deduplicate: normalize title, group by canonical name, keep highest score
    const deduped = new Map();
    for (const r of usable) {
      const href = resolveHref(r);
      const normTitle = (r.title || '').replace(/\s*\(\d+\/\d+\)\s*$/, '').replace(/\s*\(DM Notes\)\s*$/i, '').trim();
      const key = normTitle.toLowerCase();
      const existing = deduped.get(key);
      if (!existing || r.score > existing.score) {
        deduped.set(key, {
          title: normTitle,
          href,
          category: categoryLabel(r.source_type),
          body: (r.chunk_text || '').slice(0, 400),
          score: Math.round(r.score * 100),
          breadcrumb: breadcrumb(href),
          source_type: r.source_type,
        });
      }
    }

    const ragMapped = Array.from(deduped.values());

    // Merge all sources: local pages + RAG campaign + DB reference, dedup by title
    const seen = new Set();
    const merged = [];
    for (const r of local) { seen.add(r.title.toLowerCase()); merged.push(r); }
    for (const r of ragMapped) { if (!seen.has(r.title.toLowerCase())) { seen.add(r.title.toLowerCase()); merged.push(r); } }
    for (const r of dbResults) { if (!seen.has(r.title.toLowerCase())) { seen.add(r.title.toLowerCase()); merged.push(r); } }
    merged.sort((a, b) => b.score - a.score);

    // AI summary from top campaign RAG + top DB results
    let aiSummary = '';
    const summaryChunks = [];
    for (const r of usable.slice(0, 3)) {
      summaryChunks.push(`[Campaign] ${r.title} (${r.source_type}): ${(r.chunk_text || '').slice(0, 400)}`);
    }
    for (const r of dbResults.slice(0, 3)) {
      summaryChunks.push(`[D&D Reference] ${r.title} (${r.category}): ${(r.body || '').slice(0, 400)}`);
    }
    if (summaryChunks.length > 0) {
      try {
        const context = summaryChunks.join('\n\n');

        const resp = await azure.openaiClient.chat.completions.create({
          model: azure.aiModel,
          max_completion_tokens: 300,
          messages: [
            { role: 'system', content: 'You are a search assistant for a D&D campaign website called "Halls of the Damned". Given campaign data and D&D reference excerpts, write a 2-3 sentence summary that directly answers the search query. Distinguish between campaign-specific content and general D&D rules/lore when both are present. Be concise and factual. Do not use em-dashes. If the context does not clearly answer the query, say so briefly.' },
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
