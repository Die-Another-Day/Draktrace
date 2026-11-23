# DarkTrace development setup

This repository includes a minimal development API so the frontend can run without a crawler. It is backed by real databases: PostgreSQL stores users, sources, crawl jobs, cases and revoked JWTs; MongoDB stores alerts and threats. Everything survives API restarts. See `database/README.md` for the full data design.

## Requirements

- Node.js 18+
- Python 3.11+
- Docker (for PostgreSQL + MongoDB), or both databases running locally

## Run locally

Open two PowerShell terminals from the repository root.

### 1. Start the databases and the development API

```powershell
docker compose -f database/docker-compose.yml up -d
cd backend
Copy-Item .env.example .env
python -m pip install -r requirements-dev.txt
uvicorn dev_server:app --reload --port 8000
```

The development API reads `DATABASE_URL`, `MONGO_URL` and `JWT_SECRET_KEY` from `backend\.env` (fill in `JWT_SECRET_KEY` with 32+ random characters). It refuses to start if either database is unreachable.

Optional: load the MongoDB seed data (40 threats, 40 indicators, 6 alerts, …) before starting:

```powershell
python -m database.nosql.seed
```

Check that it is running:

```powershell
Invoke-RestMethod http://localhost:8000/health
```

### 2. Start the frontend

```powershell
cd frontend
npm ci
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), create an account, and sign in. The Vite development server automatically forwards `/api/*` requests to `http://localhost:8000`.

## What works in development

- Register, sign in, sign out, and session validation (JWT; logout revokes the token in Postgres, so it stays revoked after a restart)
- Dashboard reads for alerts, summary, sources, and crawl jobs
- Threat Intelligence reads threats from MongoDB (`GET /api/v1/threats`, triage with `PATCH /api/v1/threats/{threat_id}`)
- Crawler page queues jobs against one safe, local development source (created automatically for the first registered user)

Queued jobs remain in `queued` state. No URLs are fetched and no crawler is started.

## Deliberately not implemented

The production-oriented `backend/main.py` remains untouched and is not the local development entry point. It requires modules that are not present in this workspace.

Do **not** run `uvicorn main:app` for the minimal setup. Run `uvicorn dev_server:app` instead.

See [unimplimented.md](unimplimented.md) for every deferred module, where it will be used, the endpoints involved, and its expected inputs/outputs.

## Verify

```powershell
python -m py_compile backend\dev_server.py
cd frontend
npm run build
```

Run the integration tests against throwaway databases (see `backend/tests/test_dev_server.py` for the exact commands):

```powershell
$env:TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/darktrace_test"
$env:TEST_MONGO_URL="mongodb://localhost:27017"
$env:TEST_MONGO_DB="darktrace_test"
cd backend
python -m pytest tests/test_dev_server.py test_db_utils.py tests/test_auth_api.py -v
```
