// DarkTrace — MongoDB init script (NoSQL store)
// Run:  mongosh "mongodb://localhost:27017/darktrace" --file database/nosql/init-mongo.js
//    or automatically on first `docker compose up` (mounted to /docker-entrypoint-initdb.d,
//    see database/docker-compose.yml — it only runs on an empty data volume).
//
// What lives here and why — see database/README.md §2. In short:
//   MongoDB = high-volume, variable-shape, append-mostly data
//   (threats, indicators, alerts, crawled documents, activity feed,
//    SIEM webhook payloads, crawl telemetry).
//   Postgres = relational, ACID data (users/logins, sources, crawl jobs,
//   cases, investigations, evidence) — see database/sql/schema.sql.
//   NOTHING in here duplicates the SQL tables: no users, no password hashes,
//   no sessions/tokens, no source registry, no crawl-job state machine.
//
// Enums below are copied from the code, not invented:
//   severity  — backend/dev_server.py AlertPayload + frontend/src/mock-data/threats.json
//   category  — frontend/src/mock-data/threats.json (6 values)
//   ioc type  — frontend/src/mock-data/threats.json (domain/ip/hash/url/email)
//   job kind/state — backend/db_utils.py (kept in SQL; referenced here only as strings)

const dbName = "darktrace";
const db = db.getSiblingDB(dbName);

function ensureCollection(name, validator, indexes) {
  const existing = db.getCollectionNames().includes(name);
  if (!existing) {
    db.createCollection(name, { validator: { $jsonSchema: validator }, validationLevel: "moderate" });
    print(`created collection: ${name}`);
  } else {
    db.runCommand({ collMod: name, validator: { $jsonSchema: validator }, validationLevel: "moderate" });
    print(`updated validator: ${name}`);
  }
  for (const idx of indexes) {
    db.getCollection(name).createIndex(idx.keys, idx.opts || {});
  }
}

const SEVERITY = ["critical", "high", "medium", "low"];
const CATEGORY = ["ransomware", "credential-theft", "phishing", "malware", "data-leak", "exploit"];
const IOC_TYPE = ["domain", "ip", "hash", "url", "email"];
const ISO_DATE = { bsonType: "date", description: "ISO date — store as Date, not string" };

// ---------------------------------------------------------------- threats
// One document per threat found by the crawler / intel feed.
// Source: frontend/src/mock-data/threats.json (40 rows, thr-001..thr-040).
// Why a document, not rows: indicators + tags are variable-length arrays,
// enrichment is an open-ended object, and a threat is always read whole
// (ThreatIntelligence card) — no joins needed at read time.
ensureCollection("threats", {
  bsonType: "object",
  required: ["threat_id", "title", "severity", "category", "status", "source", "detected_at"],
  properties: {
    threat_id: { bsonType: "string", description: "thr-001 — also used as _id" },
    title: { bsonType: "string", minLength: 1 },
    severity: { enum: SEVERITY },
    category: { enum: CATEGORY },
    status: { enum: ["active", "triaged", "contained", "closed", "false_positive"] },
    confidence: { bsonType: "int", minimum: 0, maximum: 100 },
    description: { bsonType: "string" },
    tags: { bsonType: "array", items: { bsonType: "string" } },
    // Denormalised snapshot of the source at detection time. The source
    // registry itself lives in Postgres (source table); only id+name are
    // copied here so a threat card never needs a cross-database join.
    source: {
      bsonType: "object",
      required: ["source_id", "name"],
      properties: { source_id: { bsonType: "string" }, name: { bsonType: "string" } },
    },
    indicators: {
      bsonType: "array",
      items: {
        bsonType: "object",
        required: ["type", "value"],
        properties: { type: { enum: IOC_TYPE }, value: { bsonType: "string", minLength: 1 } },
      },
    },
    detected_at: ISO_DATE,
    first_seen: ISO_DATE,
    last_seen: ISO_DATE,
    created_at: ISO_DATE,
    updated_at: ISO_DATE,
    // Cross-store references are plain strings, never DBRefs / FKs:
    // case_id -> Postgres cases.case_id, assigned_to -> Postgres users.usr_id
    case_id: { bsonType: ["string", "null"] },
    assigned_to: { bsonType: ["string", "null"] },
    enrichment: { bsonType: "object", description: "open-ended: VT/MITRE/etc, added later" },
  },
}, [
  { keys: { severity: 1, detected_at: -1 } },          // Threat Intel list / filters
  { keys: { category: 1, detected_at: -1 } },
  { keys: { "source.source_id": 1, detected_at: -1 } },
  { keys: { status: 1, detected_at: -1 } },
  { keys: { case_id: 1 } },                            // case -> its threats
  { keys: { tags: 1 } },
  { keys: { "indicators.value": 1 } },                 // "where else was this IOC seen?"
  { keys: { title: "text", description: "text" } },   // free-text search
]);

