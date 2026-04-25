# D&D Beyond Image Sync Requirements

## Problem

The HotD Website database contains D&D Beyond content (monsters, spells, magic items, etc.) synced from DDB. All image URLs point to an **Azure Blob Storage account that no longer exists** (`knoxrpgwebsitestore.blob.core.windows.net` returns NXDOMAIN). Images need to be re-acquired from D&D Beyond and stored locally on the NAS.

---

## Infrastructure

| Component | Details |
|-----------|---------|
| **Server** | Cortana (Azure VM, `20.29.42.149`, MicroK8s) |
| **Database** | PostgreSQL 17 + pgvector, `postgres-pgvector.ai.svc.cluster.local:5432` |
| **DB Name** | `dnd_website` |
| **DB User** | `cortana` |
| **NAS Path** | `/mnt/nas/Gaming/ASSETS/DDB_CONTENT/hotd-website-content/` |
| **Pod Mount** | `/data/hotd-content` (read-only hostPath in k8s) |
| **Web URL Base** | `https://hotd.knoxrpg.com/hotd-content/` |

---

## Database Tables with Images Needed

### `monsters` — 4,141 rows, ALL have broken image URLs

| Column | Type | Notes |
|--------|------|-------|
| `id` | text | DDB monster ID (e.g. `16907`) |
| `name` | text | Monster name (e.g. `Goblin`) |
| `slug` | text | URL slug (e.g. `16907-goblin`) |
| `source` | text | Source book code (e.g. `mm`, `mm-2024`, `vgtm`) |
| `avatar_url` | text | **BROKEN** — points to deleted Azure blob |
| `raw_json` | jsonb | Full DDB API response, includes `avatarId` (integer) |

**Broken URL pattern:**
```
https://knoxrpgwebsitestore.blob.core.windows.net/images/monsters/{id}.jpeg
```

**DDB avatar ID in raw_json:**
```json
{ "avatarId": 350, "largeAvatarId": null }
```

**Target local path:** `/mnt/nas/Gaming/ASSETS/DDB_CONTENT/hotd-website-content/images/monsters/{id}.jpeg`
**Target DB URL:** `/hotd-content/images/monsters/{id}.jpeg`

### `magic_items` — 4,435 rows, 1,595 have broken image URLs

| Column | Type | Notes |
|--------|------|-------|
| `id` | text | DDB item ID |
| `name` | text | Item name |
| `avatar_url` | text | **BROKEN** for 1,595 rows, NULL/empty for 2,840 |
| `raw_json` | jsonb | Full DDB API response |

**Broken URL pattern:**
```
https://knoxrpgwebsitestore.blob.core.windows.net/images/magic-items/{id}.jpeg
```

**Target local path:** `/mnt/nas/Gaming/ASSETS/DDB_CONTENT/hotd-website-content/images/magic-items/{id}.jpeg`
**Target DB URL:** `/hotd-content/images/magic-items/{id}.jpeg`

---

## Tables WITHOUT Images (data only, no action needed for images)

| Table | Rows | Content |
|-------|------|---------|
| `spells` | 724 | All spells (PHB, XGTE, TCE, etc.) with `description_text`, `raw_json` |
| `classes` | 296 | Classes + subclasses |
| `feats` | 199 | All feats |
| `races` | 122 | Race options |
| `backgrounds` | 131 | Background options |
| `items` | 151 | Mundane equipment |
| `weapons` | 44 | Weapon stats |
| `armor` | 13 | Armor stats |
| `mounts_vehicles` | 34 | Mounts and vehicles |

---

## Source Book Coverage

### Monsters (4,141 total, top sources)

