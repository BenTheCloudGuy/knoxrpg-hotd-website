# Changelog

All notable changes to the Halls of the Damned campaign website will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.6.1] - 2026-05-31

### Removed
- **Azure Application Insights.** The app is deployed on self-hosted MicroK8s, not Azure, so shipping telemetry to App Insights has no destination and adds a hard dependency on a connection string that will never exist in this environment.
  - Dropped `applicationinsights@3.14.0` from `src/package.json` (and `src/package-lock.json` via `npm uninstall`).
  - Removed early App Insights bootstrap from `src/server.js` (the block that called `appInsights.setup().start()` if `APPLICATIONINSIGHTS_CONNECTION_STRING` was set).
  - Removed late App Insights Key Vault load from `src/lib/azure.js` (the block that pulled `appinsights-connection-string` and lazily started the SDK after OpenAI init).
  - Rewrote `src/lib/telemetry.js` as a no-op shim. The public API (`trackEvent`, `trackMetric`, `trackLogin`, `trackSignup`, `trackLogout`, `trackAiChat`, `trackDbQuery`) is preserved so the seven call sites in `src/routes/auth.js` and `src/lib/ai-tools.js` keep compiling without edits. Set `HOTD_TELEMETRY_LOG=1` to mirror events to stdout for local debugging.
  - Removed the `appInsights` block from `helm/hotd-website/values.yaml`.
  - Removed the `APPLICATIONINSIGHTS_CONNECTION_STRING` and `APPINSIGHTS_KV_SECRET_NAME` env vars from `helm/hotd-website/templates/deployment.yaml`.
  - Simplified `helm/hotd-website/templates/secret-app.yaml` to render only the OpenAI key (when inline).

### Notes
- Logging is now console-only: `console.log/warn/error` to pod stdout, captured by `kubectl logs`. No other telemetry sink is wired in. If structured event aggregation becomes useful later, the natural fits for this stack are Loki (logs) or the cluster-local Prometheus, both of which can be added without changing the application code paths.

## [3.6.0] - 2026-05-31

### Added
- **Canon auto-update pipeline on Publish.** Publishing a session summary now extracts structured canon updates from the published prose and writes them straight into the campaign database, then reindexes the affected RAG sources. No human approval step.
  - New module `src/lib/canon-extractor.js` calls the configured AI model (`hotd_config.ai_model`) with `response_format: json_object` and returns four typed arrays: `npc_updates`, `npc_creates`, `pc_note_appends`, `calendar_events`. The system prompt is strict: no inventions, no flowery prose, no em-dashes, every change must include a verbatim `source_excerpt` from the summary. The existing NPC roster, PC roster, and calendar events are baked into the prompt so the model matches against canonical IDs rather than inventing them.
  - New module `src/lib/canon-applier.js` applies each proposal in its own try/catch (one bad row never aborts the others), with per-change DB-level dedupe: NPC name folds into existing NPCs, PC notes use substring-match to avoid double-appending, calendar events dedupe by `(day, month_idx, title)`. Allowed NPC update fields: `status`, `location`, `description`, `dm_notes`, `alignment_tag`. PC `notes` and NPC `dm_notes` are append-only and prefixed with `Session N (game_date):`. New NPCs are inserted `is_hidden=TRUE` so the DM can review before exposing.
  - **Policy C calendar headline**: when `hotd_sessions.game_date` parses cleanly (`M/D[/Y]` or `Day N of Month M`), a deterministic `Session N: <title>` event is written for that date, in addition to any in-narrative dated events the LLM extracts.
  - New table `hotd_canon_audit` in `src/db/schema.js` records every applied change with `session_id`, `target_kind`, `target_id`, `operation`, `field`, `before_value`, `after_value`, `source_excerpt`, `rationale`, `applied_by`. A `UNIQUE (session_id, target_kind, target_id, field, operation)` constraint guarantees re-publishing the same session never double-applies the same change.
  - `src/routes/dm-admin-api.js` Publish handler runs extract → apply → reindex inline. If any stage fails the publish itself still succeeds; the error is surfaced in the response under `canon_error` and logged server-side.
  - `src/pages/admin.js` Publish button now uses the progress bar and reports the applied counts in the status line, e.g. `Published in 47s. Canon: 1 NPC created, 3 NPCs updated, 2 PC notes appended, 1 calendar event added. RAG reindexed (3 sources).`
