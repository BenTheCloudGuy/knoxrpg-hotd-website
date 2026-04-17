-- =============================================================================
-- Dev container bootstrap for dnd_website
-- Mirrors the cortana/prod schema baseline
-- =============================================================================

-- Enable pgvector extension (required for RAG embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- ── account_info table (exists on cortana, referenced by FKs in schema.js) ──
CREATE TABLE IF NOT EXISTS account_info (
  id             SERIAL PRIMARY KEY,
  first_name     TEXT NOT NULL DEFAULT '',
  last_name      TEXT NOT NULL DEFAULT '',
  email          TEXT NOT NULL UNIQUE,
  username       TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'user',
  is_approved    BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Seed a default admin account (password: "admin")
-- bcryptjs hash of "admin" — change after first login
INSERT INTO account_info (first_name, last_name, email, username, password_hash, role, is_approved)
VALUES ('Dev', 'Admin', 'admin@localhost', 'admin',
        '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        'admin', true)
ON CONFLICT (username) DO NOTHING;
