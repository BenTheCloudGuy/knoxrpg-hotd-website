const { pgPool } = require("./pool");

async function ensureSessionsTable() {
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid         TEXT        PRIMARY KEY,
        user_id     INTEGER     NOT NULL REFERENCES account_info(id) ON DELETE CASCADE,
        username    TEXT        NOT NULL,
        role        TEXT        NOT NULL,
        first_name  TEXT        NOT NULL,
        last_name   TEXT        NOT NULL,
        email       TEXT        NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at  TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions (user_id);
    `);
    await pgPool.query("DELETE FROM sessions WHERE expires_at < NOW()");
    console.log("  sessions table: ready");
  } catch (err) {
    console.warn("  WARN: Could not ensure sessions table:", err.message);
  }
}

async function ensureHotdTables() {
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS hotd_config (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS hotd_calendar_events (
        id           SERIAL PRIMARY KEY,
        day          INTEGER NOT NULL CHECK (day >= 1 AND day <= 30),
        month_idx    INTEGER NOT NULL CHECK (month_idx >= 1 AND month_idx <= 12),
        title        TEXT NOT NULL,
        description  TEXT DEFAULT '',
        session_refs TEXT DEFAULT '',
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_hotd_cal_month ON hotd_calendar_events (month_idx);
      CREATE TABLE IF NOT EXISTS hotd_npcs (
        id            SERIAL PRIMARY KEY,
        npcid         INTEGER UNIQUE,
        name          TEXT NOT NULL,
        race          TEXT DEFAULT '',
        npc_class     TEXT DEFAULT '',
        location      TEXT DEFAULT '',
        status        TEXT DEFAULT 'Unknown',
        alignment_tag TEXT DEFAULT 'neutral',
        portrait_url  TEXT DEFAULT '',
        description   TEXT DEFAULT '',
        dm_notes      TEXT DEFAULT '',
        associations  JSONB DEFAULT '[]',
        sort_order    INTEGER DEFAULT 0,
        is_hidden     BOOLEAN DEFAULT TRUE,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS hotd_sessions (
        id             SERIAL PRIMARY KEY,
        session_number INTEGER NOT NULL UNIQUE,
        title          TEXT NOT NULL,
        summary        TEXT DEFAULT '',
        game_date      TEXT DEFAULT '',
        play_date      TIMESTAMPTZ DEFAULT NULL,
        created_at     TIMESTAMPTZ DEFAULT NOW()
      );
      -- backfill: add play_date if missing (idempotent)
      ALTER TABLE hotd_sessions ADD COLUMN IF NOT EXISTS play_date TIMESTAMPTZ DEFAULT NULL;
      -- DM workflow columns: full editor markdown blob, publish gating, and
      -- generated PDF tracking. The single markdown column is the source of
      -- truth for the editor; the existing summary column is the
      -- player-facing snapshot written by the Publish action.
      ALTER TABLE hotd_sessions ADD COLUMN IF NOT EXISTS markdown TEXT DEFAULT '';
      ALTER TABLE hotd_sessions ADD COLUMN IF NOT EXISTS published BOOLEAN DEFAULT FALSE;
      ALTER TABLE hotd_sessions ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT NULL;
      ALTER TABLE hotd_sessions ADD COLUMN IF NOT EXISTS pdf_path TEXT DEFAULT '';
      ALTER TABLE hotd_sessions ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ DEFAULT NULL;
      ALTER TABLE hotd_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
      -- One-time seed: pre-existing rows with no markdown but a non-empty
      -- summary get a starter markdown blob so the new editor has content to
      -- open. Treats legacy summaries as already-published.
      UPDATE hotd_sessions
         SET markdown = '# Session Summary' || E'\n\n' || summary
       WHERE (markdown IS NULL OR markdown = '')
         AND summary IS NOT NULL
         AND summary <> '';
      UPDATE hotd_sessions
         SET published = TRUE, published_at = COALESCE(published_at, NOW())
       WHERE published = FALSE
         AND summary IS NOT NULL
         AND summary <> '';
      CREATE TABLE IF NOT EXISTS hotd_artifacts (
        id           SERIAL PRIMARY KEY,
        name         TEXT NOT NULL,
        rarity       TEXT DEFAULT 'Unknown',
        image_url    TEXT DEFAULT '',
        description  TEXT DEFAULT '',
        lore         TEXT DEFAULT '',
        is_legendary BOOLEAN DEFAULT false,
        owner        TEXT DEFAULT '',
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS hotd_handouts (
        id          SERIAL PRIMARY KEY,
        name        TEXT NOT NULL,
        image_url   TEXT DEFAULT '',
        description TEXT DEFAULT '',
        about       TEXT DEFAULT '',
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS hotd_maps (
        id          SERIAL PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT DEFAULT '',
        image_url   TEXT NOT NULL,
        sort_order  INTEGER DEFAULT 0,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS hotd_art (
        id          SERIAL PRIMARY KEY,
        title       TEXT DEFAULT '',
        image_url   TEXT NOT NULL,
        description TEXT DEFAULT '',
        sort_order  INTEGER DEFAULT 0,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS hotd_player_characters (
        id              SERIAL PRIMARY KEY,
        ddb_character_id BIGINT UNIQUE,
        player_name     TEXT DEFAULT '',
        character_name  TEXT NOT NULL,
        level           INTEGER DEFAULT 1,
        race            TEXT DEFAULT '',
        class_summary   TEXT DEFAULT '',
        subclass        TEXT DEFAULT '',
        avatar_url      TEXT DEFAULT '',
        hit_points      INTEGER DEFAULT 0,
        max_hit_points  INTEGER DEFAULT 0,
        armor_class     INTEGER DEFAULT 10,
        speed           INTEGER DEFAULT 30,
        strength        INTEGER DEFAULT 10,
        dexterity       INTEGER DEFAULT 10,
        constitution    INTEGER DEFAULT 10,
        intelligence    INTEGER DEFAULT 10,
        wisdom          INTEGER DEFAULT 10,
        charisma        INTEGER DEFAULT 10,
        proficiency_bonus INTEGER DEFAULT 2,
        skills          JSONB DEFAULT '[]',
        equipment       JSONB DEFAULT '[]',
        spells          JSONB DEFAULT '[]',
        features        JSONB DEFAULT '[]',
        classes_detail  JSONB DEFAULT '[]',
        saving_throws   JSONB DEFAULT '[]',
        background      TEXT DEFAULT '',
        alignment       TEXT DEFAULT '',
        initiative      INTEGER DEFAULT 0,
        passive_perception INTEGER DEFAULT 10,
        passive_investigation INTEGER DEFAULT 10,
        passive_insight  INTEGER DEFAULT 10,
        senses          TEXT DEFAULT '',
        armor_proficiencies TEXT DEFAULT '',
        weapon_proficiencies TEXT DEFAULT '',
        tool_proficiencies TEXT DEFAULT '',
        languages       TEXT DEFAULT '',
        attacks         JSONB DEFAULT '[]',
        defenses        TEXT DEFAULT '',
        conditions      TEXT DEFAULT '',
        temp_hit_points INTEGER DEFAULT 0,
        gender          TEXT DEFAULT '',
        faith           TEXT DEFAULT '',
        notes           TEXT DEFAULT '',
        backstory       TEXT DEFAULT '',
        personality_traits TEXT DEFAULT '',
        ideals          TEXT DEFAULT '',
        bonds           TEXT DEFAULT '',
        flaws           TEXT DEFAULT '',
        raw_json        JSONB DEFAULT '{}',
        updated_at      TIMESTAMPTZ DEFAULT NOW(),
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS hotd_character_journal (
        id              SERIAL PRIMARY KEY,
        character_id    INTEGER NOT NULL REFERENCES hotd_player_characters(id) ON DELETE CASCADE,
        user_id         INTEGER NOT NULL REFERENCES account_info(id) ON DELETE CASCADE,
        title           TEXT NOT NULL DEFAULT '',
        body            TEXT NOT NULL DEFAULT '',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_char_journal_char ON hotd_character_journal (character_id);
      CREATE INDEX IF NOT EXISTS idx_char_journal_user ON hotd_character_journal (user_id);
      CREATE TABLE IF NOT EXISTS hotd_character_access (
        id              SERIAL PRIMARY KEY,
        character_id    INTEGER NOT NULL REFERENCES hotd_player_characters(id) ON DELETE CASCADE,
        user_id         INTEGER NOT NULL REFERENCES account_info(id) ON DELETE CASCADE,
        can_update_ddb  BOOLEAN DEFAULT false,
        can_add_journal BOOLEAN DEFAULT false,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(character_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_char_access_char ON hotd_character_access (character_id);
      INSERT INTO hotd_config (key, value) VALUES ('current_month', '6') ON CONFLICT (key) DO NOTHING;
      INSERT INTO hotd_config (key, value) VALUES ('current_day', '21')  ON CONFLICT (key) DO NOTHING;
      INSERT INTO hotd_config (key, value) VALUES ('current_year', '1497') ON CONFLICT (key) DO NOTHING;
    `);
    // Seed maps if empty
    const mapCount = await pgPool.query("SELECT COUNT(*) AS cnt FROM hotd_maps");
    if (parseInt(mapCount.rows[0].cnt, 10) === 0) {
      await pgPool.query(`INSERT INTO hotd_maps (name, description, image_url, sort_order) VALUES
        ('Barovia',  'The dread domain of Strahd von Zarovich.',         '/images/maps/barovia_map.jpeg',        1),
        ('Faerûn',   'The modern map of the continent of Faerûn.',        '/images/maps/FaerunColorModernMap.jpg', 2)`);
      console.log("  HOTD maps: seeded");
    }
    // ── Adventure Journal table ──
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS hotd_adventure_journal (
        id           SERIAL PRIMARY KEY,
        actual_date  DATE NOT NULL,
        world_date   TEXT NOT NULL DEFAULT '',
        user_id      INTEGER NOT NULL REFERENCES account_info(id) ON DELETE CASCADE,
        author_name  TEXT NOT NULL DEFAULT '',
        body         TEXT NOT NULL DEFAULT '',
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_advj_date ON hotd_adventure_journal (actual_date DESC);
      CREATE INDEX IF NOT EXISTS idx_advj_user ON hotd_adventure_journal (user_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_advj_date_user ON hotd_adventure_journal (actual_date, user_id);
    `);

    // ── Map Markers table ──
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS hotd_map_markers (
        id           SERIAL PRIMARY KEY,
        marker_type  TEXT NOT NULL DEFAULT 'city',
        label        TEXT NOT NULL DEFAULT '',
        x            NUMERIC NOT NULL DEFAULT 0,
        y            NUMERIC NOT NULL DEFAULT 0,
        size         NUMERIC NOT NULL DEFAULT 54,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pgPool.query(`ALTER TABLE hotd_map_markers ADD COLUMN IF NOT EXISTS size NUMERIC NOT NULL DEFAULT 54`).catch(() => {});

    // Add backstory columns if they don't exist (for existing tables)
    const backstoryCols = [
      ["backstory", "TEXT DEFAULT ''"], ["personality_traits", "TEXT DEFAULT ''"],
      ["ideals", "TEXT DEFAULT ''"], ["bonds", "TEXT DEFAULT ''"], ["flaws", "TEXT DEFAULT ''"],
    ];
    for (const [col, typedef] of backstoryCols) {
      await pgPool.query(`ALTER TABLE hotd_player_characters ADD COLUMN IF NOT EXISTS ${col} ${typedef}`).catch(() => {});
    }

    // ── Embeddings table (pgvector) ──
    await pgPool.query(`CREATE EXTENSION IF NOT EXISTS vector`).catch(() => {});
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS hotd_embeddings (
        id            SERIAL PRIMARY KEY,
        source_type   TEXT NOT NULL,
        source_id     INTEGER,
        source_path   TEXT,
        chunk_index   INTEGER DEFAULT 0,
        title         TEXT DEFAULT '',
        chunk_text    TEXT NOT NULL,
        chunk_hash    TEXT NOT NULL,
        metadata      JSONB DEFAULT '{}',
        embedding     vector(1536),
        is_dm_only    BOOLEAN DEFAULT FALSE,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT hotd_embeddings_chunk_hash_key UNIQUE (chunk_hash)
      );
      CREATE INDEX IF NOT EXISTS idx_embed_source ON hotd_embeddings (source_type, source_id);
      CREATE INDEX IF NOT EXISTS idx_embed_hash ON hotd_embeddings (chunk_hash);
      CREATE INDEX IF NOT EXISTS idx_embed_dm ON hotd_embeddings (is_dm_only);
    `).catch(() => {});

    // ── DM Feature Tables ──
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS hotd_generated_images (
        id             SERIAL PRIMARY KEY,
        prompt         TEXT NOT NULL,
        revised_prompt TEXT,
        image_url      TEXT NOT NULL,
        thumbnail_url  TEXT,
        folder         TEXT DEFAULT 'Uncategorized',
        tags           TEXT[] DEFAULT ARRAY[]::TEXT[],
        size           TEXT DEFAULT '1024x1024',
        style          TEXT DEFAULT 'vivid',
        quality        TEXT DEFAULT 'hd',
        published_to   TEXT,
        created_at     TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS hotd_dm_story_elements (
        id               SERIAL PRIMARY KEY,
        element_type     TEXT NOT NULL,
        title            TEXT NOT NULL,
        content          TEXT NOT NULL,
        related_entities JSONB DEFAULT '[]',
        status           TEXT DEFAULT 'draft',
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS hotd_dm_conversations (
        id                 SERIAL PRIMARY KEY,
        title              TEXT NOT NULL,
        conversation_type  TEXT DEFAULT 'general',
        messages           JSONB DEFAULT '[]',
        context_refs       JSONB DEFAULT '[]',
        created_at         TIMESTAMPTZ DEFAULT NOW(),
        updated_at         TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS hotd_dm_files (
        id           SERIAL PRIMARY KEY,
        filename     TEXT NOT NULL,
        file_url     TEXT,
        file_type    TEXT DEFAULT 'text',
        content      TEXT DEFAULT '',
        is_indexed   BOOLEAN DEFAULT FALSE,
        folder       TEXT DEFAULT 'General',
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );
    `).catch(() => {});

    // Additional column migrations
    await pgPool.query("ALTER TABLE hotd_art ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General'").catch(() => {});
    await pgPool.query("ALTER TABLE hotd_generated_images ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT FALSE").catch(() => {});
    await pgPool.query("ALTER TABLE hotd_npcs ADD COLUMN IF NOT EXISTS dm_notes TEXT DEFAULT ''").catch(() => {});
    await pgPool.query("ALTER TABLE hotd_npcs ADD COLUMN IF NOT EXISTS npcid INTEGER UNIQUE").catch(() => {});
    await pgPool.query("ALTER TABLE hotd_npcs ADD COLUMN IF NOT EXISTS associations JSONB DEFAULT '[]'").catch(() => {});

    // ── Campaign Notes (Kanban) table ──
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS hotd_dm_notes (
        id          SERIAL PRIMARY KEY,
        title       TEXT NOT NULL,
        content     TEXT DEFAULT '',
        status      TEXT DEFAULT 'backlog',
        priority    TEXT DEFAULT 'medium',
        category    TEXT DEFAULT 'General',
        tags        TEXT[] DEFAULT ARRAY[]::TEXT[],
        sort_order  INTEGER DEFAULT 0,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `).catch(() => {});

    // ── Campaign Notebook (PostgreSQL-backed markdown pages) ──
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS hotd_notebook_pages (
        id          SERIAL PRIMARY KEY,
        path        TEXT NOT NULL UNIQUE,
        parent_path TEXT DEFAULT '',
        name        TEXT NOT NULL,
        type        TEXT NOT NULL DEFAULT 'file',
        content     TEXT DEFAULT '',
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_notebook_path ON hotd_notebook_pages (path);
      CREATE INDEX IF NOT EXISTS idx_notebook_parent ON hotd_notebook_pages (parent_path);
      CREATE INDEX IF NOT EXISTS idx_notebook_type ON hotd_notebook_pages (type);
    `).catch(() => {});

    // Seed DALL-E style prefix
    await pgPool.query("INSERT INTO hotd_config (key, value) VALUES ('dalle_style_prefix', 'Dark fantasy digital painting, dramatic chiaroscuro lighting, rich earth tones and deep crimsons, medieval Forgotten Realms aesthetic, highly detailed, cinematic composition, gothic atmosphere --') ON CONFLICT (key) DO NOTHING").catch(() => {});

    // ── Canon Audit ─────────────────────────────────────────────
    // Every canon write triggered by Publish is logged here so we have
    // provenance back to the source session and a path to rollback later.
    // The UNIQUE constraint makes the apply step idempotent: re-publishing
    // the same session does not double-apply the same change.
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS hotd_canon_audit (
        id              SERIAL PRIMARY KEY,
        session_id      INTEGER NOT NULL REFERENCES hotd_sessions(id) ON DELETE CASCADE,
        target_kind     TEXT NOT NULL,
        target_id       INTEGER,
        operation       TEXT NOT NULL,
        field           TEXT,
        before_value    TEXT,
        after_value     TEXT,
        source_excerpt  TEXT,
        rationale       TEXT,
        applied_at      TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT hotd_canon_audit_idem UNIQUE (session_id, target_kind, target_id, field, operation)
      );
      CREATE INDEX IF NOT EXISTS idx_canon_audit_session ON hotd_canon_audit (session_id);
      CREATE INDEX IF NOT EXISTS idx_canon_audit_target  ON hotd_canon_audit (target_kind, target_id);
    `).catch(() => {});

    console.log("  HOTD tables: ready");
  } catch (err) {
    console.warn("  WARN: Could not ensure HOTD tables:", err.message);
  }
}

module.exports = { ensureSessionsTable, ensureHotdTables };
