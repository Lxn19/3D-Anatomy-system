-- =============================================================================
-- schema.sql — Unified Database Schema
-- 3D Anatomy Learning System — All Four Members
--
-- Run order matters: referenced tables must exist before referencing tables.
--   1. users, organs, quiz_questions (no FK dependencies)
--   2. refresh_tokens, user_progress, questions, chat_history (depend on users/organs)
--   3. question_options, quiz_sessions, session_answers (depend on questions)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- MEMBER 3 — Auth & Core Data
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
    user_id       SERIAL PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url    TEXT,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
);

-- Trigger: keep updated_at current on every UPDATE
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON users;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Refresh tokens (Member 3 — authRoutes.js)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_id   SERIAL PRIMARY KEY,
    user_id    INT  NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,   -- SHA-256 hex of raw token
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_token_hash ON refresh_tokens(token_hash);

-- Organs (Member 3 — organService.js, organRoutes.js)
-- NOTE: uses a `system` text column directly (NOT a separate organ_systems table).
-- Member 4's promptEngine.js was updated to reflect this.
CREATE TABLE IF NOT EXISTS organs (
    organ_id    SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    system      VARCHAR(50)  NOT NULL,   -- 'Skeletal'|'Muscular'|'Nervous'|'Circulatory'
    description TEXT,
    fact        TEXT,                    -- "interesting_fact" in Member 1; "fact" here
    unity_ref   VARCHAR(100),            -- Exact Unity GameObject name / SearchManager key
    created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_organs_system   ON organs(system);
CREATE INDEX IF NOT EXISTS idx_organs_name     ON organs(name);

-- ---------------------------------------------------------------------------
-- MEMBER 3 — User Progress
-- ---------------------------------------------------------------------------

-- quiz_questions referenced by user_progress must exist before user_progress.
-- Defined here without FK to questions to allow independent seeding order;
-- the FK to organs is present.
CREATE TABLE IF NOT EXISTS quiz_questions (
    question_id    SERIAL PRIMARY KEY,
    question_text  TEXT         NOT NULL,
    correct_answer CHAR(1)      NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
    difficulty     VARCHAR(10)  DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
    organ_id       INT          REFERENCES organs(organ_id) ON DELETE SET NULL,
    created_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_progress (
    progress_id      SERIAL PRIMARY KEY,
    user_id          INT  NOT NULL REFERENCES users(user_id)          ON DELETE CASCADE,
    quiz_question_id INT  NOT NULL REFERENCES quiz_questions(question_id) ON DELETE CASCADE,
    selected_answer  CHAR(1) NOT NULL CHECK (selected_answer IN ('A','B','C','D')),
    is_correct       BOOLEAN NOT NULL,
    attempted_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_progress_user ON user_progress(user_id);

-- ---------------------------------------------------------------------------
-- MEMBER 2 — Quiz Module
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS questions (
    id              SERIAL PRIMARY KEY,
    question_text   TEXT         NOT NULL,
    question_type   VARCHAR(30)  NOT NULL CHECK (question_type IN ('mcq','identify','clinical')),
    correct_answer  VARCHAR(255) NOT NULL,
    explanation     TEXT,
    organ_ref       VARCHAR(100),    -- matches OrganData.organName in Unity (Member 1)
    organ_id        INT REFERENCES organs(organ_id) ON DELETE SET NULL,   -- FK to organs table
    system_category VARCHAR(50),
    difficulty      VARCHAR(10)  DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS question_options (
    id           SERIAL PRIMARY KEY,
    question_id  INT  NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    option_text  VARCHAR(255) NOT NULL,
    option_label CHAR(1)      NOT NULL    -- 'A', 'B', 'C', 'D'
);

CREATE TABLE IF NOT EXISTS quiz_sessions (
    id               SERIAL PRIMARY KEY,
    user_id          INT  NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    score            INT  DEFAULT 0,
    total            INT  NOT NULL,
    percentage       NUMERIC(5,2),
    passed           BOOLEAN DEFAULT FALSE,
    started_at       TIMESTAMP DEFAULT NOW(),
    finished_at      TIMESTAMP,
    duration_seconds INT
);

CREATE TABLE IF NOT EXISTS session_answers (
    id           SERIAL PRIMARY KEY,
    session_id   INT NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
    question_id  INT NOT NULL REFERENCES questions(id),
    user_answer  VARCHAR(255),
    is_correct   BOOLEAN NOT NULL,
    time_taken_ms INT
);

-- Indexes for dashboard queries (Member 2)
CREATE INDEX IF NOT EXISTS idx_session_user    ON quiz_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_answer_session  ON session_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_question_type   ON questions(question_type);
CREATE INDEX IF NOT EXISTS idx_question_sys    ON questions(system_category);

-- ---------------------------------------------------------------------------
-- MEMBER 4 — AI Chat History
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat_history (
    id           SERIAL PRIMARY KEY,
    user_id      INT  NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    user_message TEXT NOT NULL,
    ai_response  TEXT NOT NULL,
    created_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_history(user_id);
