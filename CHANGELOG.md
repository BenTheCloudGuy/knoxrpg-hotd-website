# Changelog

All notable changes to the Halls of the Damned campaign website will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Policy:** every entry in this file MUST be under a real `## [X.Y.Z] - YYYY-MM-DD` heading. The literal `## [Unreleased]` section is forbidden — the deploy workflow extracts the image tag from the first `## [...]` heading in this file, and an `[Unreleased]` tag produces no rollout. New changes get a new versioned section (patch / minor / major per semver) at the top.

## [3.13.0] - 2026-06-30

### Changed
- **DM Command Center moved from a left sidebar to a top-menu dropdown so panels use the full canvas.** The 220px `.dmc-side` sidebar in `/dm-admin` is gone; the panel area (`.dmc-main`) now spans the full width of the page. Navigation between tools (DM Chat, Story Forge, Image Studio, Notebook, Characters, NPCs, Sessions, AI Config, Search, Campaign Data, Users) lives in a new **⚙ DM Command Center** dropdown in the sticky site top-nav, available from any page. Panel selection is now driven entirely by the URL hash (`/dm-admin#sessions`, `/dm-admin#npcs`, etc.) via a `showPanel()` + `hashchange` handler, so dropdown links deep-link from anywhere and switch panels in-place without a reload when already on `/dm-admin`.
- **The DM Command Center dropdown is admin-only.** `renderNav` (`src/components/nav.js`) now filters top-level nav items by a new `adminOnly` flag (desktop + mobile drawer), so the dropdown only appears after logging in as a DM/admin. The redundant "⚙ DM Admin" link was removed from the Home dropdown.
- **All scattered admin/management entry points consolidated into the DMCC dropdown.** The dropdown is now organized into labeled **AI Tools / Campaign / Config** sections (new `{ header }` item type rendered by `renderNav`, styled via `.nav-dropdown-header` + mobile `.mobile-dropdown-subheader`; tall dropdowns now scroll with `max-height:82vh`). The standalone admin pages **Edit Dashboard** (`/home/admin`), **Calendar Admin** (`/calendar/admin`), **Artifacts Admin** (`/artifacts/admin`), and **Handouts Admin** (`/handouts/admin`) are now direct dropdown items under Campaign, in addition to remaining as cards inside the **Campaign Data** panel. NPC management points to the inline DMCC **NPCs** panel (`/dm-admin#npcs`).
- **Adventure Journal moved under the DMCC Notebook group as "Adventure Notes"** (`/journal`), and the **Journal** link was removed from the public **Campaign** top-nav dropdown.

### Removed
- **DMCC sidebar markup, CSS, and JS** (`.dmc-side`/`.dmc-nav`/`.dmc-nav-btn` styles, the `toggleSidebar()` function, and the click-based `dmc()` active-button logic) replaced by the hash-driven `showPanel()` navigation.
- **Inline "⚙ Admin →" / "⚙ Edit Dashboard →" / "⚙ Edit in Admin →" links removed from the public pages** (home dashboard, calendar, maps, NPCs list, NPC detail, artifacts, handouts) now that those tools live in the DMCC dropdown. The Sessions page keeps its link (it points into the DMCC at `/dm-admin#sessions`).

### Fixed
- **Sessions Workspace buttons clipped when embedded in the DMCC (verified fix).** The editor's height chain depended on `.EasyMDEContainer { height:100% }` — a percentage height that resolves on the standalone `/sessions/admin` page but **not** reliably inside the DMCC iframe, so CodeMirror fell back to growing with its content and pushed the bottom button bar (Save / Create PDF / Generate Summary / Publish Summary / Delete) off-screen. The editor now uses a **pure-flexbox height chain** (the same pattern the Campaign Notebook editor uses): the editor wrapper is `display:flex;flex-direction:column;min-height:0`, and `.EasyMDEContainer` / `.CodeMirror` / `.CodeMirror-scroll` use `flex:1; min-height:0` instead of `height:100%`. This needs no percentage-height resolution, so CodeMirror stays bounded and scrolls internally in both standalone and embedded modes. Verified in a browser harness: with 60+ lines of content in an iframe sized like the DMCC panel, all action buttons remain docked at the bottom.

## [3.12.2] - 2026-06-30

### Fixed
- **Sessions Workspace editor grew unbounded and pushed the button bar off-screen.** Even after the iframe was sized correctly in 3.12.1, the two-pane grid still had an implicit `auto`-sized row, so the EasyMDE editor expanded to its full content height (e.g. 50+ lines) and shoved the bottom button bar (**Create PDF**, **Generate Summary**, **Publish Summary**, **Unpublish**, **Delete**) below the fold — getting worse as the editor column widened. The workspace grid now pins its row with `grid-template-rows: minmax(0, 1fr)` (both standalone and embed), capping the editor to the available height so it scrolls internally and the button bar stays docked at the bottom.

## [3.12.1] - 2026-06-30

### Fixed
- **Sessions Workspace action buttons clipped when embedded in the DM Command Center.** In the new embedded (`?embed=1`) layout the workspace used a fixed `height: calc(100vh - 100px)` plus `min-height: 600px`, which made the editor pane taller than the host iframe on shorter panels and pushed the bottom button bar (**Create PDF**, **Generate Summary**, **Publish Summary**, **Unpublish**, **Delete**) below the visible/scrollable area. Embed mode now uses a flex-column layout (`.content` is `height:100vh; display:flex; flex-direction:column` and the workspace grid is `flex:1; min-height:0`) so the editor grows/shrinks to fit and the button bar always stays in view. The standalone `/sessions/admin` page is unchanged.

## [3.12.0] - 2026-06-30

