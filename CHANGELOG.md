# Changelog

All notable changes to the Halls of the Damned campaign website will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
