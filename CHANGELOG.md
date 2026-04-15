# Changelog

All notable changes to the Halls of the Damned campaign website will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