### Changed
- **DM Command Center "Sessions" now hosts the full Sessions Workspace.** The legacy table-based "Session Logs" panel in `/dm-admin` (add/edit/delete rows via a small form) has been removed and replaced by the richer Sessions Workspace (two-pane markdown editor with Save / Create PDF / Generate Summary / Publish / Unpublish / Delete) embedded in an iframe. Clicking **Sessions** in the DM Command Center sidebar now opens the same tool that previously lived only at `/sessions/admin`. The workspace iframe is lazy-loaded the first time the panel is opened.
- **`renderSessionsAdminPage` gained an embed mode.** `/sessions/admin?embed=1` renders the workspace with a chrome-free shell (no site nav/footer, via the new `embedShell` helper in `src/components/shell.js`) and a taller editor area so it fills the DM Command Center panel cleanly. The standalone `/sessions/admin` page is unchanged.
- **DM Command Center supports hash deep-links.** Loading `/dm-admin#sessions` (or `#npcs`, `#notes`, etc.) now auto-opens that panel on page load.
- **`/sessions` Admin link points to the DM Command Center.** The "⚙ Admin →" link on the player-facing Sessions page now targets `/dm-admin#sessions` instead of `/sessions/admin`, so session management flows through the DM Command Center.

### Removed
- **Legacy DMC session JS** (`loadSessions` table renderer, `newSession`, `editSess`, `saveSess`, `deleteSess`, `deleteSessDirect`, and the `_sessCache` state) replaced by a one-line iframe loader.

## [3.11.3] - 2026-06-28

### Added
- **Session 30 Krezk assault content.** Added a portal-to-Krezk lead-in and a "Krezk Assault" section to Session 30: a full Abbot (fallen deva) stat block with spells, healing, special attacks (Radiant Smite, Change Shape, Shield of Faith aura), plus a mongrelfolk mook block and mook-screen rules so players can't focus-fire the Abbot.
- **Abbot Sanctified Renewal lair self-heal.** Added a Lair Actions block: Sanctified Renewal heals the Abbot 4d8+4 each round (no back-to-back), with a Cleansing Flare alternate that clears a condition and tops off a mongrelfolk.
- **Abbot 12th-level cleric spell list.** Added attack/debuff-focused cleric spellcasting (DC 17): spirit guardians, flame strike, insect plague, harm, banishment, hold person, bane, plus a tactical opener note.
- **Abbot Sanctified Redirection.** Added a custom 4th-level spell, *Spell Redirect*: the Abbot reflects an incoming spell back on its caster, who saves with their spellcasting modifier vs DC 17; upcasting raises the DC, caps, and damage.
- **Abbot Sanctified Upcasting.** Lair now grants 3 lair-action points/round; the Abbot can spend them to upcast spells without slots (+1 level each, up to 3), sharing the pool with lair actions and the redirect reaction.

## [3.11.2] - 2026-06-07

### Fixed
- **Public NPC profile links no longer require login.** The global auth gate now exempts `/npcs` and numeric `/npcs/:id` routes so campaign NPC links can open on the public site without DM credentials. Existing renderer-level protections still apply: hidden NPCs remain unavailable to anonymous users, DM notes only render for admins, `/npcs/admin` remains admin-only, and DM admin APIs are still protected.

### Changed
- **Session 29 council guide updated for current HOTD canon.** Clarified the Barovian force count, corrected Doru references, added council pacing sections, documented the Mordenkainen/Van Richten/Ezmerelda Amber Temple plan, and made Tser Luna's Wizard of Wines trade connection canonical while removing the old Radescu-only trade assumption.

## [3.11.1] - 2026-05-31

### Fixed
- **`hotd_rag_queries_total{result}` was dead-counter code.** The counter was declared and exported by `src/lib/metrics.js` (line 151) and the Grafana panel `Embedding search rate (by result)` queried it, but nothing in the codebase ever called `.inc()`. The panel was guaranteed to show "No data" forever regardless of how much RAG traffic flowed. `src/lib/rag.js#searchEmbeddings` now records `result="hit"` when the post-`minScore` filter returns at least one row, `result="empty"` when zero rows survive, and `result="error"` when either `embedQuery` or the pgvector `SELECT` throws (the throw is then re-raised so call-site error handling is unchanged).

### Notes
- The other AI panels (`Chat request rate by is_dm,model`, `Tokens per minute`, `Chat latency p95`, `Image generation rate`, `Image latency p95`, `Embedding tokens per minute`) are correctly wired at every in-pod call site (`src/lib/ai-tools.js`, `src/lib/canon-extractor.js`, `src/lib/search.js`, `src/lib/rag.js`, `src/routes/dm-admin-api.js`, `src/routes/admin-test.js`). They are showing "No data" because **(a)** the live pod is still running 3.10.0 — 3.11.0 hasn't been pushed yet, and **(b)** the site has been idle for AI requests since the 16:56 UTC restart. They will populate the moment a DM chats, a player triggers semantic search, or Image Studio fires.
- **Out-of-pod AI traffic is not captured by Grafana and won't be.** `scripts/embed-pipeline.js`, `scripts/embed-ddb-content.js`, `scripts/gen-image.js`, `scripts/expand-realms.js`, and `src/mcp/story-forge.mjs` all call OpenAI but run as separate Node processes with no `prom-client` listener on `:9464`. To surface their work in Grafana the cleanest path is to either (1) have them write a one-shot summary line via `LOKI_PUSH_URL` so the data lands in Loki even if not Prometheus, or (2) ship a `node_exporter`-style sidecar / textfile collector for batch jobs. Out of scope for this patch.

## [3.11.0] - 2026-05-31

