# Changelog

All notable changes to the Halls of the Damned campaign website will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.7.0] - 2026-04-25

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