| Source | Count |
|--------|-------|
| tob1 (Tome of Beasts 1) | 433 |
| fm (Flee Mortals) | 293 |
| mm-2024 + mm (Monster Manual) | 426 |
| modr (Dungeons of Drakkenheim) | 223 |
| gsb2 (Grim Hollow) | 104 |
| wdotmm (Waterdeep: Dungeon of the Mad Mage) | 95 |
| motm + vgtm (Mordenkainen's/Volo's) | 94 |
| motm + mtof (Mordenkainen's Tome of Foes) | 92 |

### Spells (724 total, top sources)

| Source | Count |
|--------|-------|
| phb-2024 + phb (Player's Handbook) | 354 |
| xgte (Xanathar's Guide) | 85 |
| boet | 59 |
| tcmp1 | 38 |
| tcoe (Tasha's Cauldron) | 12 |

### Magic Items (4,435 total, top sources)

| Source | Count |
|--------|-------|
| gsb2 (Grim Hollow) | 727 |
| free-rules | 624 |
| dmg-2024 (Dungeon Master's Guide) | 561 |
| modr (Drakkenheim) | 265 |
| tbomt | 233 |
| egtw (Explorer's Guide to Wildemount) | 207 |

---

## Current NAS Layout

```
/mnt/nas/Gaming/ASSETS/DDB_CONTENT/hotd-website-content/
├── art/                    (31 files — campaign art)
├── artifacts/              (4 files — artifact images)
├── handouts/               (13 files — in-game handouts)
├── maps/                   (4 files — campaign maps)
├── images/                 ← DOES NOT EXIST YET
│   ├── monsters/           ← needs ~4,141 images
│   └── magic-items/        ← needs ~1,595 images
└── session27-dm-guide.pdf
Total current size: 86 MB
```

---

## What Needs to Happen

### 1. Download Images from D&D Beyond

For each row in `monsters` and `magic_items` that has a non-empty `avatar_url`:

- Extract the DDB `avatarId` from `raw_json` (monsters) or derive it from the existing URL filename
- Download the avatar image from DDB's CDN (requires DDB authentication/cookies)
- Save to NAS at the target paths above

**Estimated downloads:**
- Monsters: ~4,141 images
- Magic Items: ~1,595 images
- **Total: ~5,736 images**

### 2. Update Database URLs

After images are on the NAS, run SQL updates:

```sql
-- Monsters: rewrite blob URLs to local paths
UPDATE monsters
SET avatar_url = '/hotd-content/images/monsters/' || split_part(avatar_url, '/monsters/', 2)
WHERE avatar_url LIKE '%knoxrpgwebsitestore%';

-- Magic Items: rewrite blob URLs to local paths
UPDATE magic_items
SET avatar_url = '/hotd-content/images/magic-items/' || split_part(avatar_url, '/magic-items/', 2)
WHERE avatar_url LIKE '%knoxrpgwebsitestore%';
```

### 3. Extend URL Rewriter (already handled)

The website's `pool.js` already rewrites `hotd-website-content` blob URLs to `/hotd-content/`. Once the DB URLs are updated to `/hotd-content/...` paths, images will be served from the NAS via the pod's volume mount at `/data/hotd-content`.

---

## DDB Raw JSON Avatar Fields

The `raw_json` column in `monsters` contains DDB API data with these image-related fields:

```json
{
  "avatarId": 350,
  "largeAvatarId": null,
  "id": 16907,
  "name": "Goblin"
}
```

The `avatarId` maps to a DDB CDN URL like:
```
https://www.dndbeyond.com/avatars/{path}/{avatarId}/{size}/{timestamp}.jpeg
```

The exact CDN URL construction requires the DDB avatar API or lookup table.

---

## Quick Validation After Sync

```bash
# Verify images exist on NAS
ls /mnt/nas/Gaming/ASSETS/DDB_CONTENT/hotd-website-content/images/monsters/ | wc -l
# Should be ~4141

# Verify DB URLs are updated
kubectl exec -n ai deploy/postgres-pgvector -- psql -U cortana -d dnd_website -c \
  "SELECT count(*) FROM monsters WHERE avatar_url LIKE '/hotd-content/%'"
# Should be 4141

# Test from website
curl -sI https://hotd.knoxrpg.com/hotd-content/images/monsters/16907.jpeg | head -3
# Should return 200
```