### Added
- **Visitor geography telemetry.** Every per-request log line emitted from `src/server.js` is now enriched with a `geo` block (`country`, `region`, `city`, `lat`, `lon`, `timezone`) resolved from the visitor IP via the new `src/lib/geoip.js` wrapper around `geoip-lite` (MaxMind GeoLite2 City dataset bundled with the npm package — no external HTTP calls, no license key, no rate limit). IPv6-mapped IPv4 (`::ffff:a.b.c.d`) is normalized; RFC1918 / loopback / CGNAT / IPv6 link-local / IPv6 ULA addresses are skipped so cluster-internal probes and local dev don't pollute the map. An in-memory LRU caches up to `GEOIP_CACHE_MAX=5000` IPs (overridable) so repeated visitors don't re-hit the lookup. Disable the whole thing with `GEOIP_ENABLED=false`.
- **`hotd_requests_by_geo_total{country, route}` Prometheus counter.** Incremented once per `trackRequest` call. Country is ISO-3166-1 alpha-2 (`"US"`, `"GB"`, …) or `"unknown"` for private / unresolved IPs. Route reuses the existing `normalizeRoute` bucketing, so total cardinality stays bounded (~countries × ~routes).
- **Visitor geography Grafana row (panels 80–83) in `observability/dashboards/hotd-website.json`.**
  - **Visitor map by country (last 1h)** — geomap panel with country-centroid lookup (built-in `public/gazetteer/countries.json`) driven by `sum by(country) (increase(hotd_requests_by_geo_total{country!="unknown"}[1h]))`. Marker size scales with request volume; thresholds tier the colours blue/green/yellow/orange/red as traffic grows.
  - **Top countries (last 1h)** — sorted table with a gradient-gauge column showing the same data in numeric form.
  - **Recent visitor connections (with geo)** — Loki logs panel with a custom `line_format` that surfaces `{country}/{city} | {ip} | {method} {route} ({status}) {durationMs}ms | user={u} ua={ua}` so the running connection log requested by the operator is one click away. Filter further in Explore with `| geo_country = "US"` or `| route = "/dm-admin"` etc.

### Fixed
- **DB query metrics were stuck at zero in Grafana.** `hotd_db_queries_total` and `hotd_db_query_duration_seconds` had been wired into `src/lib/telemetry.js` and exported by `src/lib/metrics.js`, but the only call site that fired `trackDbQuery` was the function-calling tool path inside `src/lib/ai-tools.js` (line 559). The vast majority of DB traffic, including every page render, auth check, and admin write, went through the unwrapped-for-telemetry `pgPool.query` and was therefore invisible to Prometheus. Survey of the running pod confirmed only 6 `hotd_*` metric names had series at all (the 3 `pg_pool_*` gauges and the 3 `auth_*` counters that self-fire on signup / login), and the entire `hotd_db_*` / `hotd_openai_*` / `hotd_rag_*` family was absent. The pool wrapper in `src/db/pool.js` (which previously only did blob-URL rewriting) now also records a `trackDbQuery(sql, rowCount, latencyMs, "app")` for every query and a `trackDbQuery(sql, 0, latencyMs, "error")` for every failed query, while the existing `ai-tools.js` direct call still tags its queries with `"admin"` / `"player"` so the per-role split in the dashboard works correctly without double-counting. Telemetry is lazy-required to keep pool boot safe from any future import cycle.

### Notes
- The other "No data" panels visible in the 3.10.0 dashboard screenshot (AI usage, login failure ratio, error rate, images & embeddings) are **not** broken — they reflect a genuinely idle site since the 16:56 UTC pod restart. They will populate the moment a DM chats, a player logs in, a 5xx happens, or an Image Studio generation runs.
- `geoip-lite` ships ~30 MB of MaxMind data inside the npm package, which is reflected in the image size. Dataset refresh happens whenever the package is bumped in `src/package.json`. ISP / ASN enrichment is **not** in this release; geoip-lite doesn't bundle the ASN database. If service-provider names are needed later, the cleanest add is `maxmind` + a separately mounted `GeoLite2-ASN.mmdb` (requires a free MaxMind account for the license key) wired into `lib/geoip.js` alongside the existing City lookup.

## [3.10.0] - 2026-05-31

### Fixed
- **Deploy workflow built new images but never rolled them out on un-versioned pushes.** `.github/workflows/deploy.yml` extracted the image tag from the first `## [...]` heading in `CHANGELOG.md`, which during active development was always literally `Unreleased`. Buildah pushed a fresh `localhost:32000/hotd-website:Unreleased` on every commit, but because the Helm-rendered Deployment spec was byte-identical to the previous apply (same image tag), Kubernetes saw no change and skipped the rolling restart. The running pod kept serving stale code (e.g. the home-page draft-filter fix from `6db932e` was built and pushed to the registry but never landed in the pod). Fixed in two parts: (1) the version-extract step now hard-fails the build when the top CHANGELOG heading is `Unreleased` (or missing), surfacing a clear error in the GitHub Actions log instead of silently producing a no-op rollout. (2) A new policy note at the top of `CHANGELOG.md` forbids `## [Unreleased]` entirely — every change must land under a real `## [X.Y.Z] - YYYY-MM-DD` heading. Together these guarantee that any push touching `src/**`, `docker/**`, `helm/**`, or `CHANGELOG.md` either deploys cleanly or fails loudly at the version step.
- **Home page surfaced draft session summaries.** `renderHomePage` in `src/pages/campaign.js` picked the "Last Session" block from `SELECT * FROM hotd_sessions ORDER BY session_number DESC LIMIT 1` with no `published` filter, so the moment the DM started a new session row the half-written draft (or empty `summary`) replaced the previously-published summary on the landing page for every visitor. Query is now `WHERE published = TRUE ORDER BY session_number DESC LIMIT 1` so the home page only ever shows finalized writeups. `nextSessionNum` is split out into a separate `MAX(session_number)` query that still counts drafts, so the in-progress Session N row doesn't make the DM's next-game scheduler renumber itself.

### Changed
- **DM Command Center → Characters: redirect to the canonical GM Player Workspace.** The `Characters` button in the `/dm-admin` left sidebar was opening an in-page panel whose `Save` posted to `PUT /api/dm-admin/characters/:id` — an endpoint that was **removed in 3.8.0** when player management moved to `/characters/admin`. The panel rendered rows but every edit failed silently, and the new `dm_notes` editor, Combat State, audit log, and per-character Publish-with-reindex were not present. The sidebar entry is now an `<a href="/characters/admin">` so a single click goes straight to the canonical workspace. The old in-page panel is reduced to an `Open GM Player Workspace →` call-to-action so any cached `dmc('characters')` invocation from a stale tab still resolves cleanly. The pre-3.8.0 edit form, `_charsCache`, `editChar`, `saveChar`, `ddbSync`, and `ddbSyncAll` JS were removed from `src/pages/dm-admin.js`; `loadChars` is now a no-op kept so the panel router still has a registered handler for the `characters` key. NPC management, which still lives in-page, is untouched.