- **PC character RAG chunks now include backstory, notes, equipment, spells, attacks, features, languages, faith, personality/ideals/bonds/flaws.** `scripts/embed-pipeline.js` was previously embedding only identity + stats, which meant the appended campaign-history notes (the destination for the new pipeline's PC writes) were not searchable. JSONB columns are flattened to readable name lists via a new `safeJsonArray` helper.

### Notes
- The applier spawns `scripts/embed-pipeline.js --source X --mode incremental` per touched source type in parallel after canon writes commit. Sources possible: `npc`, `character`, `calendar`, plus `session` (always, since the session itself was just republished). Reindex runs are awaited so the Publish response only returns once RAG is consistent with the new canon.
- Audit log retention is unbounded; rows persist with the session via `ON DELETE CASCADE`. Rollback tooling is not part of this release; the audit table is structured to support it later (every row has both `before_value` and `after_value`).
- The extractor's roster cap is 200 NPCs in the prompt. If the campaign exceeds that, the cap should be revisited or swapped for a similarity-based shortlist.

## [3.5.8] - 2026-05-31

### Added
- **Production PDF generation now actually runs.** The container image and Helm chart now ship the full PDF pipeline so `Create PDF` from the Sessions Workspace works on `hotd.knoxrpg.com`, not just in the devcontainer.
  - `docker/Dockerfile` installs `pandoc`, `weasyprint`, `fonts-dejavu`, `fonts-liberation`, and `ca-certificates` via apt (with `--no-install-recommends`).
  - `docker/Dockerfile` copies `scripts/` into `/app/scripts/` so `build-session-pdf.js` and `session-pdf.css` are on disk in the image.
  - `docker/Dockerfile` creates `/app/reports` with `a+rwX` so the non-root `node` user (uid 1000) can write generated PDFs.
  - `docker/Dockerfile` bakes in `HOTD_REPO_ROOT=/app`, `HOTD_PDF_SCRIPT=/app/scripts/build-session-pdf.js`, and `HOTD_REPORTS_DIR=/app/reports` so the route resolver is unambiguous.
  - `helm/hotd-website/templates/deployment.yaml` mounts a writable `emptyDir` at `/app/reports` (PDFs are regenerable from the markdown stored in `hotd_sessions`, so no PVC needed) and exports the matching `HOTD_*` env vars to the pod.
  - `helm/hotd-website/values.yaml` exposes a `reports` block (`mountPath`, `sizeLimit: 512Mi`, `pdfScript`) for operator overrides.

### Notes
- After this release deploys, retry `Create PDF` on `https://hotd.knoxrpg.com/sessions/admin`. The progress bar shipped in 3.5.7 will run until WeasyPrint finishes, then the status line should report `PDF ready in Xs.`
- The `emptyDir` is wiped on pod restart. That is fine: the row's `pdf_path` is rebuilt on demand and the source-of-truth markdown lives in the database.

## [3.5.7] - 2026-05-31

### Fixed
- **PDF generation `EACCES /reports`** — `src/routes/dm-admin-api.js` now resolves the repo root by walking up from `__dirname` until it finds a `package.json`, instead of assuming a fixed two-level layout. In the production container `src/` is flattened into `/app`, so the old `path.join(__dirname, "..", "..")` resolved to `/` and the route then tried `mkdir /reports` as a non-root user. New resolver returns `/app` (where the container's `package.json` lives) or the dev repo root as appropriate. Env overrides `HOTD_REPO_ROOT`, `HOTD_PDF_SCRIPT`, and `HOTD_REPORTS_DIR` are honored when set.
- **PDF route preflight errors** — POST `/api/dm-admin/sessions/:id/pdf` now returns a clear `501` with the missing-script path when `scripts/build-session-pdf.js` is not bundled in the image, and a `500` with the unwritable directory + `HOTD_REPORTS_DIR` hint when `mkdir` fails, instead of bubbling a raw `EACCES` to the UI.

### Added
- **Long-running op progress bar** — Sessions Workspace (`src/pages/admin.js`) shows an indeterminate gold-sweep progress bar with an elapsed-time counter while **Create PDF** or **Generate Summary** is running. All action buttons (Save, Create PDF, Generate Summary, Publish, Unpublish, Delete, + New) are disabled with a wait cursor for the duration. Final status reports the elapsed time, e.g. `PDF ready in 18s.` or `Summary generated in 42s (3,127 tokens).` Save and Publish remain on the plain status line since they are fast.

### Notes
- Production PDF generation on `hotd.knoxrpg.com` still requires Dockerfile and Helm changes (install `weasyprint` + `pandoc` + fonts, `COPY scripts/` into `/app/scripts/`, mount a writable reports volume). Tracked separately, not in this release.

## [3.5.6] - 2026-05-31

### Added
- **Sessions Workspace** — `/sessions/admin` rewritten as a two-pane editor (30% session list, 70% markdown editor). Drives EasyMDE 2.18.0 with marked + DOMPurify preview. Buttons: **Save**, **Create PDF**, **Generate Summary**, **Publish Summary**, **Unpublish**, **Delete**. List is newest-first. Auto-loads the most recent session on open. Drafts get a `[DRAFT]` badge inline. Beforeunload guard on unsaved changes.
- **Publish / Draft gating** — new `hotd_sessions` columns: `markdown TEXT`, `published BOOLEAN`, `published_at TIMESTAMPTZ`, `pdf_path TEXT`, `pdf_generated_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`. Public `/sessions` page now filters to `published = TRUE` for non-admin viewers; admins see drafts with a red `[DRAFT]` badge. One-time seed: every existing row with a non-empty `summary` is backfilled into `markdown` and marked `published = TRUE` so legacy content is preserved exactly as players have always seen it.
- **JSON API endpoints** for the Sessions Workspace (`src/routes/dm-admin-api.js`, all admin-gated):
  - `GET /api/dm-admin/sessions` — list (without the heavy `markdown` blob).
  - `GET /api/dm-admin/sessions/:id` — single session including `markdown`.
  - `POST /api/dm-admin/sessions` / `PUT /api/dm-admin/sessions/:id` — create / save (whitelisted to `session_number`, `title`, `markdown`, `game_date`, `play_date`; `published`, `summary`, `pdf_path` mutated only by their dedicated endpoints).
  - `POST /api/dm-admin/sessions/:id/pdf` — strips `# Session Summary` from the markdown, writes a tmpfile, runs `scripts/build-session-pdf.js --input-file TMP --out reports/sessionNN-gm-guide.pdf`, records `pdf_path` / `pdf_generated_at`.
  - `GET /api/dm-admin/sessions/:id/pdf` — streams the generated PDF (path-traversal guarded; must resolve under `reports/`).
  - `POST /api/dm-admin/sessions/:id/generate-summary` — reads `# Session Notes`, pulls RAG context via `buildEmbeddingContext()` (limit 10) plus the last 3 prior published summaries, calls the configured AI model (`hotd_config.ai_model`) with a system prompt that bakes in the writing-style rules (no em-dashes, no flowery prose, 4-8 short paragraphs, third-person past tense, no invented events), overwrites the `# Session Summary` H1 body.
  - `POST /api/dm-admin/sessions/:id/publish` — extracts the `# Session Summary` body, writes it to the `summary` column, sets `published = TRUE`, sets `published_at = NOW()`.
  - `POST /api/dm-admin/sessions/:id/unpublish` — flips `published = FALSE` so the row drops back into draft state.
- **PDF script flags** (`scripts/build-session-pdf.js`) — new `--input-file PATH` and `--title TITLE` so the API can drive the existing WeasyPrint pipeline from a DB markdown blob without needing a file under `src/hotd-campaign/sessions/`. Backward-compatible: `--session N` still works.

### Changed
- **`session-summary` skill** (`.squad/skills/session-summary/SKILL.md`) — added a "Sessions Workspace UI" section documenting the H1 section contract (`# Session Notes`, `# Session Summary`), the Generate Summary AI contract, the Publish contract, and the GM Guide PDF contract. Clarifies when Bard should use the UI vs. the legacy file-based prep flow.
- **Public `/sessions` page** (`src/pages/campaign.js`) — query is now role-aware: admins see all rows with a `[DRAFT]` badge on unpublished entries; everyone else only sees `published = TRUE`.

### Notes
- The GM Guide PDF deliberately excludes the `# Session Summary` section: it is for the DM at the table, not for players.
- The legacy `/admin/sessions/{add,update,delete}` POST routes in `src/routes/admin.js` are retained for any external integrations but the new UI uses the JSON API exclusively.

## [3.5.5] - 2026-05-30

### Added
- **Custom MCP server** (`src/mcp/`) exposing 16 tools to MCP-aware AI agents (Claude Desktop, VS Code Copilot, future cluster agents). Built on `@modelcontextprotocol/sdk` ^1.29 with both `stdio` (default) and `http`/`sse` transports. Wraps the website's existing AI function tools (`lookup_npc`, `search_npcs`, `get_session_log`, `lookup_spell`, `lookup_monster`, `lookup_magic_item`, `lookup_artifact`, `get_player_character`, `get_handout`, `get_calendar`, `search_dnd_reference`, `search_campaign_lore`) and adds four custom tools: `search_embeddings` (raw pgvector hybrid), `rag_status` (coverage + freshness report), `trigger_reindex` (spawn `scripts/embed-pipeline.js` for any source, 5min timeout), `story_forge_generate` (in-process port of the DM-admin Story Forge endpoint, 9 templates).
- **MCP entry guard** — `src/mcp/server.mjs` redirects all `console.log` and stray non-JSON `process.stdout.write` to stderr in stdio mode so init-time logs from `src/db/pool.js` and `src/lib/azure.js` cannot corrupt the JSON-RPC frame stream.
- **Bearer auth** (`MCP_AUTH_TOKEN`) for the HTTP transport (`src/mcp/auth.mjs`). If unset, HTTP is open and must be bound to 127.0.0.1.
- **MCP scripts** in `src/package.json`: `npm run mcp` (stdio) and `npm run mcp:http` (HTTP/SSE on 127.0.0.1:7456).
- **MCP README** (`src/mcp/README.md`) — tool reference, env requirements, VS Code `.vscode/mcp.json` example, Claude Desktop config example, remote HTTP curl example. Helm deployment for the HTTP transport is noted as deferred.
- **Session PDF skill & script** — `.squad/skills/session-pdf/SKILL.md` plus `scripts/build-session-pdf.js` and `scripts/session-pdf.css`. Generalizes the hardcoded `scripts/build-session27-pdf.js`. Defaults to the WeasyPrint engine for proper CSS3 paged-media (no mid-bullet page splits, headings stay with content, tables never break mid-row), with `wkhtmltopdf` as a fallback via `--engine wkhtmltopdf`. Options: `--statblocks`, `--include-allies`, `--include-monsters`, `--size`, `--notes N` (default 4 trailing blank pages with a `# Notes` heading for Kindle Scribe handwriting), `--no-notes`. Output format matches the established session27 PDF (sans-serif, A4, 15mm margins, dark-red blockquote rule).
- **Session 29 prep file** (`src/hotd-campaign/sessions/session29.md`) — full NPC roster (allies, Vallaki council, off-screen enemies), Krezk and the Abbot history (Markovia, fallen deva, Vasilka, recent Tser Raven / Tser Hill assault), Allied Werewolves pack roster, Kiril Stoyanovich and the renegade Blood Hunters, and a Strategic Briefing covering Castle Ravenloft defenses, allies of Strahd, the Amber Temple, the Sun Sword reforge requirements, and the likely party split.

### Changed
- **Voice rules locked into the session-summary skill** — `.squad/skills/session-summary/SKILL.md` gained 14 non-negotiable voice rules (no em-dashes, no "not X but Y" constructions, no flowery AI-fantasy prose, concrete nouns and verbs, etc.) with a "Would a real person say this out loud?" test. `.squad/agents/bard/charter.md` now points to the skill as the canonical voice authority.
- **Vallaki canon update** — `src/hotd-campaign/data/npcs.json`: Mordenkainen (id 93), Rudolph Van Richten (id 5), and Ezmerelda d'Avenir (id 6) all relocated to Vallaki / Blue Water Inn after the Battle of Tser Hill. Van Richten dropped the Rictavio disguise. DB synced via `scripts/sync-npcs.js` (81 upserted), RAG re-embedded via `scripts/embed-pipeline.js --source npc` (3 new vectors, 195 NPC chunks total).
- **NPC URL documentation patched** — `.squad/skills/session-summary/SKILL.md` and `.squad/agents/bard/charter.md` now correctly state that `https://hotd.knoxrpg.com/npcs/{id}` resolves against `hotd_npcs.id` (DB primary key), **not** the `npcid` field in `npcs.json`. The two differ (e.g. Mordenkainen is `npcid=93` but `id=669`). Added the canonical lookup SQL and the MCP `search_campaign_lore` alternative; clarified that `npcid` is still the correct identifier for in-DM-notes citations.
- **Session 28 title** (`src/hotd-campaign/sessions/session28.md`) — added missing `# Session 28 - Battle of Tser Hill #` H1 heading for parity with other session files.

### Notes
- `query_database` and `describe_table` are deliberately NOT exposed via MCP — only typed lookups are.
- All MCP tool calls run in DM mode (`isDM = true`); treat the MCP surface as privileged.
- `scripts/build-session27-pdf.js` is retained for historical reproducibility; new sessions should use `scripts/build-session-pdf.js`.
- `reports/embed-report-*.json`, `reports/session*-dm-guide.pdf`, and `reports/session*-combined.md|html` are now `.gitignore`d as build artifacts. Three previously-tracked `embed-report-*.json` files were untracked in this commit.

## [3.5.4] - 2026-05-30

### Changed
- **Squad agent roles reshaped** — Artificer is now the Lead Engineer owning all code, RAG/AI infrastructure, DB, auth, Docker, Helm, MicroK8s, and CI/CD. Mercer is now narrative-only (rooms, traps, monster/NPC scenes, treasure, scene framing, attack narration, canon fact-checking) with no code or infrastructure responsibilities. Bard owns campaign art plus session tracking and summaries. Updates applied across `.squad/agents/*/charter.md`, `.squad/team.md`, `.squad/routing.md`, `.squad/config.json`, and the inline roster/quick-reference in `.github/agents/squad.agent.md`.
- **Mandatory Squad routing** — `.github/copilot-instructions.md` now requires every request to be routed through the Squad coordinator, with a narrow Direct Mode exception explicitly scoped to status/factual questions. Added fallback guidance when the coordinator or routing file cannot be loaded.
- **Remote server values flagged as secrets** — `.github/copilot-instructions.md` now instructs the model to treat the SSH/IP/username values in the Configure Remote Server section as secrets and never echo them in generated documentation, commit messages, PR descriptions, or user-facing output unless explicitly asked.

### Added
- **Narrative Prose skill** (`.squad/skills/narrative-prose/SKILL.md`) — Mercer's playbook for room, trap, monster, treasure, scene, and attack descriptions, with voice rules, a 5-tier reference order, and per-content-type templates.
- **Session Summary skill** (`.squad/skills/session-summary/SKILL.md`) — Bard's playbook for session prep files and `hotd_sessions` summaries, with the embed re-index command and NPC link conventions.
- **RAG operations & search quality** ownership added to Artificer's charter — covers monitoring `/api/dm-admin/rag-status`, re-indexing non-session sources via `scripts/embed-pipeline.js`, public `/api/search` quality audits, and the function-tool surface (`lookup_npc`, `search_npcs`, `get_session_log`, `lookup_spell`, `lookup_monster`) consumed by Mercer and Ranger.
- **Ranger RAG access** documented — Ranger now consults RAG-backed function tools for faction ties, location context, and prior encounter notes before finalizing stat blocks; added Reference Sources and Handoffs sections to Ranger's charter.

### Fixed
- **Mercer charter RAG language** — corrected misleading wording that implied direct `src/lib/rag.js` calls; Mercer's actual access is via Story Forge context injection (`buildEmbeddingContext()`) and AI function tools. Pipeline ownership stays with Artificer.

## [3.5.3] - 2026-04-26

### Fixed
- **Reference pages show complete content** — reference pages now fetch all sibling chunks from the same section/chapter (matched by `source_path` and normalized title), joining them in order to display the full content instead of a single ~3,000 char chunk

## [3.5.2] - 2026-04-26

### Added
- **Dynamic reference pages** (`/reference/:hash`) — DDB search results now link to dynamically generated pages that render embedding content on the fly from `hotd_embeddings`; pages show category label, source book, back-to-search link, and full styled content via `markdownToHtml()`
- **Ephemeral page routing** — validates 64-char hex hash format before querying DB; no storage needed, content generated per request

### Changed
- **DDB search results link to reference pages** — spells, monsters, races, classes, feats, backgrounds, and book chapters now link to `/reference/<chunk_hash>` instead of `/dungeon-master`
- **Campaign results unchanged** — NPCs, groups, realms, sessions still link to their dedicated pages
- **`rag.js` returns `chunk_hash`** — search results now include the embedding hash for URL construction

## [3.5.1] - 2026-04-26

### Fixed
- **Phase full mode wiping other phases** — `storeChunks()` was clearing ALL DDB source types regardless of which phase was running; Phase 1 re-run was deleting Phase 3 book embeddings (23,349 chunks lost); now only clears source types present in the current batch
- **Homebrew monster storage failures** — `monsters.id` is TEXT but `hotd_embeddings.source_id` is INTEGER; 6+ homebrew monsters with slug IDs (e.g. `hotd-hotd-arrigal-vanduva`) failed to store; now stores non-numeric IDs in `source_path` with `source_id` set to NULL
- **Total embeddings restored to 37,624** (was 16,197 with broken book storage)

## [3.5.0] - 2026-04-26

### Added
- **DDB Content Embedding Pipeline** (`scripts/embed-ddb-content.js`) — new 3-phase pipeline to embed all D&D Beyond and rulebook content into pgvector for RAG search and DM AI
  - **Phase 1: Structured DDB data** — downloads and embeds races (91), classes (257), feats (185), and backgrounds (115) from `books-extracted` Azure Blob container; flattens JSON into embeddable prose with traits, features, and descriptions
  - **Phase 2: DB table descriptions** — embeds `description_text` from existing `spells`, `monsters`, and `magic_items` PostgreSQL tables
  - **Phase 3: Full book prose** — downloads and embeds 108 D&D rulebooks from `books-text` Azure Blob container; chapter-aware chunking produces ~23,000 chunks covering all rulebook content
  - Supports `--phase 1|2|3|all`, `--mode full|incremental|dry-run`, `--verbose` flags
  - Hash-based incremental indexing (same pattern as campaign embed pipeline) — only re-embeds changed content on rerun
  - Full mode preserves campaign embeddings (only clears DDB source types)
  - IVFFlat index auto-rebuild after significant inserts
  - Azure Blob access via managed identity (`DefaultAzureCredential`)
  - Designed for rerun as new DDB content is added to the storage account
- **DDB change detection** (`scripts/check-ddb-changes.js`) — compares Azure Blob timestamps and DB row counts against a manifest file (`embed-ddb-manifest.json`) stored in blob storage; detects which phases need rerun
- **GitHub Actions workflow** (`.github/workflows/embed-ddb.yml`) — scheduled daily at 6 AM UTC + manual dispatch; runs change detection first, then only executes phases with new content; supports `--phase`, `--mode`, and `skip_change_check` inputs
- **Manifest tracking** — after successful embedding, updates the manifest in `hotd-website-content/embed-ddb-manifest.json` with current blob timestamps and DB checksums; subsequent runs skip unchanged content
- **New source types in search** — `ddb_race`, `ddb_class`, `ddb_feat`, `ddb_background`, `ddb_spell`, `ddb_monster`, `ddb_magic_item`, `dnd_book` all mapped to DM AI with book-style breadcrumbs (`D&D 5e > Races > PHB 2024`)

### Changed
- **Search breadcrumbs** — DDB content shows `D&D 5e > Category > Source` style paths; book prose shows `D&D 5e > Books > book-code`
- **Category labels** — added Race, Class, Feat, Background, D&D Rulebook to search result labels

## [3.4.2] - 2026-04-26

### Fixed
- **Raw JSON in search results** — filtered out `lore_json` source type entirely (raw `JSON.stringify` of NPC/data objects that duplicate DB-sourced embeddings)
- **Non-clickable search results** — results with no valid site URL are now excluded instead of showing with dead `#` links
- **Persistent duplicates** — title normalization now strips chunk markers `(1/2)` and `(DM Notes)` suffixes, uses case-insensitive dedup across all merge layers

### Added
- **D&D reference search** — site search now queries `spells`, `monsters`, and `magic_items` DB tables directly via keyword `ILIKE` matching, returning results with source book breadcrumbs (`D&D 5e > Spells > PHB`) and links to DM AI for full details
- **Three-layer search merge** — results now merge: local page index + pgvector campaign RAG + DB keyword reference, deduplicated by normalized title
- **AI Overview includes D&D reference** — GPT summary draws from both campaign RAG and DB reference results, distinguishing between campaign-specific and general D&D content

## [3.4.1] - 2026-04-26

### Fixed
- **Search result links 404** — RAG results used raw `source_path` (file paths like `src/hotd-campaign/data/npcs.json`) as hrefs; added `resolveHref()` to map `source_type` + `source_id`/`source_path` to real site URLs (`/npcs/5`, `/groups/vistani`, `/realms/damara`, etc.)
- **Duplicate search results** — same entity appearing 3-4 times from different embedding chunks; added deduplication by href+title, keeping highest-scoring chunk per entity

### Added
- **AI Overview on search** — GPT generates a 2-3 sentence summary from top results, displayed above the result list
- **Google-style search UI** — replaced boxed card layout with clean borderless results: green breadcrumb paths, blue linked titles, snippet text with query term highlighting, category labels, and relevance percentages
- **Search timing and count** — result metadata line ("About 12 results (0.45 seconds)")
- **Friendly category labels** — `source_type` values mapped to readable names (NPC, Session Log, Player Character, Campaign Lore, etc.)

### Changed
- **Search result ranking** — results sorted by pgvector cosine similarity score displayed as relevance percentage

## [3.4.0] - 2026-04-26

### Added
- **Overcasting page** (`/overcasting`) — full rendered markdown page for the Overcasting homebrew mechanic with back-link to House Rules
- **Circle Magic page** (`/circle-magic`) — full rendered markdown page for the Circle Magic homebrew mechanic with back-link to House Rules
- **House Rules submenu** — hovering over House Rules in the Game Info nav dropdown now shows a flyout submenu with Overcasting and Circle Magic links; mobile drawer shows them as indented children
- **Markdown table rendering** — `markdownToHtml()` now parses pipe-delimited markdown tables into styled HTML tables with header rows
- **Markdown blockquote rendering** — `markdownToHtml()` now renders `> text` as gold-bordered italic quote blocks
- **Markdown nested list rendering** — `markdownToHtml()` now handles indented sub-lists with circle bullet styling
- **Markdown h4 heading support** — `markdownToHtml()` now renders `####` headings

### Fixed
- **Site search broken** — `search.js` was still trying to reach the external RAG microservice (removed in v3.0.0); rewired to use pgvector semantic search via `rag.js` and the OpenAI embeddings client directly
- **`buildRagContext()` dead code** — was calling a non-existent external RAG endpoint; now delegates to `buildEmbeddingContext()` from `rag.js`

### Changed
- **Search results now include campaign content** — search returns NPCs, sessions, lore, spells, and other embedded content from pgvector alongside the static page index

## [3.3.4] - 2026-04-26

### Fixed
- **House Rules page** — fixed formatting issues converting from Markdown to HTML via the sever.js handler.


## [3.3.3] - 2026-04-26

### Changed
- **House Rules page** — replaced static image with rendered markdown content; scales properly at all resolutions and matches the site's look and feel
- **House Rules content** — full house rules written out as structured markdown with Table Rules, Mechanic Rules, and Magic sections including Overcasting and Circle Magic summaries with links to full rule pages

## [3.3.2] - 2026-04-26

### Fixed
- **App Insights cloud role name** — set `OTEL_SERVICE_NAME=hotd-website` for applicationinsights v3.x (OpenTelemetry); replaces broken v2 context tags API that showed as `unknown_service:node`

## [3.3.1] - 2026-04-26

### Fixed
- **Telemetry lazy client getter** — `telemetry.js` now lazily resolves `defaultClient` on each call instead of caching null at module load time; fixes custom events not being sent when App Insights is late-initialized from Key Vault

## [3.3.0] - 2026-04-26

### Added
- **Azure Application Insights APM** — `hotd-website-insights` resource created in `cloudgeek-cus-mgmt`, linked to `cloudgeek-cus-law` Log Analytics workspace
- **Full auto-instrumentation** — HTTP requests, PG dependencies, exceptions, performance counters, console logs, live metrics, and distributed tracing (W3C)
- **Telemetry helper module** (`src/lib/telemetry.js`) — `trackEvent`, `trackMetric`, and domain-specific helpers for auth, AI chat, and DB queries
- **Auth event tracking** — login success/failure (with IP and user agent), signup, and logout events sent as App Insights custom events
- **DM AI chat tracking** — every chat completion tracked with username, role, model, token usage, latency, tool calls, and finish reason
- **Generic DB query tracking** — `query_database` tool logs SQL, row count, latency, and user role
- **App Insights connection string in Key Vault** — stored as `appinsights-connection-string` secret; loaded via Arc managed identity at startup if env var not set
- **Container Insights deployed** — `azuremonitor-containers` extension installed on `cgl-cortana-k8s` Arc cluster, streaming container logs and metrics to `cloudgeek-cus-law`
- **Helm support for App Insights** — `appInsights.connectionString` and `appInsights.kvSecretName` values; `APPLICATIONINSIGHTS_CONNECTION_STRING` and `APPINSIGHTS_KV_SECRET_NAME` env vars in deployment template

### Changed
- **`server.js` App Insights bootstrap** — enhanced with auto-collect for requests, performance, exceptions, dependencies, console, live metrics, distributed tracing, and cloud role tag
- **`azure.js` late-init** — loads App Insights connection string from Key Vault during `initOpenAI()` if not already set via env var

## [3.2.1] - 2026-04-26

### Fixed
- **Broken monster/magic item images** — bulk-updated 5,775 image URLs across 5 tables (monsters, magic_items, hotd_artifacts, hotd_maps, hotd_art) from deleted `knoxrpgwebsitestore` storage account to `cloudgeekcusgaming01`
- **Storage URL safety net** — `pool.js` URL rewrite proxy now catches any remaining `knoxrpgwebsitestore.blob.core.windows.net` references at query time and rewrites them to the current storage account, preventing broken images if data is re-synced with old URLs

## [3.2.0] - 2026-04-26

### Added
- **`describe_table` tool** — DM AI can now inspect any allowed table's column names and types on demand, enabling it to write accurate SQL queries without pre-loaded schemas
- **`query_database` tool** — DM AI can now execute arbitrary read-only SELECT queries against the database for listing, filtering, counting, and aggregating data (e.g., "list all cantrips", "how many evocation spells are there", "which NPCs are in Vallaki")
- **Table allowlist with role-based access** — `describe_table` and `query_database` enforce an allowlist of queryable tables; players are blocked from directly querying `hotd_npcs` and `monsters` (must use dedicated tools with filtering)
- **Read-only transaction enforcement** — all generic queries execute inside a PostgreSQL `BEGIN READ ONLY` transaction, preventing any write operations even via SQL injection
- **Query security validation** — blocks non-SELECT statements, semicolons (statement chaining), and access to sensitive tables (sessions, account_info, etc.)

### Changed
- **System prompt updated for hybrid query approach** — dedicated lookup tools for single-item lookups, `describe_table` + `query_database` for anything requiring listing, filtering, or aggregation
- **Max tool rounds increased to 6** — accommodates the two-step describe → query pattern without hitting the loop limit

### Removed
- **`search_spells` tool** — replaced by the generic `query_database` tool which handles all listing/filtering use cases across all tables

## [3.1.0] - 2026-04-26

### Added
- **Role-based DM AI access control** — DM AI now distinguishes between DM (admin) and Player roles, filtering responses accordingly
- **Auth gate on DM AI** — `/dungeon-master` page and `/api/chat` endpoint now require login; unauthenticated users are redirected to login
- **DM-only system prompt** — DM gets full access to hidden NPCs, DM notes, secret plot elements, and complete monster stat blocks
- **Player-restricted system prompt** — players cannot access hidden NPCs, DM notes, full monster stat blocks, or secret story elements; monster queries return in-world flavor only
- **User identity in prompt** — system prompt now includes the user's name and role for personalized, context-aware responses
- **Content-type formatting guide** — system prompt includes per-type formatting rules for spells, NPCs, session logs, magic items, and player characters
- **`buildSystemPrompt()` function** — dynamically assembles the system prompt based on role and user context

### Changed
- **`executeTool()` accepts `isDM` flag** — all tool queries now filter data based on user role
- **NPC queries filter by visibility** — `lookup_npc` and `search_npcs` exclude `is_hidden = TRUE` NPCs for players; DM sees all NPCs including `dm_notes`
- **Monster queries filter by role** — players get flavor-only data (name, type, size, alignment, description); DM gets full stat block
- **RAG searches pass `includeDmOnly`** — `search_dnd_reference` and `search_campaign_lore` now surface `is_dm_only` content for DM only
- **Spell lookup returns human-readable keys** — raw DB columns like `activation_type` mapped to `casting_time`, `range_field` to `range`, combined `source` + `source_page` into single citation
- **Max tokens scaled by role** — DM gets 4096 max tokens (for full stat blocks), players get 2048
- **Session summary search truncation** — increased from 500 to 1000 characters for better context
- **`chatWithTools()` accepts session opts** — new `isDM`, `username`, `userId` parameters passed from API route
- **Improved RAG fallback messaging** — model must explicitly label general D&D knowledge as such when tools return no results

### Fixed
- DM AI no longer exposes hidden NPCs or DM notes to players
- DM AI no longer returns full monster stat blocks to players
- DM notes (`dm_notes` column) now actually returned to DM when looking up NPCs (was never included in SELECT)
- DM-only RAG content (`is_dm_only = TRUE` embeddings) now visible to DM (was hardcoded to exclude)

## [3.0.0] - 2026-04-25

### Added
- **Circle Magic homebrew mechanic** — new `casting_circle.md` lore document defining cooperative spellcasting rules with Netherese origins, The Lead / Circle Members system, slot pooling, metamagic-style Circle Enhancements (Empower, Heighten, Widen, Extend, Reach, Fortify, Quicken, Distribute, Safeguard, Supplant), circle breaking mechanics, and passive save DC scaling
- **Homebrew stat block sync** — new `sync-statblocks.js` parses statBlocks/*.md files and upserts into the `monsters` table (source=hotd-homebrew), giving DM AI a single lookup for both DDB and campaign creatures
- **`search_campaign_lore` tool** — DM AI function-calling tool for semantic search over pgvector embeddings with optional source_type filtering
- **Arc managed identity** — Cortana registered with Azure Arc; website pod loads OpenAI key from Key Vault via managed identity instead of GitHub Actions secrets

### Changed
- **OpenAI models upgraded** — chat: `gpt-5.4-mini`, images: `gpt-image-1.5`, DM Admin dropdown: 5.4 family
- **DM AI queries pgvector directly** — removed dependency on external `dnd-rag` microservice for all AI tool lookups
- **Hybrid search** — pgvector semantic similarity boosted by PostgreSQL full-text keyword matching
- **DM Notes splitting** — embed pipeline detects `## DM Notes` sections and marks them `is_dm_only: true`
- **Section-aware chunking** — splits on `## ` heading boundaries, keeping stat blocks and spell lists intact
- **IVFFlat index rebuild** — embed pipeline rebuilds pgvector index after bulk inserts
- **System prompt overhaul** — parallel NPC+PC lookup, latest session with full summary, calendar date queries, image rendering from tool data only, 5e stat block formatting
- **Replaced `SELECT *` in AI tools** — spell/monster/magic_item lookups now return structured columns only, eliminating raw_json token bloat
- **Helm deployment** — `hostNetwork: true` + `dnsPolicy: ClusterFirstWithHostNet` + `Recreate` strategy for Arc identity access
- **Storage account** — updated from deleted `knoxrpgwebsitestore` to `cloudgeekcusgaming01`; homebrew creature images uploaded to blob storage

### Fixed
- `max_tokens` → `max_completion_tokens` for gpt-5.4 family compatibility
- `get_session_log` returns latest session with full summary (was returning wrong session)
- Parallel PC + NPC lookup prevents "not found" when asking about player characters
- Prevented model from fabricating image URLs for spells and other non-image data
- Embed pipeline `data.usage` → `resp.usage` batch logging bug
- Embed pipeline self-bootstraps `hotd_embeddings` table on fresh DB

### Removed
- 21 statBlocks/*.md files — all 24 creatures (18 allies + 6 enemies) synced to monsters table with images in blob storage
- Azure Key Vault dead code from pool.js (replaced with working Arc managed identity)
- External RAG service dependency from DM AI tools

## [2.9.3] - 2026-04-25

### Added
- Added Session 27 Notes to /data
- created data/statBlocks to better track and organize Ally and Enemy StatBlocks for this session and future sessions.. This data will get merged into RAG for ease of lookup and consistency.
- Added NPC block for Mordenkainen along with updated backstory.
- Created agent to help streamline building Images for campaign and added squad member to leverage the agent.

### Changed
- **OpenAI model upgrade** — default chat model updated to `gpt-5.4-mini`, image generation to `gpt-image-1.5`, DM Admin dropdown now offers the 5.4 family
- **DM AI now queries pgvector directly** — removed dependency on external `dnd-rag` microservice; both `search_dnd_reference` and new `search_campaign_lore` tools use pgvector embeddings on Cortana
- **New `search_campaign_lore` tool** — DM AI function-calling tool for semantic search over embedded campaign content (stat blocks, groups, realms, campaign notes) with optional `source_type` filtering
- **Hybrid search** — pgvector semantic similarity now boosted by PostgreSQL full-text keyword matching for better recall on proper nouns and exact terms
- **DM Notes splitting** — embed pipeline detects `## DM Notes` sections in markdown files and marks them `is_dm_only: true`, preventing spoiler content from appearing in player-facing DM AI responses
- **Section-aware chunking** — embed pipeline now splits on `## ` heading boundaries first, merging small sections and sub-splitting oversized ones, keeping stat block sections and spell lists intact
- **IVFFlat index rebuild** — embed pipeline rebuilds the pgvector IVFFlat index after full reindex or large batch inserts for faster similarity search
- **Embed pipeline self-bootstraps** — creates `hotd_embeddings` table and pgvector extension on startup if missing, so the pipeline works on fresh Cortana DB without needing the web server to run first
- **Cleaned up azure.js** — removed dead Azure Key Vault code; OpenAI client loads directly from `OPENAI_API_KEY` env var

### Fixed
- Fixed `data.usage` reference bug in embed pipeline batch logging (was referencing undefined `data` instead of `resp`)
- Fixed embed pipeline SCRAM auth failure when PG env vars missing (table bootstrap error)

# [2.6.2] - 2026-04-22

### Fixed
- **Damara lore correction** — updated Morov from a city to the Barony of Morov with Heliogabalus as its capital, aligning with R.A. Salvatore's *The Bloodstone Lands* (FR9) and official Forgotten Realms canon
  - `damara.md` — intro, Morov section, and DM Notes updated
  - `history.md` — Von Zarovich founding corrected
  - `bonegrinder-coven.md` — Viktor's capital references fixed
  - `rewrite-realms.js` — DM Notes template updated

## [2.6.1] - 2026-04-21

### Added
- **Realms pages** — new `/realms` listing page and `/realms/:slug` detail pages for the Forgotten Realms encyclopedia
- **Realm encyclopedia content** — 42 realm files expanded with detailed lore covering geography, politics, notable locations, and factions for each region of Faerun
- **Realm listing summaries** — each realm card on the `/realms` page now shows a description pulled from the "At a Glance" field or the first paragraph
- **Image popout on realm pages** — clicking any image on a realm detail page opens a full-screen zoom/pan overlay
- **Notable Groups — Netheril Empire** — new group page covering the ancient Netherese civilization

### Fixed
- **Faerun accent normalization** — standardized "Faerûn" to "Faerun" across all realm files for consistency

## [2.5.0] - 2026-04-20

### Added
- **Notable Groups — Vistani** — new group page covering origins, culture, the six Vistani encampments, and key NPCs
- **Notable Groups — Bonegrinder Coven** — new group page for the Wormwiggle hag coven with battle history, member status, and DM notes
- **Group art — Vistani** — generated custom organization image for the Vistani group page
- **Group art — Bonegrinder Coven** — generated custom organization image for the Bonegrinder Coven group page

### Fixed
- **DM Notes visibility** — group detail pages now strip `## DM Notes` sections for non-admin users; previously DM-only content was visible to all visitors

### Removed
- **Book art images** — removed 67 extracted book art images (`image_page_*.png`) from the campaign images directory

## [2.4.0] - 2026-04-20

### Changed
- **Art Gallery — filesystem-based** — gallery now loads images directly from `src/hotd-campaign/images/` (excluding `maps/`) instead of querying the `hotd_art` database table
- **Art Gallery — image-only cards** — removed titles and descriptions from gallery cards; images only with click-to-enlarge overlay
- **Art Gallery — responsive grid** — column count now adjusts automatically based on window width with breakpoints at 600px, 900px, and 1200px

## [2.3.0] - 2026-04-20

### Added
- **Art Gallery — NPC Portraits** — bulk-added 73 visible NPC portraits to the Art & Images gallery under the "NPC Portraits" category
- **Art Gallery — Groups** — added 2 group images (Crew of the Seaspray, Stormraven Sisters) under the "Groups & Organizations" category
- **Art gallery bulk-insert script** — `scripts/add-art-gallery.js` for idempotent insertion of NPC and group images into `hotd_art`

## [2.2.0] - 2026-04-20

### Added
- **Squad AI team** — initialized Squad framework with 4 specialized agents (Mercer, Helm, Foundry, Artisan) plus Scribe and Ralph
- **Squad skills** — migrated existing prompts into 6 Squad skills: npc-portrait-generation, docker-testing, git-commit-flow, question-answer, foundry-vtt-module, helm-microk8s
- **Squad decisions** — codified project conventions (code style, architecture, deployment rules) into `.squad/decisions.md`
- **Squad routing** — configured work routing table mapping 15 work types to the correct agent

### Fixed
- **NPC visibility** — removed dead `visible` field from npcs.json (was unused by codebase), set `is_hidden: false` on 73 NPCs using the correct `is_hidden` field that the DB/server actually reads

## [2.1.0] - 2026-04-20

### Added
- **Custom NPC portraits** — generated 69 custom dark fantasy portraits for all campaign NPCs using GPT Image 1, replacing placeholder and book art with a consistent art style
- **NPC visibility flags** — set `visible: true` on 58 NPCs that players have directly interacted with across Sessions 1-28
- **Portrait URLs** — added `portrait_url` references for 42 NPCs that were previously missing image links

### Changed
- **Strahd portrait** — replaced book art (.jpg) with custom portrait (.png); young, powerful, human appearance with dark eyes
- **Father Alric portrait** — renamed from `Father_Alric.png` to `father-alric.png` with new custom art
- **Velinka d'Avenir portrait** — renamed from `Velinka d'Avenir.png` to `velinka-davenir.png` with new custom art
- **Book art replacements** — replaced 30 NPCs that previously used D&D book art with custom generated portraits in consistent dark fantasy style

## [2.0.0] - 2026-04-19

### Changed
- **OpenAI SDK upgrade** — upgraded `openai` package from v4.77.0 to v6.34.0
- **Image generation model** — migrated from DALL-E 3 (deprecated 2026-05-12) to GPT Image 1 (`gpt-image-1`)
  - Removed `style` parameter (not supported by GPT Image models)
  - Removed explicit `response_format: "b64_json"` (now the default)
  - Quality options changed from standard/hd to low/medium/high/auto
  - Size options changed from 1792x to 1536x variants, added `auto` option
- **DM Admin Image Studio UI** — removed Style dropdown, updated Quality and Size selectors to match GPT Image options
- **API Test page UI** — updated labels, dropdowns, and tab names from "DALL-E" to "GPT Image"
- **azure.js import** — simplified `require("openai")` import (removed legacy v3 compatibility shim)
- **Embed pipeline** — replaced raw `fetch()` calls to OpenAI API with `openai` SDK `embeddings.create()` method

## [1.18.0] - 2026-04-19

### Added
- **Notable Groups page** — new `/groups` listing page and `/groups/:slug` detail pages for campaign organizations and factions
  - Reads markdown files from `src/hotd-campaign/data/groups/` as source of truth
  - Listing page shows each group as a card with image, type, status, and alignment
  - Detail pages render the full markdown content with back-navigation
- **Notable Groups nav entry** — added to the Campaign dropdown menu and campaign search index
- **Markdown image support** — `![alt](src)` syntax now renders in the markdown-to-HTML converter

### Changed
- **npcs.json data updates** — expanded NPC backstories, associations, and DM notes across multiple entries
- **Campaign content** — added Crew of the Sea Spray and Stormraven Sisters organization documents with full narrative prose, expanded history sections, and member profiles

## [1.17.0] - 2026-07-03

### Added
- **NPC Associations** — NPC detail pages now display linked NPCs with relationship descriptions
- **DM Notes on NPC pages** — admin users see a DM Notes section (motives, secrets, plot hooks) below the public description
- **Associations editor in DM Admin** — add/remove NPC associations with name, ID, and relationship fields
- **NPC Class/Role field in DM Admin** — new editable field (fixes prior hardcoded empty string bug)
- **`npcid` and `associations` columns** — added to `hotd_npcs` schema and all API queries (SELECT, INSERT, UPDATE)

### Changed
- **npcs.json data overhaul** — 66 NPCs with separated player-facing descriptions and DM-only notes; added Bella & Offalia Wormwiggle (hag coven); all entries have `npcid`, `associations` JSONB, and `dm_notes`
- **DM Admin NPC form** — restructured layout with Class/Role, expanded Status options (Undead, Imprisoned, Active, Corrupted), simplified Alignment to Ally/Enemy/Neutral
- **NPC list sort order** — API now returns NPCs sorted by `sort_order, name` instead of just `name`

### Fixed
- **`saveNpc()` npc_class bug** — DM Admin was always saving `npc_class` as empty string; now reads from form field

## [1.16.0] - 2026-04-15

### Changed
- **Campaign Notebook: PostgreSQL backend** — migrated from filesystem to `hotd_notebook_pages` table
  - Notes persist across pod restarts/redeploys (no more ephemeral container FS)
  - Tree, CRUD, rename/move, backlinks, link map, and search all use SQL queries
  - Parent folders auto-created on nested note/folder creation
  - Folder deletes cascade to all children
  - Renames update child paths and RAG embeddings

### Added
- **Notebook RAG integration** — every note save auto-embeds content into `hotd_embeddings` (source_type=`notebook`, is_dm_only=TRUE)
  - Chunks content at ~1500 chars, generates OpenAI `text-embedding-3-small` vectors
  - DM AI chat automatically picks up notebook context via existing semantic search
  - Embeddings cleaned up on delete, paths updated on rename
- **PersistentVolumeClaim for notebook images** — `hotd-notebook-images` PVC (2Gi) mounted at `/app/hotd-campaign/images/notebook`
  - Images survive pod restarts; per-page subdirectories preserved

## [1.15.2] - 2026-04-15

### Fixed
- **Notebook scrollbar (final)** — locked outer page viewport so only the note editor/preview scrolls; top navbar and sidebar remain static
  - `html` overflow locked on DM Admin page, `.dmc` uses strict `height` instead of `min-height`
  - Notebook layout uses `height:100%` parent chain instead of viewport calc
  - Markdown preview pane now scrolls internally

## [1.15.1] - 2026-04-15

### Fixed
- **Notebook scrollbar** — editor panel now scrolls internally instead of pushing the outer page shell
- **Notebook root path** — markdown files now stored under `src/hotd-campaign/notebook/` (was `src/hotd-campaign/`)
- **Image storage per page** — pasted/dropped images stored in `images/notebook/<pagename>/` instead of a single flat folder

## [1.15.0] - 2026-04-15

### Added
- **Trilium-inspired Campaign Notebook** — replaced Notes Board kanban with a full markdown notebook
  - File-based notes stored as `.md` files under `src/hotd-campaign/`
  - EasyMDE rich markdown editor with auto-save (5s debounce), image paste/drop
  - File tree sidebar with folders, expand/collapse all, search/filter
  - **Wiki-links** — `[[note name]]` syntax rendered as clickable links in preview; navigates to matching note
  - **Backlinks panel** — right sidebar shows all notes that link to the current note
  - **Note info panel** — word count, line count, wiki-link count, image count, file path
  - **Link Map** — force-directed graph visualization of all notes and their wiki-link connections (canvas-based)
  - **Breadcrumb navigation** — clickable path segments in the editor bar
  - **Editable title** — rename files directly from the title input on save
  - **Context menu** — right-click tree items for open, new child note/folder, rename, delete
  - **Drag-and-drop** — reorder notes by dragging between folders in the tree
  - **Full-text search API** — search across all notes with name-match priority
  - Image uploads stored in `images/notes/` under the campaign directory

### Fixed
- Missing `parseMultipart` import in DM Admin API (broke notebook image uploads)

## [1.14.0] - 2026-04-15

### Added
- **NPC DM Notes** — separate DM-only notes field for secret motives, alliances, and plot hooks
  - New `dm_notes` column on `hotd_npcs` table
  - Player Description (visible to players) and DM Notes (DM only) as distinct textareas in the edit form
  - DM Notes textarea has red-tinted border to visually distinguish from player content
- **AI Description Splitter** — one-click button to use AI to split existing NPC descriptions
  - Processes all NPCs with descriptions but no DM notes
  - Strips motives, alliances, and secrets into DM Notes; leaves player-safe content in Description
  - Uses gpt-4o-mini with structured JSON output
  - POST `/api/dm-admin/npcs/split-descriptions`

### Changed
- Removed **Class** column from NPC table and edit form (DM will add manually during gameplay)
- DM AI chat container widened to 80% of viewport (was 800px max-width)
- DM AI chat height now fills available viewport (removed 520px max-height cap)
- NPC names in DM Admin table now link to the NPC detail page (opens in new tab)

## [1.13.1] - 2026-04-15

### Added
- **Inline NPC Management** — full CRUD for NPCs directly in the DM Command Center
  - Create, edit, and delete NPCs without leaving the dashboard
  - Search/filter NPCs by name
  - All NPC fields: name, race, class, location, status, alignment, portrait URL, description, sort order, hidden
  - JSON API endpoints: POST/PUT/DELETE `/api/dm-admin/npcs`
- **Inline Session Management** — full CRUD for Sessions directly in the DM Command Center
  - Create, edit, and delete sessions without leaving the dashboard
  - All session fields: session number, title, game date, play date, summary
  - JSON API endpoints: POST/PUT/DELETE `/api/dm-admin/sessions`
- **Markdown Rendering** — AI responses now render as formatted markdown
  - DM Chat messages render headers, lists, tables, code blocks, bold/italic
  - Story Forge output renders as markdown
  - Uses marked.js v15.0.4 + DOMPurify v3.2.4 via CDN
  - Dark theme CSS for all rendered markdown elements
- **NPC Portrait Thumbnails** — circular portrait images shown in NPC table list
  - Live portrait preview (80×80) in the NPC edit form, updates as URL is typed
  - Placeholder icon for NPCs without a portrait

### Changed
- NPCs panel no longer links to external admin page — full CRUD is inline
- Sessions panel no longer links to external admin page — full CRUD is inline
- Removed fixed-height scroll containers from all panels — content flows with natural page scroll
- Removed sticky table headers

### Fixed
- **OpenAI client not initialized** — `openaiClient` getter was destructured at import time, capturing `null`. Fixed by importing module object and accessing at call-time.
- **Image Studio JSON parse error** — same root cause as above; HTML error page was returned instead of JSON
- **Broken Campaign sidebar links** — escaped quotes in NPC portrait `onerror` handlers broke JS parsing inside template literal, disabling all panel navigation

## [1.13.0] - 2026-04-16

### Added
- **DM Command Center** — full-width sidebar dashboard replacing the old tabbed DM Admin interface
  - Persistent left sidebar navigation with collapsible sections (AI Tools, Campaign, Config)
  - Full viewport-width layout — no max-width constraint
  - Responsive: collapses to horizontal nav on mobile
- **DM Chat** — AI-powered conversation interface for campaign Q&A
  - Persistent conversations saved to database (title, messages as JSONB)
  - RAG-grounded responses using campaign embeddings
  - Conversation list sidebar with create/switch/delete
  - Quick-start suggestion buttons for common queries
- **Notes Board** — Kanban-style campaign notes management
  - Four columns: Backlog, To Do, In Progress, Done
  - Drag-and-drop cards between columns to update status
  - Notes with title, content, priority (color-coded), category, and tags
  - Create/edit/delete notes via modal dialog

### Changed
- DM Admin page completely rewritten from tabbed layout to sidebar dashboard
- All existing panels preserved: Characters, NPCs, Sessions, AI Config, Search Config, Campaign Data, Users, Image Studio, Story Forge
- Removed emojis from navigation labels
- DM Chat opens as default panel on page load

### Fixed
- Image Studio: `tags` now properly stored as PostgreSQL TEXT[] array (was JSON string)
- Image Studio: added `is_published` BOOLEAN column (was missing from schema)
- Image Studio: `published_to` column added to SELECT queries

### Database
- Added `hotd_dm_notes` table (kanban: id, title, content, status, priority, category, tags, sort_order, timestamps)
- Added `category` column to `hotd_art` table
- Added `is_published` column to `hotd_generated_images` table

## [1.12.0] - 2026-04-15

### Added
- **Story Forge** — new tab on DM Admin for RAG-grounded campaign content generation
  - 8 generation templates: NPC Backstory, Magic Item, Spell, Session Summary, Session Planning, Scene Description, Quest Hook, Faction Lore, plus Freeform
  - Automatic RAG context injection — searches 213 embedded campaign vectors (DM-only included) before every generation
  - Direct entity lookups for mentioned NPCs/locations to ground output in real campaign data
  - Story Element Library with CRUD, filtering by type/status (draft/committed/archived)
  - Commit workflow: generate → review → edit → commit to library
  - Apply to NPCs: append story element content to NPC descriptions
  - RAG Search panel — interactive semantic search with source type filter, min score, and result preview
- Story Forge API endpoints: generate, list/get/create/update/delete story elements, apply-to-NPCs, RAG search preview
- Wired `searchEmbeddings` and `buildEmbeddingContext` from RAG utility into Story Forge generation pipeline

## [1.11.0] - 2026-04-16

### Added
- **DALL-E 3 Image Studio** — new tab on DM Admin for AI-powered image generation
  - Generate images with configurable size (square/landscape/portrait), style (vivid/natural), and quality (standard/HD)
  - Automatic style prefix from `dalle_style_prefix` config for consistent dark fantasy aesthetic
  - Gallery view with folder-based organization and filtering
  - Image detail modal with metadata editing (folder, tags)
  - Publish generated images directly to the Art Gallery
  - Delete images (removes both DB record and file from NAS)
  - All images saved to local NAS at `generated-images/` directory
- Image Studio API endpoints: generate, list, folders, update, delete, publish

## [1.10.0] - 2026-04-15

### Added
- **RAG Embedding Pipeline** — 5-stage pipeline (Extract → Chunk → Sanitize → Embed → Store) using OpenAI `text-embedding-3-small` and pgvector
  - `scripts/embed-pipeline.js` with structured JSON reports at every stage
  - `.github/workflows/embed.yml` — auto-triggers on campaign content changes, manual dispatch with mode selector (incremental/full/dry-run) and optional source filter
  - Extracts from: NPCs, sessions, artifacts, handouts, calendar events, characters, journal, lore markdown, JSON data files, DM story elements
  - Hash-based incremental indexing — skips unchanged chunks
  - `is_dm_only` flag for player/DM content visibility firewall
  - Orphan cleanup for deleted source records
- `hotd_embeddings` table with pgvector `vector(1536)` column, IVFFlat index, and unique hash constraint (added to schema migration)
- DM Admin link in Home dropdown (admin-only via `adminOnly` config flag)

## [1.9.0] - 2026-04-16

### Added
- DM Management Interface at `/dm-admin` — unified tabbed admin dashboard
  - **Characters tab**: View/edit all player characters, inline DDB sync (single or all)
  - **NPCs tab**: Quick overview table with links to existing NPC admin
  - **Sessions tab**: Session log overview with links to existing admin
  - **AI Config tab**: Configure chat model, temperature, max tokens, system prompt, image generation settings
  - **Search Config tab**: Switch search backend (DB/RAG/hybrid), set thresholds, test search inline, RAG status check
  - **Campaign tab**: Edit game date, party location, Harptos calendar date; quick links to all existing admin pages
  - **Users tab**: Full user management (approve/promote/demote/delete) via JSON API
- DM Admin API (`/api/dm-admin/*`) — JSON endpoints for all dashboard operations
- Inline D&D Beyond character sync (no child process — runs directly on API request)

## [1.8.0] - 2026-04-15

### Changed
- Characters page redesigned as a single-page view with 2024-style stat block cards (image + stat block side-by-side)
- Removed individual character detail pages — `/characters/:id` now redirects to `/characters`
- Player names now show real names instead of D&D Beyond handles
- Dropped character journal and access control features (will be re-added later)

## [1.7.1] - 2026-04-15

### Changed
- DM AI now answers the specific question asked instead of dumping full data cards (e.g. "what is the range of Fireball?" returns just the range, not the entire spell)
- System prompt rewritten for concise, conversational responses

### Fixed
- DM AI chat now renders markdown properly — tables, bold, links, images, lists, and code blocks all display correctly via marked.js
- Added CSS for tables, images, links, blockquotes, and headings in chat bubbles

## [1.7.0] - 2026-04-15

### Changed
- Replaced bulk context injection with OpenAI function calling for DM AI chat
- System prompt reduced from ~39K chars to ~1.5K chars (tools fetch data on demand)
- Both `/api/chat` and `/api/admin/test-chat` now use function-calling tool loop

### Added
- `src/lib/ai-tools.js` — 11 function-calling tool definitions: `lookup_npc`, `search_npcs`, `get_session_log`, `lookup_spell`, `lookup_monster`, `lookup_magic_item`, `lookup_artifact`, `get_player_character`, `get_handout`, `get_calendar`, `search_dnd_reference`
- `chatWithTools()` multi-round tool-call loop (max 5 rounds) with parallel tool execution
- Debug output now includes per-tool call details (name, args, latency, result size)

## [1.6.0] - 2026-04-15

### Added
- Admin API Test Console at `/api-test/admin` with three tabs: DM AI Chat, Search, and Image Generation (DALL-E 3)
- `POST /api/admin/test-chat` — debug chat endpoint exposing system prompt, campaign context, RAG context, token usage, and latency
- `GET /api/admin/test-search` — debug search endpoint with source filtering (all/db/local) and per-source result counts
- `POST /api/admin/test-image` — DALL-E 3 image generation endpoint with size, quality, and style parameters
- New route module `routes/admin-test.js` for all admin test endpoints

## [1.5.0] - 2026-04-15

### Added
- Point of Interest (POI) marker type with exclamation mark icon (❗)
- DELETE API endpoint for map markers (`DELETE /api/map-markers/:id`)

### Changed
- Placed Markers table now updates dynamically (add/delete without page reload)

## [1.4.5] - 2026-04-15

### Added
- Dusk Elves faction marker type with duskElvesShield icon

## [1.4.4] - 2026-04-15

### Fixed
- Updated API validTypes to include all new faction marker types

## [1.4.3] - 2026-04-15

### Fixed
- Fixed bug preventing placement of multiple markers without page reload

## [1.4.2] - 2026-04-15

### Changed
- Only battle markers show text labels; all other markers show name on hover

## [1.4.1] - 2026-04-15

### Added
- Restored Battle marker type with crossed swords emoji (⚔️)

## [1.4.0] - 2026-04-15

### Changed
- Replaced emoji map markers with PNG shield icons for all factions
- Expanded marker types to 11 factions: Allied Werewolves, Barovia, Kezk, Party, Ravenkind, Strahd Abbot, Strahd Demon Army, Strahd, Strahd Werewolves, Villaki, Vistani
- Updated admin legend and dropdown to show all faction icons

## [1.3.0] - 2026-04-14

### Added
- Drag-to-move markers on the Map Admin page (left-click drag)
- Per-marker size with slider control (10–200px range)
- "Selected Marker" panel for resizing placed markers after placement
- `PUT /api/map-markers/:id` endpoint for updating marker position and size
- `size` column on `hotd_map_markers` DB table (default 54px)
- Labels rendered below marker icons with auto-sized text

### Changed
- Map Admin: markers now draggable instead of fixed after placement
- Map Admin: removed hex-grid snapping for free placement
- Homepage markers use per-marker size from database instead of fixed hex size

## [1.2.0] - 2026-04-14

### Added
- Map Markers Admin page (`/map/admin`) for placing markers on the Barovia map
- Four marker types: City (🏛️), Battle (⚔️), Vistani (🛒), Party (🎭)
- Markers sized to hex grid, snap-to-grid on placement
- `hotd_map_markers` DB table with marker_type, label, x/y coordinates
- API endpoints: `GET /api/map-markers`, `POST /api/map-markers`
- Homepage map now fetches and renders markers from the database
- "Edit Map Markers" link on Home Admin dashboard

### Removed
- Nav bar search (desktop and mobile) — search is now only on homepage and `/search` page

## [1.1.1] - 2026-04-14

### Fixed
- Map of Barovia container now uses aspect ratio matching the image (5025×3225)
- Map auto-fits and centers within the container on initial load
- Minimum zoom level tied to fit-to-container scale

## [1.1.0] - 2026-04-14

### Added
- Interactive Map of Barovia on homepage with pan/zoom support (mouse wheel + drag, touch pinch)
- Search bar box on homepage right column above Last Session
- Search link under Campaign dropdown menu
- DM AI link under Game Info dropdown menu
- Account/Login link under Home dropdown menu

### Changed
- Home nav item is now a dropdown containing Dashboard and Account/Login
- Navigation restructured: right-side items consolidated into dropdown menus

### Removed
- Campaign Calendar from homepage (replaced with Barovia map)
- KnoxRPG external link from navigation
- Standalone Account/Login link from right side of nav bar

## [1.0.0] - 2026-03-28

### Added
- Initial standalone project extracted from FoundryVTT monorepo
- Helm chart for Kubernetes deployment on MicroK8s (Cortana)
- Dockerfile with Node.js 22.22.1-slim base image
- Campaign Calendar (Calendar of Harptos) with event tracking and weather
- Session Journal with world date tracking and markdown recaps
- Character profiles, NPC directory, Maps, Artifacts, Handouts
- Campaign History and House Rules pages
- Art & Images gallery served from NAS
- Admin panel for DM campaign management
- DM AI chat integration via Ollama and RAG service
- Session-based authentication with bcrypt
- Full-text search via PostgreSQL
- GitHub Actions CI/CD workflow (self-hosted Cortana runner)

### Fixed
- Calendar ordinal display bug (`1414th` → `14th` of Kythorn)

### Removed
- Content dropdown menu with external KnoxRPG website links
- All Azure/cloud dependencies (replaced with local Cortana overrides)
- ConfigMap file overrides (Cortana code baked directly into image)

### Security
- Removed hardcoded PostgreSQL password from pool.js
- All secrets injected via environment variables at deploy time
