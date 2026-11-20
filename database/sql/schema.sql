-- DarkTrace — PostgreSQL schema (SQL store)
-- ============================================================
-- Run:  psql "$DATABASE_URL" -f database/sql/schema.sql
--    or: python backend/db_utils.py init   (creates the first 3 tables only)
--    or: docker compose up (database/docker-compose.yml mounts this file
--          into the postgres container's /docker-entrypoint-initdb.d)
--
-- What lives here and why — see database/README.md §3. In short:
--   Postgres = relational, ACID data with foreign keys and a fixed shape.
--   The first three tables are copied VERBATIM from
--   backend/db_utils.py SCHEMA_SQL (and backend/main.py SQLAlchemy models)
--   so this file never drifts from the code that already uses them.
--   The tables after them are NEW, derived from the endpoints in
--   backend/main.py whose models were imported but never shipped
--   (app/models/investigation.py, app/schemas/investigation.py are
--   missing from the repo) — cases, investigations, evidence_records.
--
-- Deliberately NOT in this file (they live in MongoDB, database/nosql/):
--   threats, indicators, alerts, crawled_documents, activity_events,
--   siem_events, crawl_logs. See database/README.md §2 for why.
--   Consequence: backend/main.py's SQL `Alert` model should move to the
--   MongoDB `alerts` collection; a case's alerts are then found by
--   `alerts.case_id = cases.case_id` (plain string, no FK across stores).
--   The reporting endpoint (GET /api/v1/reports/cases/{case_id}) needs
--   one Mongo query for that — it cannot JOIN across databases.
--
-- Conventions (kept from db_utils.py):
--   users/source/crawl_job use human-readable TEXT ids (usr_001, src_001,
--   job_001) from sequences; cases/investigations/evidence use UUIDs,
--   because main.py already addresses them as uuid.UUID in the URL
--   (/investigator/cases/{case_id}, /evidence/{evidence_id}/url).

-- ---------------------------------------------------------- users
-- Login details live ONLY here. Never copy password_hash, email or
-- mfa state into MongoDB (user's rule: SQL-better data stays out of NoSQL).
CREATE TABLE IF NOT EXISTS users (
    usr_id        TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'analyst'
                  CHECK (role IN ('sysadmin','analyst','investigator',
                                  'supervisor','auditor','readonly')),
    mfa_enabled   BOOLEAN NOT NULL DEFAULT false,
    status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','disabled')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ---------------------------------------------------------- source
-- Dark-web source registry. crawl_policy / health are JSONB because
-- they are open-ended per source type — the one JSON-shaped exception
-- inside SQL, kept here because a source is always read with its policy.
CREATE TABLE IF NOT EXISTS source (
    source_id    TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    source_type  TEXT NOT NULL
                 CHECK (source_type IN ('onion_site','forum','marketplace',
                                        'paste','blog','i2p_site')),
    onion_addr   TEXT,
    auth_ref     TEXT NOT NULL,  -- legal authorization record — mandatory
    crawl_policy JSONB NOT NULL DEFAULT '{}',
    health       JSONB NOT NULL DEFAULT '{}',
    status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','paused','dead')),
    created_by   TEXT NOT NULL REFERENCES users(usr_id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_source_status ON source(status);

-- ---------------------------------------------------------- crawl_job
-- Crawl-job state machine: queued -> running -> done/failed/dead
-- (failed can be retried to queued). Enforced in backend/db_utils.py
-- (_JOB_TRANSITIONS) and backend/main.py; the CHECK below is the backstop.
-- Per-minute telemetry lives in MongoDB crawl_logs; only the final
-- stats object is kept here (stats JSONB).
CREATE TABLE IF NOT EXISTS crawl_job (
    job_id      TEXT PRIMARY KEY,
    intent_id   TEXT NOT NULL,  -- provenance root ID
    source_id   TEXT NOT NULL REFERENCES source(source_id),
    kind        TEXT NOT NULL
                CHECK (kind IN ('scheduled','incremental','manual')),
    state       TEXT NOT NULL DEFAULT 'queued'
                CHECK (state IN ('queued','running','done','failed','dead')),
    attempt     INT NOT NULL DEFAULT 0,
    stats       JSONB NOT NULL DEFAULT '{}',
    error       TEXT,
    started_at  TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_crawl_job_source ON crawl_job(source_id);
CREATE INDEX IF NOT EXISTS idx_crawl_job_state  ON crawl_job(state);

CREATE SEQUENCE IF NOT EXISTS usr_id_seq;
CREATE SEQUENCE IF NOT EXISTS src_id_seq;
CREATE SEQUENCE IF NOT EXISTS job_id_seq;

-- ============================================================
-- NEW tables (were referenced by backend/main.py, never created)
-- ============================================================

-- ---------------------------------------------------------- cases
-- POST/GET /api/v1/investigator/cases, GET /api/v1/dashboard/summary
-- (total_cases / open_cases). A case groups investigations + alerts.
-- Alerts themselves are MongoDB documents with case_id = this id.
CREATE TABLE IF NOT EXISTS cases (
    case_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','investigating','closed','archived')),
    created_by  TEXT NOT NULL REFERENCES users(usr_id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_created_by ON cases(created_by);

-- ---------------------------------------------------------- investigations
-- POST /api/v1/investigator/investigations, cross-source search
-- (GET /api/v1/investigator/investigations/{id}/search runs the query
-- against Elasticsearch + Neo4j). findings_summary is filled in by the
-- investigator; the raw hits are NOT stored here — they live in
-- MongoDB crawled_documents / Elasticsearch.
CREATE TABLE IF NOT EXISTS investigations (
    investigation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id          UUID NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    query            TEXT NOT NULL,
    findings_summary TEXT,
    created_by       TEXT NOT NULL REFERENCES users(usr_id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_investigations_case ON investigations(case_id);

-- ---------------------------------------------------------- evidence_records
-- POST /api/v1/evidence/investigations/{id}/upload,
-- GET /api/v1/evidence/{id}/url, blockchain anchor/verify endpoints.
-- Only the POINTER + hash live here (chain of custody needs ACID + FKs);
-- the file bytes live in MinIO/S3 under object_key, never in the DB.
CREATE TABLE IF NOT EXISTS evidence_records (
    evidence_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investigation_id UUID NOT NULL REFERENCES investigations(investigation_id) ON DELETE CASCADE,
    object_key       TEXT NOT NULL,  -- MinIO/S3 key, e.g. {investigation_id}/{uuid}_{filename}
    sha256_hash      TEXT NOT NULL,
    blockchain_status TEXT NOT NULL DEFAULT 'not_anchored'
                     CHECK (blockchain_status IN ('not_anchored','anchored','verified','failed')),
    created_by       TEXT NOT NULL REFERENCES users(usr_id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evidence_investigation ON evidence_records(investigation_id);
CREATE INDEX IF NOT EXISTS idx_evidence_sha256 ON evidence_records(sha256_hash);

-- ---------------------------------------------------------- revoked_tokens
-- JWT revocation. Today backend/app/core/security.py keeps revoked JTIs
-- in an in-memory set (_revoked_jti) — lost on every restart, and
-- backend/JWT_README.md flags shared revocation storage as missing for
-- production. One row per revoked token; check jti here in decode_token.
-- Rows are deletable once expires_at passes (see cleanup note below).
CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti         TEXT PRIMARY KEY,
    usr_id      TEXT NOT NULL REFERENCES users(usr_id),
    token_type  TEXT NOT NULL CHECK (token_type IN ('access','refresh')),
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens(expires_at);
-- Cleanup (run daily): DELETE FROM revoked_tokens WHERE expires_at < now();

-- ---------------------------------------------------------- audit_log
-- Append-only record of who did what (admin changes, source/job
-- changes, evidence uploads). SQL, not Mongo, because it must be
-- tamper-evident and joinable to users. Never UPDATE or DELETE rows.
CREATE TABLE IF NOT EXISTS audit_log (
    audit_id    BIGSERIAL PRIMARY KEY,
    actor_id    TEXT NOT NULL REFERENCES users(usr_id),
    action      TEXT NOT NULL,  -- e.g. 'user.role_changed', 'source.created'
    entity_type TEXT NOT NULL,  -- e.g. 'user', 'source', 'crawl_job', 'case'
    entity_id   TEXT NOT NULL,
    details     JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