### Added
- **DM AI auto-RAG across every source type.** Every DM chat turn now pre-retrieves the top matches from `hotd_embeddings` based on the latest user message and injects them as a `system`-role "Relevant Context" block between the system prompt and the user messages, before the model decides which tools to call. The retrieval has **no `source_type` filter**, so it hits campaign lore, NPCs, sessions, characters, artifacts, handouts, calendar events, adventure journal, and the full D&D reference index (`dnd_book`, `ddb_race`, `ddb_class`, `ddb_feat`, `ddb_background`, `ddb_spell`, `ddb_monster`, `ddb_magic_item`) in one query. DM-only chunks are included. The model is told to cite the bracketed reference numbers (`[1]`, `[2]`, …) when it draws on a passage and to ignore any passage that does not actually relate to the question. The existing `lookup_*` tools remain for precise DB rows and the `search_campaign_lore` / `search_dnd_reference` tools remain for narrower follow-up sub-queries the model wants to run. Defaults: `limit=12`, `minScore=0.25`, `perChunkChars=900` (truncate long chunks to keep prompt size predictable). Overridable via `HOTD_AUTO_RAG_LIMIT`, `HOTD_AUTO_RAG_MIN_SCORE`, `HOTD_AUTO_RAG_CHUNK_CHARS`. Disable entirely with `HOTD_AUTO_RAG=off`. Gated on `isDM` so player chat is unchanged. Each retrieval emits a `debug.autoRag` block (`{queryLength, results, latencyMs, types{}, limit, minScore, perChunkChars}`) for the existing chat debug panel, and failures are caught and logged as `debug.autoRagError` without breaking the chat. The retrieval is one extra `text-embedding-3-small` call per DM turn (~$0.00002) plus ~2-3K added prompt tokens at the default limit.

### Fixed
- **RAG calendar dominance for session-shaped queries (`"Session 28"`, etc.).** The 3.6.0 canon-applier writes one deterministic `Session N: <title>` headline event to `hotd_calendar_events` per published session so the calendar VIEW gets a clean "this session happened on this date" row. Those stubs had been embedded too, and because their bodies are short and contain the exact `Session N` token, they were outscoring the actual session-log chunks (which are longer and split across `(1/2)`/`(2/2)`). For the query `"Session 28"` the top RAG hits were `Session 05`, `Session 11`, etc., and the real session-log content was buried. `scripts/embed-pipeline.js` now skips any `hotd_calendar_events` row whose title matches `/^\s*Session\s+\d+/i` (covers post-3.6.0 stubs and the legacy `Session 01 & 02` / `Session 05` / `Session 08 & 09` / `Session 11` seeds). The calendar UI still renders them; they are only excluded from the vector index. Backfilled: 4 existing session-headline rows purged from `hotd_embeddings`. After the change, the top-10 cosine neighbours for `"Session 28"` are 100% `source_type='session'`, no `calendar`.
- **Stale chunk hygiene in incremental reindex.** When a source's content edit shifted chunk boundaries (e.g. a session markdown grew long enough to re-split `(1/2)`/`(2/2)` differently), the hash-based incremental skip-set inserted the new chunks but never removed the old ones. The orphan cleanup only catches embeddings whose `source_id` no longer exists, not stale chunks of a still-existing source. `scripts/embed-pipeline.js` now tracks a per-source `valid_hashes` set across both newly sanitized and skipped-unchanged chunks; after the store stage in incremental mode (including the `Nothing to store` short-circuit), `cleanStaleChunks` deletes rows where `(source_type, source_id)` was processed this run and `chunk_hash` is not in the valid set. The cleanup is scoped per `source_id` so a `--source session` run never touches NPC rows. Backfilled: the duplicate `Session 28: The Gathering of Allies (1/2)` row was removed on the first run after this change landed (`session` embeddings: 41 → 40, `calendar`: 19 → 15).
- **Uploads were silently broken in prod (`EROFS` on every NPC portrait / art / artifact / handout / map / image-studio write).** The legacy hostPath `/data/hotd-content` (NAS at `/mnt/nas/Gaming/ASSETS/DDB_CONTENT/hotd-website-content`) was correctly mounted `readOnly: true` for shipped-asset serving, but the upload path in `src/lib/azure.js` after 3.9.0 wrote straight into it. New: dedicated `hotd-uploads` PVC (`microk8s-hostpath`, 5Gi, RW) mounted at `/data/hotd-uploads`, surfaced to the pod via `HOTD_UPLOADS_DIR`. `uploadBlobToStorage` now prefers `HOTD_UPLOADS_DIR` and only falls back to `HOTD_CONTENT_DIR` when the uploads dir is unset (dev installs that mount the legacy dir RW). The static handler in `src/server.js` overlay-reads the `/hotd-content/*` URL space: it checks the writable uploads PVC first, then the read-only NAS, so freshly-uploaded assets win and legacy NAS content is still served at the same URL with no rewrite. New chart values: `uploads.{size,storageClass,mountPath}` in `helm/hotd-website/values.yaml`; new template `helm/hotd-website/templates/pvc-uploads.yaml`; new mount/volume + `HOTD_UPLOADS_DIR` env in `helm/hotd-website/templates/deployment.yaml`. Helm template renders the expected PVC, env, mount, and volume. The follow-up flagged in 3.9.0 is now closed.

### Changed
- **Squad framework: operator-gated push policy.** Codified the rule "never `git push` without explicit user permission in the current turn" across every entry point so no agent can ship a release on its own initiative.
  - `.github/copilot-instructions.md` gains a top-level `## ⚠️ MANDATORY: Never Push Without Explicit Permission` section directly under the Squad routing block. Default workflow for any change is now: update `CHANGELOG.md` → `git add -A` → `git commit` → **STOP**, report the hash, wait. Lists the exact phrases that count as permission (`push`, `push it`, `ship it`, `deploy`, `push to main`) and the ones that do not (`looks good`, `thanks`, `great`). Permission does NOT carry across turns. Force-pushes, tag pushes, and remote-branch deletes require their own separate confirmation even after a regular push is granted. This section overrides any older skill, template, or charter that said "commit and push".
  - `.github/agents/squad.agent.md` Coordinator refusal rules add a fourth bullet forbidding `git push` without current-turn permission, and the worktree spawn block changes "Commit and push from the worktree" to "Commit from the worktree. Do NOT `git push` unless the user explicitly said push in the current turn."
  - `.squad/skills/git-commit-flow/SKILL.md` rewritten: step 5 was "Show the commit, then ask if the user wants to push"; new step 6 is hard-stop "Do NOT run `git push`. Wait for the user." CHANGELOG update is hoisted to step 2 so it precedes the commit. New `Critical rules` section enumerates the permission phrases and the always-confirm operations.
  - `.squad/agents/artificer/charter.md` gains a `Release & Push Policy (hard rule)` section. Artificer (the most likely pusher, owning all code/infra/Helm/CI) is now explicitly two-stage: land locally, then stop. Pointers back to the canonical copilot-instructions section.
  - `/memories/repo/commit-discipline.md` updated so the rule auto-loads into every new session for this workspace.

