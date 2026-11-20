# DarkTrace — database

> **STATUS — NOT CONNECTED YET: the connection between the database and
> the backend is NOT done yet.** The schemas, seed data and client helpers
> in this folder are ready, but no backend code reads from or writes to
> MongoDB or Postgres through them yet — `backend/dev_server.py` still
> uses in-memory dicts + Redis, and `backend/main.py` still expects its
> (missing) SQLAlchemy models. Wiring the backend to these stores is a
> separate, still-open step (entry point: `database/nosql/mongo_client.py`
> next to `backend/db_utils.py` in the FastAPI lifespan).

Repo: https://github.com/Parth101025r/darktrace (cloned 2026-11-20, HEAD `7e33f99`).

DarkTrace had **no durable database for its actual product data**. What
existed before this folder:

| Before | Where | Problem |
|---|---|---|
| `users`, `source`, `crawl_job` | Postgres, `backend/db_utils.py` `SCHEMA_SQL` + `backend/main.py` | The only persistent tables. Correct — kept verbatim in `sql/schema.sql`. |
| Alerts | Redis list `darktrace:alerts`, `backend/dev_server.py` | Volatile list, no query, no status, no case link. |
| Accounts, sessions, sources, jobs (dev) | In-memory dicts, `backend/dev_server.py` | Cleared on every restart (says so in the root README). |
| Threats, sources, crawlers, activity, charts | JSON fixtures, `frontend/src/mock-data/*.json` | Frontend demo data, not a store. |
| Cases, investigations, evidence, alerts (prod) | Imported in `backend/main.py` from `app/models/investigation.py` etc. | **Those modules are not in the repo** — the prod backend cannot run as-is. |
| Crawled documents / entities / relationships | Elasticsearch + Neo4j, `backend/main.py` Settings | External services, no local schema in the repo. |
| JWT revocation | In-memory `set`, `backend/app/core/security.py` | Lost on restart; `backend/JWT_README.md` flags it as missing for production. |

This folder adds the missing piece, as **two stores, not one** — each
entity lives in exactly one primary store, chosen by its shape.

## 1. The rule used to split SQL vs NoSQL

| Put it in Postgres (SQL) when… | Put it in MongoDB (NoSQL) when… |
|---|---|
| It needs foreign keys, transactions, or a state machine (login, roles, job `queued → running → done/failed`) | Shape varies per row (forum post vs paste vs marketplace listing) |
| It is read by exact key and joined (user → source → job → case → investigation → evidence) | It is high-volume, append-mostly, and read whole (threat card, raw post, log line) |
| Losing a write would break custody or billing (evidence hash, audit) | It is a list/array inside the thing itself (tags, indicators, entities) |
| It is small and changes rarely (12 sources, a handful of users) | It grows unboundedly (crawls, activity feed, SIEM events) and old rows can expire (TTL) |

The user's example was right: **threat data is the NoSQL case**; **login
details are the SQL case** — `users.password_hash` appears nowhere in
`nosql/`.

## 2. NoSQL — MongoDB (`nosql/`)

Database `darktrace`. Schema enforced two ways: JSON Schema validators
in `init-mongo.js` (server-side) and Pydantic models in `models.py`
(app-side, same enums). Cross-store links are plain strings, never
DBRefs — there is no join across Postgres and MongoDB.

| Collection | One document is… | Why a document | Source in the repo |
|---|---|---|---|
| `threats` | One threat (`thr-001`) with embedded `source` snapshot, `indicators[]`, `tags[]` | Variable arrays + open `enrichment` object; always read whole for the Threat Intel card | `frontend/src/mock-data/threats.json` (40 rows) |
| `indicators` | One de-duplicated IOC (`type` + `value` unique) with `threat_ids[]`, `sightings` | "Where else was this hash seen?" is a lookup, not a join | Generated from threats.json — 40 unique, 0 duplicates |
| `alerts` | One alert (dev `AlertPayload` + prod `Alert`: `severity`, `ioc`, `type`, `case_id`, `sent_to_siem`) | High volume, status lifecycle, replaces the volatile Redis list | `backend/dev_server.py`, `backend/main.py` |
| `crawled_documents` | One raw crawled post/page as fetched, with extracted `entities[]` | Shape differs by source type; large free text; this is what Elasticsearch indexes | `POST /api/v1/ingestion/document`, `backend/main.py` |
| `activity_events` | One Command Center feed line (`level`, `severity`, `message`) | Append-only, queried by recency, TTL 180 days | `frontend/src/mock-data/activity.json` (29 rows) |
| `siem_events` | One inbound SIEM webhook payload, raw | Vendor-defined and schemaless — only the envelope is validated | `POST /api/v1/siem/webhook`, `backend/main.py` (today stores nothing) |
| `crawl_logs` | One telemetry sample (pages, throughput, latency, Tor circuit) | Time-series; the SQL `crawl_job` row keeps only the final `stats` | `frontend/src/mock-data/crawlers.json`, `CrawlerContext` |

