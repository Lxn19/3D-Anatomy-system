-- =============================================================================
-- schema.sql
-- 3D Anatomy Learning System — PostgreSQL Database Schema
--
-- Run this file against your database to create all required tables:
--   psql -U <your_user> -d anatomy_db -f database/schema.sql
--
-- Tables:
--   users           — registered learners
--   organs          — anatomical organs with metadata (synced with Unity scene)
--   quiz_questions  — multiple-choice questions linked to organs
--   user_progress   — per-user attempt history and scoring
--   refresh_tokens  — long-lived tokens for the JWT refresh mechanism
--
-- Changes from v1:
--   [FIX] users.id          renamed → user_id       (matches authRoutes.js)
--   [FIX] organs.id         renamed → organ_id      (matches organService.js)
--   [FIX] organs.interesting_fact renamed → fact     (matches organService.js)
--   [FIX] organs.unity_object_name renamed → unity_ref (matches organService.js)
--   [FIX] organs GIN index replaced with pg_trgm trigram index (ILIKE support)
--   [NEW] refresh_tokens table added (JWT refresh / revocation mechanism)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

-- pgcrypto provides gen_random_uuid() if you ever want UUID primary keys.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- pg_trgm enables trigram-based GIN indexes, which PostgreSQL uses to
-- accelerate ILIKE '%partial%' queries. WITHOUT this, ILIKE always does
-- a full sequential scan regardless of any other index type.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ---------------------------------------------------------------------------
-- USERS
-- Stores registered learners. Passwords are stored as bcrypt hashes —
-- the plain-text password is NEVER written to this table.
-- Primary key column: user_id (matches authRoutes.js and JWT payload).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
    user_id         SERIAL          PRIMARY KEY,              -- [FIX] was: id
    username        VARCHAR(50)     NOT NULL UNIQUE,
    email           VARCHAR(255)    NOT NULL UNIQUE,
    password_hash   VARCHAR(255)    NOT NULL,
    avatar_url      TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Speeds up login lookups by email (most common auth query).
CREATE INDEX IF NOT EXISTS idx_users_email    ON users (email);
-- Speeds up profile lookups by username.
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);

-- ---------------------------------------------------------------------------
-- ORGANS
-- Single source of truth for every anatomical organ in the system.
-- The unity_ref column is the EXACT value passed to Unity's
-- SearchManager.FocusOnOrgan() — owned by Member 1 (Unity team).
-- Primary key column: organ_id (matches organService.js and FK references).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organs (
    organ_id    SERIAL          PRIMARY KEY,              -- [FIX] was: id
    name        VARCHAR(100)    NOT NULL UNIQUE,          -- Display name, e.g. "Left Femur"
    system      VARCHAR(50)     NOT NULL,                 -- 'Skeletal' | 'Muscular' | 'Nervous' | 'Circulatory'
    description TEXT,
    fact        TEXT,                                     -- [FIX] was: interesting_fact
    unity_ref   VARCHAR(100),                             -- [FIX] was: unity_object_name
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- [FIX] Trigram GIN index on name — the ONLY index type PostgreSQL uses
-- to accelerate ILIKE '%partial%' queries. The previous to_tsvector GIN
-- index only helped @@ (full-text) operators, not ILIKE.
-- Requires: CREATE EXTENSION pg_trgm (see above).
CREATE INDEX IF NOT EXISTS idx_organs_name_trgm ON organs USING gin (name gin_trgm_ops);

-- B-tree index on system for the exact-match system filter.
CREATE INDEX IF NOT EXISTS idx_organs_system ON organs (system);

-- ---------------------------------------------------------------------------
-- QUIZ_QUESTIONS
-- Multiple-choice questions. Each question is linked to exactly one organ.
-- Foreign key references organs (organ_id) — updated to match renamed PK.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS quiz_questions (
    question_id     SERIAL          PRIMARY KEY,
    organ_id        INTEGER         NOT NULL REFERENCES organs (organ_id) ON DELETE CASCADE,  -- [FIX] ref was organs(id)
    question_text   TEXT            NOT NULL,
    correct_answer  VARCHAR(1)      NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
    option_a        VARCHAR(500)    NOT NULL,
    option_b        VARCHAR(500)    NOT NULL,
    option_c        VARCHAR(500)    NOT NULL,
    option_d        VARCHAR(500)    NOT NULL,
    difficulty      VARCHAR(10)     NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_organ_id ON quiz_questions (organ_id);

-- ---------------------------------------------------------------------------
-- USER_PROGRESS
-- Records every quiz attempt a user makes, enabling scoring and analytics.
-- Foreign key references users (user_id) — updated to match renamed PK.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_progress (
    progress_id         SERIAL      PRIMARY KEY,
    user_id             INTEGER     NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,          -- [FIX] ref was users(id)
    quiz_question_id    INTEGER     NOT NULL REFERENCES quiz_questions (question_id) ON DELETE CASCADE,
    selected_answer     VARCHAR(1)  NOT NULL CHECK (selected_answer IN ('A','B','C','D')),
    is_correct          BOOLEAN     NOT NULL,
    attempted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_progress_user_id     ON user_progress (user_id);
CREATE INDEX IF NOT EXISTS idx_progress_question_id ON user_progress (quiz_question_id);

-- ---------------------------------------------------------------------------
-- REFRESH_TOKENS                                                      [NEW]
-- Stores hashes of long-lived refresh tokens for the JWT refresh mechanism.
--
-- Security model:
--   • The raw token is returned to the client and stored (e.g. in localStorage
--     or an httpOnly cookie).
--   • Only the SHA-256 HASH of the token is stored here — if the database is
--     ever compromised, raw tokens cannot be extracted.
--   • On /api/auth/refresh, the incoming raw token is hashed and looked up.
--   • On /api/auth/logout, the row is deleted — immediately revoking access.
--   • Expired rows can be purged with:
--       DELETE FROM refresh_tokens WHERE expires_at < NOW();
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_id    SERIAL          PRIMARY KEY,
    user_id     INTEGER         NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    token_hash  TEXT            NOT NULL UNIQUE,   -- SHA-256 hex hash of the raw token
    expires_at  TIMESTAMPTZ     NOT NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Speeds up token lookup by hash (called on every /refresh request).
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash    ON refresh_tokens (token_hash);
-- Speeds up "logout all devices for user" queries.
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);

-- ---------------------------------------------------------------------------
-- Auto-update updated_at on users (trigger function)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_users_updated_at ON users;
CREATE TRIGGER set_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();