### Notes
- This release rolls up six commits (`eb41ec4`, `8209e77`, `f36fdb4`, `710c39b`, `7ab54dd`, `6db932e`, `2d70208`) that had accumulated under the now-forbidden `## [Unreleased]` heading and therefore never deployed. The image-tag fix in the `## Fixed` section is the structural change that makes future un-versioned commits visibly fail (no rollout) rather than silently rebuild with the same tag.

## [3.9.0] - 2026-05-31

### Removed
- **Azure Arc managed identity removed from the boot path.** The chained identity probe in `src/db/pool.js` (and its `IDENTITY_ENDPOINT` env trigger) is gone; `pgPool` is now password-only via `PGPASSWORD`. The Key Vault fetch in `src/lib/azure.js` is gone; `initOpenAI` reads `OPENAI_API_KEY` (or `OPENAI_KEY`) directly. The Azure Storage SDK is gone; `uploadBlobToStorage` writes to the local filesystem under `HOTD_CONTENT_DIR` and throws a clear error when that env is unset. Removed exports: `credential`, `getPgAccessToken`. Removed config constants: `KEY_VAULT_NAME`, `KEY_VAULT_URL`, `OPENAI_KV_SECRET_NAME`. `isAzure` is rebased on `NODE_ENV === "production"` so the public-domain auth cookie still scopes correctly when deployed.
- **`@azure/identity`, `@azure/keyvault-secrets`, `@azure/storage-blob`** dropped from `src/package.json` and `src/package-lock.json` (54 transitive packages removed). The container image no longer carries the Azure SDK.
- **Helm `arcIdentity` block, `keyVault` block, and Arc volume mounts removed.** `helm/hotd-website/values.yaml` no longer renders `arcIdentity.enabled`, `keyVault.name`, or `keyVault.openaiSecretName`. `helm/hotd-website/templates/deployment.yaml` no longer emits `IDENTITY_ENDPOINT`, `IMDS_ENDPOINT`, `KEY_VAULT_NAME`, `OPENAI_KV_SECRET_NAME`, the `arc-tokens` volume/mount of `/var/opt/azcmagent/tokens`, or the `supplementalGroups: [984]` (azcmagent group). `hostNetwork: true` is retained, but its comment is reframed: it now exists solely so the metrics port (`:9464`) stays reachable on the cortana host IP for the existing UnRAID Prometheus scrape.

### Changed
- **Operator-provided OpenAI secret is now the only path.** The chart still wires `OPENAI_API_KEY` via `secretKeyRef` from `openai.existingSecret` (default `openai-api-key`) or from the inline-rendered Secret when `openai.apiKey` is set. Provisioning recipe is inlined in `values.yaml`. Pods that boot without a Secret log `AI: disabled (no OPENAI_API_KEY / OPENAI_KEY in environment)` and every AI route returns the existing `OpenAI client not initialized` 500.

### Notes
- This is a load-bearing simplification: the Arc cert rotation outage from 3.8.2 cannot recur because the code never tries to authenticate against AAD anymore. The DB password and the OpenAI key are both Kubernetes Secrets, end of story.
- Image-upload routes (`scripts/gen-image.js` output, NPC portraits, art uploads, artifact images) need a writable mount at `HOTD_CONTENT_DIR`. The production NAS mount at `/data/hotd-content` is `readOnly: true`, so those routes will return EROFS until either a writable PVC is mounted at the same path or the upload path is repointed at `/app/hotd-campaign/images/notebook` (already a RW PVC). Not addressed in this release; previously the Azure Storage SDK path masked this, but with Arc dead it had been failing identically since the cert rotation. Tracking as a follow-up.

## [3.8.2] - 2026-05-31

### Fixed
- **DM AI surfaces "OpenAI client not initialized" on every AI page.** Arc managed identity in the pod failed to acquire a token (`ChainedTokenCredential` returned 400 from the certificate exchange), so `src/lib/azure.js` could not fetch the OpenAI key from Key Vault, no `OPENAI_API_KEY` env var was wired as a fallback, and every call site in `src/routes/dm-admin-api.js` (DM Chat, Story Forge, session summary, Image Studio) short-circuited with a 500. The Helm chart now defaults `openai.existingSecret` to `openai-api-key`, so when the operator provisions a `Secret/openai-api-key` in the namespace (see provisioning recipe inlined in `values.yaml`) the deployment exports `OPENAI_API_KEY` via `secretKeyRef` and the fallback path in `azure.js` initialises the OpenAI client normally. The Arc identity path still runs first when it is healthy; this is purely defense-in-depth for cert-rotation outages.
- **Search Configuration page reported `RAG STATUS: OFFLINE` even when `dnd-rag` was healthy.** `GET /api/dm-admin/rag-status` in `src/routes/dm-admin-api.js` was reading only `process.env.RAG_SERVICE_URL`, while the Search Configuration UI persists the URL to `hotd_config.rag_service_url` in the DB. The handler now reads the DB-stored value first and falls back to the env var, strips a trailing slash before appending `/health`, and returns the resolved `url` in the JSON response so the UI can show which endpoint it probed. Seeded `hotd_config.rag_service_url` with `http://dnd-rag.hotd-website.svc.cluster.local:3001` so existing installs get a working default.

