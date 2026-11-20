-- DarkTrace — PostgreSQL seed data (development only)
-- ============================================================
-- Run AFTER schema.sql:  psql "$DATABASE_URL" -f database/sql/seed.sql
-- Idempotent (ON CONFLICT DO NOTHING) — safe to re-run.
--
-- Source data: frontend/src/mock-data/sources.json (12 sources) and
-- crawlers.json (4 crawlers -> 4 crawl jobs). All values are the repo's
-- fake demo data (.onion hosts starting with "demo", .example emails).
--
-- !!! SECURITY — READ FIRST !!!
-- The seeded user below has password_hash = 'CHANGE_ME_VIA_API'.
-- It CANNOT log in. Create a real password through the API instead:
--   POST /api/v1/auth/register  {"username":"admin","email":"...","password":"..."}
-- then update the seeded sources' created_by if you need a different owner.
-- Never put a real password hash in a seed file that gets committed.
--
-- Source-type mapping (SQL enum is narrower than the mock data):
--   mock "marketplace"   -> marketplace   (exact)
--   mock "forum"         -> forum         (exact)
--   mock "paste-site"    -> paste         (exact-ish)
--   mock "leak-site"     -> paste         (closest; original kept in crawl_policy.mock_type)
--   mock "chat-channel"  -> forum         (closest; original kept in crawl_policy.mock_type)
--   mock "offline"       -> paused        (not "dead": the source may come back)
-- If leak-site / chat-channel become first-class types, extend the CHECK
-- in schema.sql + backend/db_utils.py SOURCE_TYPES together — don't just
-- edit one of them.

BEGIN;

INSERT INTO users (usr_id, username, email, password_hash, role, mfa_enabled, status)
VALUES ('usr_001', 'admin', 'admin@example.com', 'CHANGE_ME_VIA_API', 'sysadmin', false, 'active')
ON CONFLICT (usr_id) DO NOTHING;

INSERT INTO source (source_id, name, source_type, onion_addr, auth_ref, crawl_policy, health, status, created_by) VALUES
('src_001', 'Hydra Market Relay',   'marketplace', 'http://demo01hugo274paf.onion', 'seed-dev-only', '{"mock_type":"marketplace"}',  '{"status":"online","pages_crawled":2535,"threats_found":1}', 'active', 'usr_001'),
('src_002', 'ShadowLeak Index',     'paste',       'http://demo02hsg4a7unzq.onion', 'seed-dev-only', '{"mock_type":"leak-site"}',    '{"status":"online","pages_crawled":5060,"threats_found":3}', 'active', 'usr_001'),
('src_003', 'TorBox Forums',        'forum',       'http://demo03wwyevfss5j.onion', 'seed-dev-only', '{"mock_type":"forum"}',        '{"status":"online","pages_crawled":5904,"threats_found":4}', 'active', 'usr_001'),
('src_004', 'BreachForums Mirror',  'forum',       'http://demo04tbxx53fz7h.onion', 'seed-dev-only', '{"mock_type":"forum"}',        '{"status":"online","pages_crawled":1686,"threats_found":3}', 'active', 'usr_001'),
('src_005', '0-Day Payload Hub',    'marketplace', 'http://demo0537zq26boid.onion', 'seed-dev-only', '{"mock_type":"marketplace"}',  '{"status":"online","pages_crawled":4217,"threats_found":5}', 'active', 'usr_001'),
('src_006', 'Onion Paste Archive',  'paste',       'http://demo06g36j6oh56q.onion', 'seed-dev-only', '{"mock_type":"paste-site"}',   '{"status":"online","pages_crawled":7591,"threats_found":8}', 'active', 'usr_001'),
('src_007', 'CryptoVault Exchange', 'marketplace', 'http://demo07zt6z3msrac.onion', 'seed-dev-only', '{"mock_type":"marketplace"}',  '{"status":"offline","pages_crawled":5060,"threats_found":0}', 'paused', 'usr_001'),
('src_008', 'Ghostpost Channel',    'forum',       'http://demo08j57xmq7573.onion', 'seed-dev-only', '{"mock_type":"chat-channel"}',  '{"status":"online","pages_crawled":5904,"threats_found":3}', 'active', 'usr_001'),
('src_009', 'DarkLedger Board',     'forum',       'http://demo09csu5g4q4l3.onion', 'seed-dev-only', '{"mock_type":"forum"}',        '{"status":"online","pages_crawled":2530,"threats_found":5}', 'active', 'usr_001'),
('src_010', 'Carder Row',           'marketplace', 'http://demo106er7xgm2j4.onion', 'seed-dev-only', '{"mock_type":"marketplace"}',  '{"status":"online","pages_crawled":4217,"threats_found":5}', 'active', 'usr_001'),
('src_011', 'Ransom Notice Wall',   'paste',       'http://demo11afa4fmphcr.onion', 'seed-dev-only', '{"mock_type":"leak-site"}',    '{"status":"online","pages_crawled":1686,"threats_found":3}', 'active', 'usr_001'),
('src_012', 'Underground Docs',     'paste',       'http://demo12wjau7io6is.onion', 'seed-dev-only', '{"mock_type":"paste-site"}',   '{"status":"offline","pages_crawled":2530,"threats_found":0}', 'paused', 'usr_001')
ON CONFLICT (source_id) DO NOTHING;

