# Changelog

All notable changes to the Halls of the Damned campaign website will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