### Notes
- The underlying Arc managed-identity 400 is most likely a rotated Arc node certificate. The fallback secret is the operational fix; the cert side should be investigated separately. The website behaves identically once either path returns a valid key.
- `dnd-rag` is an auxiliary service surfaced only on the Search Configuration page; the in-app search uses pgvector directly via `src/lib/search.js` and `src/lib/rag.js` and was never impacted by the OFFLINE indicator.

## [3.8.1] - 2026-05-31

### Added
- **`src/lib/ddb-sync.js` — single source of truth for D&D Beyond character sync.** Consolidates every extractor and the `UPDATE hotd_player_characters` write path into one library. Exports `syncCharacterFromDDB(ddbId, localId)`, `fetchDDBCharacter(ddbId)`, `buildSyncRowFromDDB(data)`, and a `DDB_OWNED_FIELDS` whitelist. Both the in-app GM Player Workspace `Sync from DDB` button (via `src/routes/dm-admin-api.js`) and the standalone CLI (`scripts/sync-ddb-characters.js`) now delegate here, so the two code paths can never drift apart again.
- **New `hotd_player_characters` columns populated on every DDB sync:** `spell_slots JSONB` (per-level max/used/remaining plus pact-magic slots for Warlocks), `hit_dice JSONB` (per-class die size + remaining count for short rests), `currencies JSONB` ({cp, sp, ep, gp, pp}), `death_saves JSONB` ({success, fail}). All columns are added idempotently via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- **Combat State section in the GM Player Workspace.** New collapsible section between Identity & Mechanics and Story showing initiative, temp HP, passives (Perception/Investigation/Insight), senses, spell-slot tracker, hit-dice tracker per class, wealth in mixed coinage, death-save counters, and active condition list. All read-only, sourced from DDB on each sync.
- **Comprehensive DDB extractors.** `extractSpells` now captures school, casting time, range, components (V/S/M), duration, concentration, ritual, prepared/always-prepared flag, source (class/race/feat/item/background), and a truncated description per spell. `extractEquipment` now captures item type (Armor/Weapon/Wondrous Item/Potion/etc.), rarity, magical flag, attunement state, weight, and description. `extractFeatures` now captures source class/subclass/race/feat plus a truncated rules-text description. Five new top-level extractors: `extractSpellSlots`, `extractHitDice`, `extractCurrencies`, `extractDeathSaves`, `extractConditions`.

### Changed
- **GM Player Workspace `Sync from DDB` button is now comprehensive.** Previously it wrote only 17 mechanical fields (ability scores, AC, max HP, speed, alignment, background, avatar), so Story/Inventory/Spells/Attacks/Skills/Saving Throws/Features remained stale after the button was clicked. It now writes the same 49 DDB-owned columns the CLI script writes plus the four new combat-state columns, all in a single UPDATE.
- **`scripts/sync-ddb-characters.js` reduced to a thin CLI wrapper.** Removed ~430 lines of duplicated extractor logic (it had drifted ahead of the in-app version, which was the proximate cause of the stale-UI bug). The script now imports `syncCharacterFromDDB` from the shared lib and adds CLI niceties: `--id <ddbId>` to target a single character and `--reindex` to spawn `embed-pipeline --source character --mode incremental` after a successful batch.
- **PC RAG embeddings now include combat-state context.** `scripts/embed-pipeline.js` PC SELECT and text-builder add lines for current spell slots (`L1: 4/4, L2: 3/3`), hit dice per class, mixed-coinage wealth, and active conditions, so DM AI queries like "who has spell slots left?" or "how much gold does the party have?" can be answered from RAG context.
- **Inventory & Abilities section in the GM Player Workspace** now renders each spell with school/level/casting flags and each item with type/rarity/equipped/attuned/magical badges, instead of bare names.

### Fixed
- DM Notes column remains untouched on every DDB sync. The shared lib's `DDB_OWNED_FIELDS` whitelist explicitly excludes `dm_notes`, `player_name`, `id`, `ddb_character_id`, and `created_at`. The contract from 3.8.0 (only `dm_notes` is GM-editable; everything else is DDB-owned and read-only) holds for both sync paths.

## [3.8.0] - 2026-05-31

### Added
- **GM Player Workspace at `/characters/admin`.** New admin-only two-pane workbench (30/70 split, mirrors the Sessions Workspace pattern) that gives the DM a single place to view player character data and curate per-PC campaign notes. The left pane lists every PC with avatar, level, race, and class; the right pane renders the selected character as a read-only stat block (ability scores, AC/HP/Speed, background, alignment, faith, languages), plus collapsible read-only sections for Story (backstory/personality/ideals/bonds/flaws), Inventory (equipment/attacks/spells/features), and the DDB-sourced Other Notes. The only editable field is a new EasyMDE `dm_notes` column. A single green `[PUBLISH]` button persists `dm_notes` and immediately spawns `embed-pipeline.js --source character --mode incremental` so the RAG vector store reflects both the new GM notes and any DDB-synced mechanical changes for that character. Per-character `Sync from DDB` and global `Sync All DDB` buttons are wired to the existing DDB sync routes, which only touch mechanical/identity fields and leave `dm_notes` untouched. A canon audit log panel surfaces every `hotd_canon_audit` row targeting the selected PC so the DM can see which Session Publish wrote which notes. A `beforeunload` guard prevents accidental loss of unsaved DM Notes.
- **`hotd_player_characters.dm_notes` column.** New GM-owned `TEXT DEFAULT ''` column managed exclusively by the GM Player Workspace and the canon auto-applier. DDB sync never writes to it, so canon-applied campaign history (and anything the GM types) survives indefinitely.
- **API endpoints for the GM Player Workspace:** `GET /api/dm-admin/characters/:id` returns a single PC's full row, `POST /api/dm-admin/characters/:id/publish` accepts `{ dm_notes }` and atomically saves + reindexes, `GET /api/dm-admin/characters/:id/audit` returns up to 100 canon-applied audit rows for that PC joined with session number/title/game_date.