// ------------------------------------------------------------- indicators
// Canonical, de-duplicated IOC registry. One document per (type, value).
// A threat embeds its indicators for fast reads; this collection is the
// lookup side ("this hash — how many threats, first/last seen?").
// Seed: generated from threats.json — 40 unique IOCs, 0 duplicates.
ensureCollection("indicators", {
  bsonType: "object",
  required: ["type", "value", "status", "first_seen"],
  properties: {
    type: { enum: IOC_TYPE },
    value: { bsonType: "string", minLength: 1 },
    threat_ids: { bsonType: "array", items: { bsonType: "string" } },
    categories: { bsonType: "array", items: { enum: CATEGORY } },
    sightings: { bsonType: "int", minimum: 1 },
    confidence: { bsonType: "int", minimum: 0, maximum: 100 },
    status: { enum: ["active", "blocked", "expired", "false_positive"] },
    first_seen: ISO_DATE,
    last_seen: ISO_DATE,
    created_at: ISO_DATE,
    updated_at: ISO_DATE,
  },
}, [
  { keys: { type: 1, value: 1 }, opts: { unique: true, name: "uniq_indicator" } },
  { keys: { threat_ids: 1 } },
  { keys: { status: 1, last_seen: -1 } },
]);

// ----------------------------------------------------------------- alerts
// Shape: backend/dev_server.py AlertPayload (title, severity, ioc, type,
// source, description) + prod Alert in backend/main.py (case_id,
// sent_to_siem for high/critical). Today alerts live in Redis
// (darktrace:alerts list, dev_server.py) — volatile. This collection is
// their durable home; Redis can go back to being a pub/sub + cache layer.
// A case's alerts are found by case_id (string ref to Postgres cases).
ensureCollection("alerts", {
  bsonType: "object",
  required: ["alert_id", "title", "severity", "status", "created_at"],
  properties: {
    alert_id: { bsonType: "string" },
    title: { bsonType: "string", minLength: 1 },
    severity: { enum: SEVERITY },
    type: { bsonType: "string", description: "category, e.g. ransomware" },
    ioc: { bsonType: ["string", "null"] },
    ioc_type: { enum: [...IOC_TYPE, null] },
    source: { bsonType: ["string", "null"] },
    description: { bsonType: "string" },
    status: { enum: ["active", "acknowledged", "resolved", "false_positive"] },
    threat_id: { bsonType: ["string", "null"] },
    case_id: { bsonType: ["string", "null"] },
    created_by: { bsonType: ["string", "null"], description: "users.usr_id (Postgres)" },
    sent_to_siem: { bsonType: "bool" },
    siem_forwarded_at: { bsonType: ["date", "null"] },
    created_at: ISO_DATE,
    updated_at: ISO_DATE,
  },
}, [
  { keys: { severity: 1, created_at: -1 } },
  { keys: { status: 1, created_at: -1 } },
  { keys: { threat_id: 1 } },
  { keys: { case_id: 1 } },
  { keys: { sent_to_siem: 1 } },
]);

// ------------------------------------------------------- crawled_documents
// Raw crawler output, straight from Module 2 ingestion
// (POST /api/v1/ingestion/document in backend/main.py — today it goes to
// Elasticsearch only, so the raw post is lost). Variable shape by source
// type (forum post / paste / marketplace listing), large free text, and
// extracted entities that later become Neo4j nodes — a document fits;
// a fixed table would need a new column per source type.
ensureCollection("crawled_documents", {
  bsonType: "object",
  required: ["doc_id", "job_id", "source", "url", "fetched_at"],
  properties: {
    doc_id: { bsonType: "string" },
    job_id: { bsonType: "string", description: "crawl_job.job_id (Postgres)" },
    source: {
      bsonType: "object",
      required: ["source_id", "name"],
      properties: {
        source_id: { bsonType: "string" },
        name: { bsonType: "string" },
        url: { bsonType: "string" },
      },
    },
    url: { bsonType: "string" },
    title: { bsonType: "string" },
    raw_text: { bsonType: "string", description: "unparsed body as fetched" },
    content_hash: { bsonType: ["string", "null"] },
    language: { bsonType: "string" },
    entities: {
      bsonType: "array",
      items: {
        bsonType: "object",
        properties: {
          label: { bsonType: "string" },
          value: { bsonType: "string" },
          type: { bsonType: "string" },
        },
      },
    },
    threat_ids: { bsonType: "array", items: { bsonType: "string" } },
    fetched_at: ISO_DATE,
    created_at: ISO_DATE,
  },
}, [
  { keys: { title: "text", raw_text: "text" } },       // mirrors the ES index
  { keys: { job_id: 1, fetched_at: -1 } },
  { keys: { "source.source_id": 1, fetched_at: -1 } },
  { keys: { content_hash: 1 } },
]);