What is **not** in MongoDB, on purpose: users / sessions / tokens,
the source registry, crawl-job state, cases, investigations, evidence
pointers, audit log (all SQL, §3); the Neo4j graph and the Elasticsearch
full-text index (separate services, §4).

Seed data (`nosql/seed_data/`, generated from the repo's own mock data,
not invented): 40 threats, 40 indicators, 6 alerts, 3 crawled documents,
29 activity events, 2 SIEM events, 4 crawl logs = **124 documents**.

## 3. SQL — PostgreSQL (`sql/`)

`sql/schema.sql` — run it with `psql "$DATABASE_URL" -f sql/schema.sql`.

| Table | Change | Why SQL |
|---|---|---|
| `users` | Kept verbatim from `db_utils.py` | Login, `password_hash` (scrypt), roles, status. Unique username/email. |
| `source` | Kept verbatim | Registry with FK `created_by → users`; `crawl_policy`/`health` stay JSONB (open-ended per source). |
| `crawl_job` | Kept verbatim | State machine + FK `source_id → source`; final `stats` JSONB. |
| `cases` | **New** — `case_id UUID`, `title`, `description`, `status open/investigating/closed/archived`, `created_by → users` | Prod endpoint existed, table didn't (`main.py` list/get/report + dashboard `total_cases`/`open_cases`). |
| `investigations` | **New** — `investigation_id UUID`, `case_id → cases`, `query`, `findings_summary` | Cross-source search (ES + Neo4j) needs a stored query per case. |
| `evidence_records` | **New** — `evidence_id UUID`, `investigation_id → investigations`, `object_key` (MinIO/S3), `sha256_hash`, `blockchain_status` | Chain of custody: file bytes in object storage, pointer + hash here under FK/ACID. |
| `revoked_tokens` | **New** — `jti PK`, `usr_id → users`, `token_type`, `expires_at` | Replaces the in-memory revoked-JTI set; shared across restarts/instances. Delete rows past `expires_at`. |
| `audit_log` | **New** — append-only, `actor_id → users`, `action`, `entity_type/id`, `details JSONB` | Who changed what; must be joinable to users and never updated. |

`sql/seed.sql` seeds 1 admin user (password `CHANGE_ME_VIA_API` — it
**cannot log in**; register through the API), the 12 mock sources, 4
queued crawl jobs, and 1 example case + investigation. Idempotent.

One mapping to know: the mock sources use types the SQL enum does not
have (`leak-site`, `chat-channel`). The seed maps them to the closest
SQL type (`paste` / `forum`) and keeps the original in
`crawl_policy.mock_type`. Extending the enum means changing `schema.sql`
**and** `backend/db_utils.py` `SOURCE_TYPES` together.

## 4. How the two stores link (and what stays elsewhere)

No cross-database foreign keys exist — the backend does two cheap
lookups instead. The link fields:

- `threats.case_id`, `alerts.case_id` → `cases.case_id` (Postgres)
- `threats.assigned_to`, `alerts.created_by` → `users.usr_id`
- `crawled_documents.job_id`, `crawl_logs.job_id` → `crawl_job.job_id`
- `threats.source.source_id`, `crawled_documents.source.source_id` → `source.source_id`

Example flows:

- **Threat → case:** analyst opens `thr-004` in Threat Intel, creates a
  case in Postgres, sets `threats.case_id`. The case report
  (`GET /api/v1/reports/cases/{id}`) reads the case + investigations from
  Postgres and its alerts/threats from MongoDB by `case_id`.
- **Crawl → document → search/graph:** crawler finishes a job (SQL state
  `done`, final `stats`), its raw posts land in `crawled_documents`
  (MongoDB), the same payload is indexed in Elasticsearch and its
  entities upserted in Neo4j — exactly the ingestion endpoints in
  `main.py`. MongoDB is the durable raw copy; ES/Neo4j are the query
  layers, not the store of record.