### Changed
- **Canon auto-applier now writes to `dm_notes` instead of `notes`.** `applyPcNoteAppend()` and `resolvePc()` in `src/lib/canon-applier.js` were retargeted to the new GM-owned column, and the audit row `field` value flipped from `"notes"` to `"dm_notes"` so the workspace audit log groups cleanly. This closes the v3.6.0 clobber hazard where a subsequent `scripts/sync-ddb-characters.js` run would overwrite canon-applied notes with the player's DDB Other Notes field.
- **Embed pipeline includes both notes fields for each PC.** `scripts/embed-pipeline.js` now selects `dm_notes` alongside `notes` and labels them distinctly in the embedded text (`Player Notes (from D&D Beyond):` vs `DM Campaign Notes:`) so the RAG store can surface either source by semantic similarity.
- **DM AI `get_player_character` tool returns `dm_notes`.** `src/lib/ai-tools.js` adds `dm_notes` to the SELECT used by the function-calling tool, so the DM AI can cite GM-curated campaign notes alongside the DDB-sourced data.
- **Home Admin landing.** The misleading "manage them via NPCs Admin" copy under Player Characters is replaced with a direct link to `/characters/admin`.

### Removed
- `PUT /api/dm-admin/characters/:id` (the broad whitelist endpoint that exposed identity/mechanical/ability fields). Those columns are owned by D&D Beyond and would be clobbered on the next sync, so the UI no longer needs a path to edit them. `dm_notes` is the only writable field, and it goes through the new publish endpoint.