// ---------------------------------------------------------- activity_events
// Append-only Command Center feed. Source: frontend/src/mock-data/activity.json
// (29 rows: time, level info/success/warn/error, severity, text).
// High write volume, never updated, queried only by recency — a capped
// TTL collection, not a relational table.
ensureCollection("activity_events", {
  bsonType: "object",
  required: ["timestamp", "level", "message"],
  properties: {
    timestamp: ISO_DATE,
    level: { enum: ["info", "success", "warn", "error"] },
    severity: { enum: ["system", "critical", "high", "medium", "low"] },
    message: { bsonType: "string" },
    actor: { bsonType: "string" },
    source: { bsonType: "string" },
    related: { bsonType: "object", description: "optional {threat_id, source_id, job_id}" },
    created_at: ISO_DATE,
  },
}, [
  { keys: { timestamp: -1 } },
  { keys: { level: 1, timestamp: -1 } },
  { keys: { severity: 1, timestamp: -1 } },
  // Retention: feed entries expire 180 days after their timestamp.
  { keys: { timestamp: 1 }, opts: { expireAfterSeconds: 15552000, name: "ttl_activity_180d" } },
]);

// ------------------------------------------------------------- siem_events
// Inbound SIEM webhook payloads (POST /api/v1/siem/webhook, backend/main.py).
// The endpoint today just returns the payload keys — nothing is stored.
// Payloads are vendor-defined and schemaless, so validation is deliberately
// loose here: only the envelope is enforced, `payload` stays free-form.
ensureCollection("siem_events", {
  bsonType: "object",
  required: ["received_at", "vendor", "payload"],
  properties: {
    received_at: ISO_DATE,
    vendor: { bsonType: "string" },
    event_type: { bsonType: "string" },
    payload: { bsonType: "object", description: "raw vendor JSON, as received" },
    processed: { bsonType: "bool" },
    alert_id: { bsonType: ["string", "null"], description: "alerts.alert_id once triaged" },
    created_at: ISO_DATE,
  },
}, [
  { keys: { received_at: -1 } },
  { keys: { processed: 1, received_at: -1 } },
  { keys: { event_type: 1, received_at: -1 } },
]);

// -------------------------------------------------------------- crawl_logs
// Per-run crawler telemetry (throughput, latency, Tor circuit, pages).
// Source: frontend/src/mock-data/crawlers.json + CrawlerContext.
// The crawl_job row (Postgres) holds the state machine + final stats;
// the per-minute telemetry that produces those stats is append-only
// time-series data and belongs here, not in a row that gets rewritten.
ensureCollection("crawl_logs", {
  bsonType: "object",
  required: ["job_id", "crawler_id", "logged_at"],
  properties: {
    job_id: { bsonType: "string" },
    crawler_id: { bsonType: "string" },
    crawler_name: { bsonType: "string" },
    source: {
      bsonType: "object",
      properties: {
        source_id: { bsonType: "string" },
        name: { bsonType: "string" },
        url: { bsonType: "string" },
      },
    },
    status: { enum: ["running", "paused", "stopped", "idle"] },
    pages_crawled: { bsonType: "int", minimum: 0 },
    pages_discovered: { bsonType: "int", minimum: 0 },
    progress_pct: { bsonType: "int", minimum: 0, maximum: 100 },
    throughput_per_min: { bsonType: "int", minimum: 0 },
    latency_ms: { bsonType: "int", minimum: 0 },
    tor_circuit: { bsonType: "string" },
    logged_at: ISO_DATE,
    created_at: ISO_DATE,
  },
}, [
  { keys: { job_id: 1, logged_at: -1 } },
  { keys: { crawler_id: 1, logged_at: -1 } },
  { keys: { logged_at: 1 }, opts: { expireAfterSeconds: 15552000, name: "ttl_crawl_logs_180d" } },
]);

print(`MongoDB init done for database "${dbName}". Collections:`);
print(db.getCollectionNames().join(", "));
