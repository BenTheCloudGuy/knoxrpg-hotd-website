# D&D Beyond → HOTD RAG Coverage Audit

**Generated:** 2026-07-09
**Owner:** Artificer (AI/RAG + campaign data infrastructure)
**Scope:** Compare content purchased/entitled on D&D Beyond against what is currently loaded into the HOTD retrieval database (`hotd_embeddings`) and its backing source tables.

---

## 1. Executive Summary

| Metric | Value |
|--------|-------|
| DDB sources you are entitled to (with monster content) | **132 named + 12 unmapped** |
| DDB sources already synced into HOTD | **89** |
| **DDB sources owned but MISSING from HOTD** | **43** |
| DDB monsters entitled (live count) | **5,889** |
| Monsters currently in HOTD DB | **4,165** |
| **Monster shortfall** | **~1,724** |
| RAG embedding rows total | **37,136** |
| DB-backed content (spells/monsters/items) → RAG | **Fully embedded (no gap)** |
| Book prose files staged in blob but NOT embedded | **4** (`hftt`, `mcv1`, `tvd`, `ua`) |

**Headline:** The pipeline from the local database into the RAG is healthy. Everything that has been *downloaded* from DDB is embedded. The real gap is *upstream*: you own **43 source books on D&D Beyond that have never been pulled into HOTD at all**, including a batch of recent 2024/2025 releases (Dragon Delves, Forgotten Realms: Adventures in Faerûn, Heroes of the Borderlands, Netheril's Fall, Ravenloft: The Horrors Within, Eberron: Forge of the Artificer, and more).

---

## 2. What Is In the HOTD RAG Today

### 2.1 Embeddings by type (`hotd_embeddings`, 37,136 rows)

| Source type | Chunks | Distinct sources |
|-------------|-------:|-----------------:|
| `dnd_book` (full book prose) | 23,349 | 104 books |
| `ddb_monster` | 6,744 | 132 |
| `ddb_magic_item` | 4,604 | 94 |
| `ddb_spell` | 739 | 31 |
| `ddb_class` | 652 | 19 |
| `ddb_feat` | 185 | 14 |
| `ddb_background` | 115 | 20 |
| `ddb_race` | 91 | 23 |
| `notebook` (campaign) | 531 | 1 |
| `npc` (campaign) | 81 | 1 |
| `calendar` | 16 | 1 |
| `handout` | 14 | 1 |
| `character` | 11 | 1 |
| `artifact` | 4 | 1 |

### 2.2 Backing source tables (pre-embed)

| Table | Rows | Notes |
|-------|-----:|-------|
| `monsters` | 4,165 | All embeddable rows are embedded |
| `magic_items` | 4,435 | 4,423 embedded; 12 lack a usable description |
| `spells` | 724 | Fully embedded |
| `classes` | 296 | Classes + subclasses |
| `feats` | 199 | |
| `items` | 151 | Mundane equipment |
| `backgrounds` | 131 | |
| `races` | 122 | |
| `weapons` | 44 | |
| `mounts_vehicles` | 34 | |
| `armor` | 13 | |

**Layer B (DB → RAG) verdict:** Complete. Spells 724/724, monsters 4,165/4,165, magic items 4,423/4,423 embeddable rows are present in the RAG. No embedding backlog for table-backed content.

---

## 3. What You Own on D&D Beyond

Ownership was enumerated live from the DDB monster service (`monster-service.dndbeyond.com/v1/Monster`), which respects your account entitlements and tags every monster with its source book. Source IDs were mapped to book codes/titles via the DDB config catalog (238 sources total). This method reliably captures every purchased book that contains at least one stat block, which is the large majority of the catalog.

- **Entitled monsters (live):** 5,889
- **Named owned sources detected:** 132
- **Owned sources already in HOTD:** 89 (6,309 monster attributions)
- **Owned sources missing from HOTD:** 43 (1,523 monster attributions)
- **Unmapped owned source IDs** (newer than the cached catalog): 12 (`id63`–`id78`, `id242`), ~52 monsters. Pulling their contents shows these are **Play-Along packs, drop-in encounter packs, and generic-statblock sub-sources**, not new full books. Examples: `id242` = the DMR (Ravenloft Play-Along) Gremishkas, `id72` = generic 2024 statblocks (Expert/Warrior/Spellcaster), `id63` = Sunless Citadel / Forge of Fury encounter NPCs (Belak, Sir Braford, Yusdrayl). All are absent from HOTD.

---

## 4. Gap Analysis

### 4.1 PRIMARY GAP — Books you own but that are NOT in HOTD (43)

Sorted by content richness (monster count is used as a proxy for how much would be ingested). These have **zero** presence in the database, blob prose, or the RAG.

#### Recent WotC / 5.5e releases (highest priority)

| Code | Title | ~Monsters |
|------|-------|----------:|
| `drde` | Dragon Delves | 121 |
| `rthw` | Ravenloft: The Horrors Within | 101 |
| `fraif` | Forgotten Realms: Adventures in Faerûn | 42 |
| `hotb` | Heroes of the Borderlands | 42 |
| `nf` | Netheril's Fall | 42 |
| `wthc` | Stranger Things: Welcome to the Hellfire Club | 31 |
| `efota` | Eberron: Forge of the Artificer | 25 |
| `dmr` | Dungeon Masters: Ravenloft Play-Along Pack | 16 |
| `lfl` | Lorwyn: First Light | 13 |
| `sos` | Shadows of Sithicus | 12 |
| `hbtd` | Hold Back The Dead | 9 |
| `dmls` | Dungeon Masters: Living Spells Play-Along Pack | 8 |
| `frtts` | Forgotten Realms: The Tenebrous Stone | 6 |
| `aboh` | Astarion's Book of Hungers | 5 |
| `frhof` | Forgotten Realms: Heroes of Faerûn | 3 |
| `dmrf` | Dungeon Masters: Zombie Clot Play-Along Pack | 2 |
| `dod` | Domains of Delight: A Feywild Accessory | 1 |

#### Third-party / partner content

| Code | Title | Publisher | ~Monsters |
|------|-------|-----------|----------:|
| `wel` | Where Evil Lives | MCDM | 143 |
| `dddod` | Dr Dhrolin's Dictionary of Dinosaurs | Palaeo Games | 138 |
| `hwt` | Humblewood Tales | Humblewood | 105 |
| `av` | Abomination Vaults | Paizo | 92 |
| `ottg` | Obojima: Tales from the Tall Grass | 1985 Games | 85 |
| `nwb` | Northlands Worldbook | Kobold Press | 58 |
| `hgtmh2` | Heliana's Guide to Monster Hunting: Part 2 | Loot Tavern | 57 |
| `hgtmh1` | Heliana's Guide to Monster Hunting: Part 1 | Loot Tavern | 54 |
| `tcsr` | Tal'Dorei Campaign Setting Reborn | Critical Role | 46 |
| `hcs` | Humblewood Campaign Setting | Humblewood | 46 |
| `lotrr` | The Lord of the Rings Roleplaying | Free League | 31 |
| `fpw1` | Faster, Purple Worm! Everybody Dies, Vol. 1 | Beadle & Grimm's | 27 |
| `ctbt` | Cthulhu by Torchlight | Chaosium | 24 |
| `ghcg` | Grim Hollow: Campaign Guide | Grim Hollow | 24 |
| `gsb1` | The Griffon's Saddlebag: Book One | Griffon's Saddlebag | 13 |
| `exeb` | Exploring Eberron (2024) | Visionary P&D | 8 |
| `mpmv1` | Misplaced Monsters: Volume One | Legacy/Noncore | 6 |
| `ns` | Northlands Sagas | Kobold Press | 5 |
| `mcv3` | Monstrous Compendium Vol. 3: Minecraft Creatures | Minecraft | 5 |
| `tpc` | The Pugilist Class (2024) | Sterling Vermin | 4 |
| `oswhap` | One-Shot Wonders: Holiday Adventure Pack | Roll & Play | 3 |
| `ghpg` | Grim Hollow: Player's Guide | Grim Hollow | 1 |

#### Adventures / setting books with existing sibling content

| Code | Title | Note |
|------|-------|------|
| `dodr` | Dungeons of Drakkenheim (56 monsters) | Distinct from `modr` (Monsters of Drakkenheim), which you already have. The main adventure/setting book is not synced. |
| `sd` | Sapphire Dragon (1) | Hidden source |

#### Subscriber drops (D&D Beyond Drops)

DDB Drops is a **cumulative monthly subscriber feed**, not a book: each month adds maps, monsters, player options (feats/fighting styles), magic items, drop-in encounters, digital dice, sticker packs, and character-sheet backdrops. Only the text/mechanical slices belong in the RAG (monsters, feats, magic items, encounters); maps, dice, stickers, and backdrops are assets.

Both owned Drops sources are **100% absent** from HOTD (no DB rows in `monsters` / `magic_items` / `spells` / `feats`, nothing embedded):

| Code | Source ID | Title | Monster content |
|------|----------:|-------|-----------------|
| `ddbd` | 272 | D&D Beyond Drops | Angel of Death/Obsession/Slaughter/Vengeance, Ice/Magma/Mud/Smoke Elemental (8) |
| `ddbdsp` | 283 | Para-elemental Sticker Pack | Ice/Magma/Mud/Smoke Elemental (4, duplicates of `ddbd`) |

> **The monster count understates the Drops gap.** The live enumeration only sees the monster slice (12 stat blocks). The accumulated Drops **feats** (Pack Fighting, Prone Fighting, Shifting Combatant, Tactical Combatant, ...), **magic items** (Climber's Ammunition, Goggles of Foe-Finding, Stormwalker's Cloak, ...), and **drop-in encounters** are not captured by the monster service and are also missing from the RAG. Because Drops grows monthly, it needs a dedicated, repeatable munch (filter monster-service to source IDs 272/283, plus the feat/item services) rather than a one-time book import. Reference: https://www.dndbeyond.com/en/library/subscriber-content

### 4.2 SECONDARY GAP — Book prose staged but not embedded (Layer B)

Four book text files exist in the `books-text` blob container but were never chunked into `dnd_book` embeddings:

| Code | Title |
|------|-------|
| `hftt` | Hunt for the Thessalhydra |
| `mcv1` | Monstrous Compendium Vol. 1: Spelljammer Creatures |
| `tvd` | The Vecna Dossier |
| `ua` | Unearthed Arcana |

Their structured data (monsters/items) may already be embedded via the DB path, but the full prose is not searchable in the RAG. Re-running the Phase 3 embed pass would close this.

### 4.3 No gap — DB → RAG

As noted in Section 2.2, every embeddable spell, monster, and magic item currently in the database is present in the RAG. The `check-ddb-changes.js` / `embed-ddb-content.js` pipeline has no outstanding backlog for table-backed content.

---

## 5. Category Deltas (owned vs loaded)

| Category | In HOTD now | DDB entitled (live) | Gap |
|----------|------------:|--------------------:|-----|
| Monsters | 4,165 | 5,889 | **~1,724** across the 43 missing books plus updates to owned books |
| Full book prose | 104 books | 132+ owned w/ content | **28+ books** of prose (43 missing minus the pure-supplement drops) |
| Spells | 724 | Not directly counted (per-class API only) | New spells arrive with the missing 2024/2025 books |
| Magic items | 4,435 | Not directly counted | Same |
| Classes/subclasses | 296 | | Pugilist (`tpc`), Artificer updates (`efota`), etc. not present |
| Races | 122 | | New lineages in the missing books not present |
| Feats / backgrounds | 199 / 131 | | New options in missing books not present |

> Direct entitlement counts for spells, magic items, classes, races, feats, and backgrounds were not retrievable in this pass. The DDB spell service is per-class and the item/equipment service paths returned 404 for the versions tried. Because these options ship inside the source books, the 43 missing books in Section 4.1 are the complete list of where that content lives. Enumerating exact per-category counts would require the class-by-class spell walk and the correct item service version.

---

## 6. Recommendations

1. **Ingest the missing books.** Prioritize the recent WotC releases and the high-monster-count third-party books (`wel`, `dddod`, `hwt`, `av`, `ottg`, `drde`, `rthw`). Each needs: (a) monster/spell/item munch into the DB tables, (b) prose into `books-text`, (c) structured extract into `books-extracted`, then (d) `node scripts/embed-ddb-content.js --phase all`.
2. **Close the four-book prose gap** (`hftt`, `mcv1`, `tvd`, `ua`) with a Phase 3 embed run once their text is confirmed in blob.
3. **Set up a dedicated D&D Beyond Drops munch** for source IDs 272 (`ddbd`) and 283 (`ddbdsp`), covering the monsters plus the accumulated Drops feats, magic items, and encounters that the monster service does not expose. Re-run it monthly since Drops adds content on an ongoing basis.
4. **Refresh the config catalog** so the 12 unmapped source IDs (`id63`–`id78`, `id242`) resolve to titles. They are Play-Along / drop-in encounter / generic-statblock sub-sources newer than the cached catalog snapshot, not full books.
5. **Add source-code aliasing** to the sync tooling for known divergences (for example DDB `dodr` vs local `modr`/`ddia-mord`, DDB `br-2024` vs local `free-rules`) so future audits do not produce false positives.
6. **Consider a scheduled re-audit** (monthly) using the monster-service enumeration to catch new purchases automatically.

---

## 7. Methodology & Caveats

- **Owned-source truth:** live enumeration of `monster-service.dndbeyond.com/v1/Monster` (5,889 monsters, paged at 100/req), aggregating `sources[].sourceId` per monster, mapped through the DDB config catalog (`/api/config/json`, 238 sources).
- **Synced truth:** union of normalized `source` codes across `monsters` / `magic_items` / `spells` tables, the `books-text` and `books-extracted` blob containers (`cloudgeekcusgaming01`), and distinct `dnd_book` book codes in `hotd_embeddings`.
- **Monster counts are per-source attributions**, not distinct monsters. A creature credited to two books counts in both, so "have" (6,309) + "missing" (1,523) exceeds the 5,889 distinct total. Counts are a richness proxy, not exact ingest volume.
- **Coverage limit:** a purchased book with *no* stat blocks would not surface through the monster service. Cross-referencing against the 238-source catalog and the known WotC 2024/2025 release list did not reveal such a case here, but a pure player-options book is theoretically possible to miss.
- **Auth:** DDB access used the cached `DDB_COBALT_SESSION_TOKEN` exchanged for a short-lived bearer. The token was valid at audit time.