### Notes
- The `dm_notes` column is created empty on existing rows; no data migration is performed. If any v3.6.0 canon-applied content is currently stored in the `notes` column, the DM can copy it into the GM Player Workspace and publish to relocate it. After 3.8.0, DDB syncs may overwrite anything left in `notes` (DDB's "Other Notes" field is its source of truth).

## [3.7.2] - 2026-05-31

### Fixed
- **TLS regression after ingress controller restart.** The chart was injecting `nginx.ingress.kubernetes.io/server-snippet` (via `ingress.blockMetricsAtIngress: true`) to 404 `/metrics` on the public host. Recent nginx-ingress builds flag any `server-snippet` value as risky and drop the entire Ingress on reload (`annotation group ServerSnippet contains risky annotation`). When the controller restarted today at 12:34 UTC it discarded the hotd-website Ingress and started serving its built-in `Kubernetes Ingress Controller Fake Certificate` for `hotd.knoxrpg.com`, producing `ERR_CERT_AUTHORITY_INVALID` in browsers. The snippet was defense-in-depth only: the app backend on `:3000` does not expose `/metrics` (prom-client binds a separate `:9464` listener that the public Ingress never routes to). Defaulted `blockMetricsAtIngress` to `false` so the Ingress is accepted and the real Let's Encrypt secret `tls-hotd-website` is served again.

## [3.7.1] - 2026-05-31

### Added
- **App-Insights-equivalent per-request telemetry to Loki.** The outer HTTP handler in `src/server.js` now emits one structured log per request (`kind: "request"`) carrying `method`, `url`, `route` (low-cardinality, reuses `metrics.normalizeRoute`), `statusCode`, `success`, `durationMs`, `requestId`, `operationId` (W3C `traceparent` parent honored if present), `parentId`, `ip` (X-Forwarded-For aware), `userAgent`, `referer`, `username`, `role`, `queryString`, `responseSize`, `contentType`, and `isStatic`. Log level is `error` for 5xx, `warn` for 4xx, `info` otherwise. Health probes (`/health`, `/healthz`, `/metrics`) and successful static-asset reads are excluded so the stream stays signal-heavy; everything is still counted in Prometheus.
- **Exception logging** via new `telemetry.trackException(err, ctx)` (`kind: "exception"`, App Insights `exceptions` table equivalent). Carries `type`, `message`, `stack` (truncated), `code`, `requestId` + `operationId` for correlation, `route`, `method`, `url`, `username`, `role`, and a free-form `source`. Wired into the `server.js` dispatch catch so every uncaught error during a request lands in Loki tied to its originating request.
- `X-Request-Id` response header so client-side bug reports can be pasted straight into the Loki query `{app="hotd-website"} |~ "<id>"`.
- Bytes-sent capture (`responseSize`) via lightweight `res.write` / `res.end` wrappers, with no behavior change for callers.

### Internal
- `src/lib/telemetry.js`: exports `trackRequest` and `trackException`.
- `src/server.js`: requires `crypto` for `randomUUID`; assigns `req.session` so the per-request log can pick up the authenticated user; replaces the prior minimal metrics-only try/finally with a `res.on('close')` emission path that always runs even when handlers stream a long response.

## [3.7.0] - 2026-05-31

### Added
- **Prometheus metrics + Grafana dashboard + Loki-ready structured logs.** Wires the website into the existing UnRAID-hosted LGTM stack (Prometheus v3.3.0 / Loki 3.4.2 / Grafana 11.6.0) following the established cortana-NodePort-pulled-by-UnRAID-Prometheus pattern used by DCGM, kube-state-metrics, FoundryVTT, and the *arr healthcheck.
  - New `src/lib/metrics.js` builds a `prom-client` registry with default label `app="hotd-website"`. Exposes default Node runtime metrics (`process_*`, `nodejs_*`) plus `http_requests_total{method,route,status}` + `http_request_duration_seconds` (route bucketed via `normalizeRoute` to keep cardinality bounded), `hotd_pg_pool_*` gauges, `hotd_db_queries_total{role}` + duration histogram, `hotd_openai_requests_total{model,finish_reason,is_dm}` + duration + `hotd_openai_tokens_total{model,kind}` + `hotd_openai_tool_rounds_total{model}`, `hotd_rag_queries_total`, and `hotd_auth_attempts_total{result}` / `hotd_auth_signups_total` / `hotd_auth_logouts_total`. Listener binds on a **separate port `:9464`** so `/metrics` never crosses the public ingress.
  - `src/server.js` calls `metrics.startMetricsServer()` and `metrics.startPgPoolPoll(pgPool)` on boot, and the request dispatcher is wrapped in a try/finally that records `observeHttp(method, normalizedRoute, status, durationSec)` on every response.
  - `src/lib/telemetry.js` was rewritten as a bridge over `metrics.js`. Public API preserved — every existing `trackLogin/trackSignup/trackLogout/trackAiChat/trackDbQuery/trackEvent/trackMetric` call site keeps working unchanged. Every event also emits an optional structured JSON log line (one object per line) gated on `HOTD_LOG_FORMAT=json`.
  - New `src/lib/loki-shipper.js` provides opt-in in-process push to Loki (`LOKI_PUSH_URL=http://192.168.10.20:3100/loki/api/v1/push`) with 2s/100-line batching, per-level streams, downward-API labels (`pod`, `namespace`, `host`, `env`), and fail-open semantics. Transitional until a cluster-wide Alloy/Promtail DaemonSet lands.
  - New `src/lib/tracing.js` is an inert OpenTelemetry stub. Activates when `OTEL_EXPORTER_OTLP_ENDPOINT` is set **and** the optional `@opentelemetry/sdk-node` + `exporter-trace-otlp-http` + `auto-instrumentations-node` packages are installed; otherwise it warns once and stays out of the request path. Seed for the future Grafana Tempo deployment at `192.168.10.20:4318`.
- **Complete OpenAI call-site coverage.** Previously only `chatWithTools` in `src/lib/ai-tools.js` was instrumented; six other in-process OpenAI call sites were running silently. New helpers in `src/lib/telemetry.js`:
  - `recordChatCompletion(completion, {model, username, isDM, source, latencyMs, toolRounds})` extracts `usage.prompt_tokens / completion_tokens / total_tokens` and `choices[0].finish_reason` automatically from the raw OpenAI response.
  - `trackAiImage({username, model, size, quality, count, latencyMs, success, source, error})` covers `images.generate`.
  - `trackAiEmbedding({model, tokens, count, latencyMs, success, source, error})` covers `embeddings.create`.
  - New Prometheus metrics: `hotd_openai_images_total{model,size,quality,result}`, `hotd_openai_image_duration_seconds{model,size}`, `hotd_openai_embeddings_total{model,result}`, `hotd_openai_embedding_duration_seconds{model}`. The existing `hotd_openai_tokens_total` gained a `kind="embedding"` series so dashboards can sum chat + embedding spend per model in one query.
  - Instrumented call sites: chat completions in `src/lib/canon-extractor.js`, `src/lib/search.js`, and three handlers in `src/routes/dm-admin-api.js` (session summary, Story Forge, DM chat). Image generations in `src/routes/dm-admin-api.js` and `src/routes/admin-test.js` (both wrapped in try/catch so failures count as `result="failure"`). Embeddings in `src/lib/rag.js`. The `source` field is a free-form log label like `"dm-admin.chat"`, `"canon-extractor"`, `"search.ai-summary"` so log streams can be filtered without inflating Prometheus cardinality.
- **Grafana dashboard `observability/dashboards/hotd-website.json`** (31 panels across 8 rows): Service health (RED), Auth, AI usage (chat rate / tokens-per-minute / latency p95 / tool rounds + RAG), Database (rate / latency / pg pool), Node.js runtime (heap / eventloop / RSS), Logs from Loki (all + errors-only), Deployment (pod restarts / process start time), and AI: images & embeddings (image rate by result / image latency p95 by size / embedding rate / embedding tokens-per-minute). Datasource UIDs are the provisioned `prometheus`, `loki`, and `grafana` references that already exist on the obs host.
- **Helm chart wiring** (`helm/hotd-website/values.yaml` + `templates/deployment.yaml` + `templates/ingress.yaml`): new `observability:` block with `metrics.{enabled,port,bindAddr}`, `logs.format`, `loki.{enabled,pushUrl,extraLabels}`, `tracing.{enabled,endpoint,serviceName}` toggles. Deployment template adds a `metrics` containerPort, conditional `METRICS_*` / `HOTD_LOG_FORMAT` / `LOKI_*` / `OTEL_*` env vars, and always-on downward-API env (`POD_NAME`, `POD_NAMESPACE`, `NODE_NAME`). Ingress template adds an `nginx.ingress.kubernetes.io/server-snippet` that returns 404 for `/metrics` and `/metrics/` on the public host (toggle via `ingress.blockMetricsAtIngress`, default true).
- **CI/CD workflows** (`.github/workflows/`):
  - `validate-observability.yml` runs on PR/push touching observability paths. Validates dashboard JSON (`jq empty`, required `uid` / `title`, datasource-UID allowlist of `prometheus|loki|grafana`), renders the Helm chart and greps for the expected `metrics` port + env + ingress snippet, and `node --check`s all five observability lib files.
  - `grafana-dashboard-sync.yml` runs on push to `main` touching `observability/dashboards/**`. POSTs each dashboard to `$GRAFANA_URL/api/dashboards/db` with `GRAFANA_API_TOKEN`. Both workflows run on the self-hosted `[self-hosted, linux, cortana]` runner.
- **Out-of-repo PR snippets** captured in `observability/phase-4-prs.md`: Prometheus scrape-job patch for `cloudgeeklabs/homeStack-files` (new `hotd_website` job at `192.168.10.210:9464`, 30s interval, with reload + verify steps), and four knowledge-base updates for `cloudgeeklabs/homenetwork` (`exporters.md`, `prometheus.md`, `grafana.md`, `knoxrpg-services/hotd-website.md`).

### Changed
- `src/package.json` adds `prom-client@^15.1.3`. No other production dependencies.
- `src/server.js` now invokes `require("./lib/tracing").start()` as its first line so OTel auto-instrumentation can patch `http` before the server boots (no-op unless the OTel SDK is installed).

### Notes
- The pod runs `hostNetwork: true` (Arc managed identity), so the `:9464` listener binds directly on the cortana host IP. No NodePort or extra Service is required; UnRAID Prometheus scrapes `http://192.168.10.210:9464/metrics` exactly the same way it scrapes the other Cortana exporters.
- Loki shipping and OTel tracing are both opt-in and default-off. The website behaves identically to 3.6.1 until the operator sets `LOKI_PUSH_URL` (or `observability.loki.enabled: true` + `pushUrl` in Helm values) or installs the OTel SDK packages.
- The five known npm audit advisories introduced by `prom-client@15.1.3` were not addressed in this release; tracked for a follow-up audit pass.

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