- **Alert → SIEM:** high/critical alerts set `sent_to_siem` on the MongoDB
  alert document; inbound SIEM events land raw in `siem_events` until
  triaged into an `alert_id`.
- **Dashboard numbers are computed, not stored:** `nosql/aggregations.py`
  has the pipelines for severity/category/time/source splits. Against the
  seed they reproduce `statistics.json` / `charts.json` exactly (40
  threats; critical 4, high 12, medium 15, low 9). `total_cases` /
  `open_cases` still come from Postgres.

## 5. Run it

```bash
# All three services (Postgres + MongoDB + Redis) — development only
cp database/.env.example database/.env   # then set real passwords
docker compose -f database/docker-compose.yml up -d

# MongoDB validators + indexes (also runs automatically on first `up`)
mongosh "mongodb://localhost:27017/darktrace" --file database/nosql/init-mongo.js

# MongoDB seed data (idempotent upserts; --validate-only needs no database)
pip install pymongo pydantic
python -m database.nosql.seed

# Postgres schema + seed (schema is also applied by docker compose on first start)
psql "$DATABASE_URL" -f database/sql/schema.sql
psql "$DATABASE_URL" -f database/sql/seed.sql
```

Backend wiring (not done here — the backend code was not changed):
`database/nosql/mongo_client.py` (`init_mongo()` / `mongo()` / `health_check()`)
mirrors `backend/db_utils.py` (`init_pool()` …) and is ready to be called
from the FastAPI lifespan next to it. `database/nosql/models.py` validates
payloads before insert.

## 6. Verify

```bash
python -m database.nosql.seed --validate-only   # 124 docs vs models.py, no DB
# MongoDB: db.threats.countDocuments() -> 40 ; db.indicators.countDocuments() -> 40
#          db.alerts.countDocuments() -> 6  ; db.activity_events.countDocuments() -> 29
# Postgres: SELECT count(*) FROM source; -> 12 ; SELECT count(*) FROM crawl_job; -> 4
#           SELECT count(*) FROM cases; -> 1  ; SELECT count(*) FROM users; -> 1
```

## 7. Open decisions / gaps found while doing this

1. **Prod `Alert` was SQL in `main.py`, now MongoDB.** If the team wants
   alerts in Postgres after all, delete the `alerts` collection and add
   the table back — but then the Redis dev alerts, the SIEM webhook
   payloads and the threat link all still favour MongoDB. The split above
   is the recommendation, not a silent change.
2. **`app/models/investigation.py`, `app/schemas/*`, `app/core/database.py`
   etc. are missing from the repo**, so `backend/main.py` cannot run.
   The `cases` / `investigations` / `evidence_records` tables here are
   derived from its endpoints and schemas; the model files still need to
   be written (or `main.py` trimmed to the dev server).
3. **Source-type enum is narrower than the frontend mock data**
   (`leak-site`, `chat-channel` have no SQL value) — see §3 mapping.
4. **Dev alerts are still Redis-only until the backend is wired to
   MongoDB.** `mongo_client.py` is the wiring point; `dev_server.py`
   was deliberately not edited in this task.
5. **No retention policy was set for `threats` / `alerts` / `indicators`.**
   Only the append-only feeds expire (TTL 180 days). Decide an
   archival rule before production volume arrives.

## 8. File map

```
database/
├── README.md                  # this file — decisions, mapping, runbook
├── docker-compose.yml         # postgres:16 + mongo:7 + redis:7 (dev only)
├── .env.example               # DATABASE_URL / MONGO_URL / REDIS_URL
├── nosql/
│   ├── init-mongo.js          # validators + indexes for 7 collections
│   ├── models.py              # Pydantic v2 mirror of init-mongo.js
│   ├── mongo_client.py        # Motor async client (mirrors db_utils.py)
│   ├── aggregations.py        # dashboard pipelines (replaces statistics/charts fixtures)
│   ├── seed.py                # idempotent upsert seeder (+ --validate-only)
│   └── seed_data/             # threats, indicators, alerts, crawled_documents,
│                              # activity_events, siem_events, crawl_logs (124 docs)
└── sql/
    ├── schema.sql             # Postgres: 3 kept tables + 5 new tables
    └── seed.sql               # 1 user, 12 sources, 4 jobs, 1 case + investigation
```