-- One queued manual job per crawler in crawlers.json (all fixtures are idle,
-- so the jobs start queued — nothing is actually crawled by seeding).
INSERT INTO crawl_job (job_id, intent_id, source_id, kind, state, attempt, stats, error) VALUES
('job_001', 'ci_seed_001', 'src_003', 'manual', 'queued', 0, '{"pages_crawled":18420,"pages_discovered":22400,"progress":72,"throughput_per_min":42,"latency_ms":168}', NULL),
('job_002', 'ci_seed_002', 'src_006', 'manual', 'queued', 0, '{"pages_crawled":14980,"pages_discovered":18000,"progress":45,"throughput_per_min":84,"latency_ms":199}', NULL),
('job_003', 'ci_seed_003', 'src_001', 'manual', 'queued', 0, '{"pages_crawled":9650,"pages_discovered":14200,"progress":31,"throughput_per_min":0,"latency_ms":190}', NULL),
('job_004', 'ci_seed_004', 'src_011', 'manual', 'queued', 0, '{"pages_crawled":5870,"pages_discovered":9000,"progress":0,"throughput_per_min":0,"latency_ms":160}', NULL)
ON CONFLICT (job_id) DO NOTHING;

-- One example case + investigation so the investigator endpoints have
-- something to list. Threats/alerts for this case live in MongoDB
-- (alerts.case_id = the case_id below) — see database/README.md §4.
-- The UUID is fixed here so the Mongo seed and the docs can reference it.
INSERT INTO cases (case_id, title, description, status, created_by) VALUES
('11111111-1111-4111-8111-111111111111', 'Seed case — ransomware builder chatter',
 'Example case seeded with the database. Linked threats: thr-001 (MongoDB threats collection).',
 'open', 'usr_001')
ON CONFLICT (case_id) DO NOTHING;

INSERT INTO investigations (investigation_id, case_id, query, findings_summary, created_by) VALUES
('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
 'ransomware builder', 'Seed investigation — no findings yet; run cross-source search to populate.',
 'usr_001')
ON CONFLICT (investigation_id) DO NOTHING;

-- Keep the id sequences past the seeded rows (same logic as
-- backend/db_utils.py sync_id_sequences).
SELECT setval('usr_id_seq', GREATEST((SELECT COALESCE(MAX(substring(usr_id FROM '^usr_([0-9]+)$')::bigint), 0) FROM users), 1), true);
SELECT setval('src_id_seq', GREATEST((SELECT COALESCE(MAX(substring(source_id FROM '^src_([0-9]+)$')::bigint), 0) FROM source), 1), true);
SELECT setval('job_id_seq', GREATEST((SELECT COALESCE(MAX(substring(job_id FROM '^job_([0-9]+)$')::bigint), 0) FROM crawl_job), 1), true);

COMMIT;
