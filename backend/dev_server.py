"""DarkTrace development API — now backed by real databases.

This is the API the frontend runs against in development
(``uvicorn dev_server:app --reload --port 8000``). It used to keep
accounts, sessions, sources and jobs in memory and alerts in Redis,
so everything except alerts vanished on every restart. Since the
database integration it stores:

  PostgreSQL (``backend/db_utils.py``) — users (logins, roles),
  sources, crawl jobs, cases (counts) and revoked JWTs.
  MongoDB (``backend/app/services/mongo_store.py``,
  collections in ``database/nosql/``) — alerts and threats.

Redis is no longer used by this backend at all.

Setup (see also ``database/README.md`` and ``backend/.env.example``)::

    docker compose -f ../database/docker-compose.yml up -d   # postgres + mongo
    cp .env.example .env        # set DATABASE_URL, MONGO_URL, JWT_SECRET_KEY
    python -m database.nosql.seed   # optional: load the 124 Mongo seed docs
    uvicorn dev_server:app --reload --port 8000

Endpoints keep the shapes the frontend already uses (``frontend/src/api.js``),
plus the new threat endpoints:
  POST /api/v1/auth/register  POST /api/v1/auth/token
  POST /api/v1/auth/refresh   POST /api/v1/auth/logout
  GET  /api/v1/auth/me
  GET  /api/v1/alerts         POST /api/v1/alerts
  GET  /api/v1/threats        GET  /api/v1/threats/{threat_id}
  PATCH /api/v1/threats/{threat_id}
  GET  /api/v1/dashboard/summary
  GET  /api/v1/sources        POST /api/v1/sources
  GET  /api/v1/crawl-jobs     POST /api/v1/crawl-jobs

Auth is JWT (``backend/app/core/security.py``: scrypt passwords, 15-minute
access tokens, 7-day refresh tokens). The token subject is the username,
matching ``backend/app/api/v1/auth.py``. Revocation is durable: logout /
refresh writes the JTI to Postgres ``revoked_tokens`` (and to the
in-process set in ``security.py``), and every authenticated request
checks the table, so a revoked token stays revoked after a restart.

What is still NOT wired up here (see ``database/README.md`` §7):
the production ``backend/main.py`` (its ES / Neo4j / MinIO / SIEM /
blockchain services are missing from the repo), cases, investigations
and evidence endpoints, and SIEM forwarding (alerts only record
``sent_to_siem`` for high/critical).
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import parse_qs

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

import db_utils as db  # noqa: E402
from app.api.v1.auth import _issue as _issue_tokens  # noqa: E402  (same JWT stack)
from app.core.security import (  # noqa: E402
    ACCESS,
    REFRESH,
    TokenError,
    decode_token,
    hash_password,
    revoke_token as revoke_token_in_memory,
    verify_password,
)
from app.schemas.auth import RefreshRequest, RegisterRequest  # noqa: E402
from app.services import mongo_store  # noqa: E402
from app.services import user_store  # noqa: E402

DEV_SOURCE_ID = "src_dev_001"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast, like app/main_jwt_demo.py: a dev server that silently
    # runs without its databases is worse than one that refuses to start.
    await db.init_pool()
    await db.init_schema()
    await mongo_store.init_mongo_store()
    yield
    await mongo_store.close_mongo_store()
    await db.close_pool()


app = FastAPI(title="DarkTrace development API", version="0.2.0-dev", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------- auth


def _user_out(user: dict) -> dict:
    return {
        "usr_id": user["usr_id"],
        "username": user["username"],
        "email": user["email"],
        "role": user.get("role", "analyst"),
        "mfa_enabled": user.get("mfa_enabled", False),
        "status": user.get("status", "active"),
        "created_at": user["created_at"],
        "last_login_at": user.get("last_login_at"),
    }


async def _revoke_in_db(payload: dict, token_type: str) -> None:
    """Revoke one JWT durably (Postgres) and in-process (security.py)."""
    jti = payload.get("jti")
    username = payload.get("sub")
    exp = payload.get("exp")
    if not jti or not username or not exp:
        return
    user = await user_store.get_user(username)
    if not user:
        return
    expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
    await db.revoke_token(jti, user["usr_id"], token_type, expires_at)
    revoke_token_in_memory(jti)


async def _current_user(authorization: str = Header(default="")) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")
    try:
        payload = decode_token(authorization[len("Bearer "):], ACCESS)
    except TokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")
    # Durable revocation check — decode_token only knows the in-memory set.
    if await db.is_token_revoked(payload["jti"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")
    user = await user_store.get_user(payload["sub"])
    if not user or user["status"] != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")
    return user


async def _ensure_dev_source(created_by: str) -> None:
    """The frontend queues crawl jobs against one safe local source.
    Create it (once, owned by the first registered user) if the
    sources table is empty — e.g. a fresh database without seed.sql."""
    if await db.list_sources(limit=1):
        return
    try:
        await db.create_source(
            "Development source", "forum", "development-only", created_by,
            source_id=DEV_SOURCE_ID,
        )
    except db.DuplicateError:
        pass  # another request created it first


@app.get("/health", tags=["System"])
async def health() -> dict:
    pg = await db.health_check()
    mg = await mongo_store.mongo_health_check()
    return {
        "status": "ok" if pg["ok"] and mg["ok"] else "degraded",
        "service": "darktrace-development-api",
        "storage": {"postgres": pg, "mongodb": mg},
    }


@app.post("/api/v1/auth/register", status_code=status.HTTP_201_CREATED, tags=["Auth"])
async def register(payload: RegisterRequest) -> dict:
    try:
        user = await user_store.create_user(
            payload.username, payload.email, hash_password(payload.password)
        )
    except db.DuplicateError:
        raise HTTPException(status_code=409, detail="Username or email already exists")
    await _ensure_dev_source(user["usr_id"])
    return _user_out(user)


@app.post("/api/v1/auth/token", tags=["Auth"])
async def login(request: Request) -> dict:
    form = parse_qs((await request.body()).decode("utf-8"))
    username = form.get("username", [""])[0]
    password = form.get("password", [""])[0]
    user = await user_store.get_user(username)
    # Dummy hash keeps the timing the same whether the user exists or not.
    ok = verify_password(password, user["password_hash"] if user else "scrypt$AAAA$AAAA")
    if not user or not ok or user["status"] != "active":
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    await db.record_login(user["usr_id"])
    return _issue_tokens(user["username"]).model_dump()


@app.post("/api/v1/auth/refresh", tags=["Auth"])
async def refresh(body: RefreshRequest) -> dict:
    try:
        payload = decode_token(body.refresh_token, REFRESH)
    except TokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    if await db.is_token_revoked(payload["jti"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    # Rotation: the old refresh token is single-use.
    await _revoke_in_db(payload, "refresh")
    return _issue_tokens(payload["sub"]).model_dump()


@app.post("/api/v1/auth/logout", status_code=status.HTTP_204_NO_CONTENT, tags=["Auth"])
async def logout(
    body: RefreshRequest,
    authorization: str = Header(default=""),
) -> None:
    if authorization.startswith("Bearer "):
        try:
            await _revoke_in_db(decode_token(authorization[len("Bearer "):], ACCESS), "access")
        except TokenError:
            pass
    try:
        await _revoke_in_db(decode_token(body.refresh_token, REFRESH), "refresh")
    except TokenError:
        pass


@app.get("/api/v1/auth/me", tags=["Auth"])
async def me(user: dict = Depends(_current_user)) -> dict:
    return _user_out(user)


# ------------------------------------------------------------------- alerts


class AlertPayload(BaseModel):
    title: str = Field(min_length=1)
    severity: Literal["critical", "high", "medium", "low"] = "medium"
    ioc: str | None = None
    type: str | None = None
    source: str | None = None
    description: str | None = None


@app.get("/api/v1/alerts", tags=["Alerting"])
async def list_alerts(
    severity: str | None = None, _: dict = Depends(_current_user)
) -> list[dict]:
    if severity and severity not in ("critical", "high", "medium", "low"):
        raise HTTPException(status_code=422, detail="Invalid severity")
    return await mongo_store.list_alerts(severity=severity)


@app.post("/api/v1/alerts", status_code=status.HTTP_201_CREATED, tags=["Alerting"])
async def create_alert(payload: AlertPayload, user: dict = Depends(_current_user)) -> dict:
    return await mongo_store.create_alert(
        title=payload.title,
        severity=payload.severity,
        ioc=payload.ioc,
        type=payload.type,
        source=payload.source,
        description=payload.description,
        created_by=user["usr_id"],
    )


# ------------------------------------------------------------------ threats


class ThreatPatch(BaseModel):
    status: Literal["active", "triaged", "contained", "closed", "false_positive"] | None = None
    case_id: str | None = None
    assigned_to: str | None = None


@app.get("/api/v1/threats", tags=["Threat Intelligence"])
async def list_threats(
    severity: str | None = None,
    category: str | None = None,
    status_filter: str | None = None,
    source_id: str | None = None,
    q: str | None = None,
    limit: int = 100,
    offset: int = 0,
    _: dict = Depends(_current_user),
) -> list[dict]:
    return await mongo_store.list_threats(
        severity=severity, category=category, status=status_filter,
        source_id=source_id, q=q, limit=limit, offset=offset,
    )


@app.get("/api/v1/threats/{threat_id}", tags=["Threat Intelligence"])
async def get_threat(threat_id: str, _: dict = Depends(_current_user)) -> dict:
    threat = await mongo_store.get_threat(threat_id)
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    return threat


@app.patch("/api/v1/threats/{threat_id}", tags=["Threat Intelligence"])
async def patch_threat(
    threat_id: str, payload: ThreatPatch, _: dict = Depends(_current_user)
) -> dict:
    try:
        threat = await mongo_store.update_threat(
            threat_id, payload.model_dump(exclude_unset=True)
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if not threat:
        raise HTTPException(status_code=404, detail="Threat not found")
    return threat


# ---------------------------------------------------------------- dashboard


@app.get("/api/v1/dashboard/summary", tags=["Dashboard"])
async def dashboard_summary(_: dict = Depends(_current_user)) -> dict:
    cases = await db.count_cases()
    return {
        "total_cases": cases["total"],
        "open_cases": cases["open"],
        "alerts_by_severity": await mongo_store.alerts_by_severity(),
        "total_threats": await mongo_store.count_threats(),
    }


# ------------------------------------------------------------------ sources


class SourcePayload(BaseModel):
    name: str = Field(min_length=1)
    source_type: Literal["onion_site", "forum", "marketplace", "paste", "blog", "i2p_site"]
    onion_addr: str | None = None
    auth_ref: str = Field(min_length=1, description="Legal authorization record — mandatory")
    crawl_policy: dict = Field(default_factory=dict)
    health: dict = Field(default_factory=dict)


@app.get("/api/v1/sources", tags=["Sources"])
async def list_sources(
    status_filter: str | None = None, _: dict = Depends(_current_user)
) -> list[dict]:
    try:
        return await db.list_sources(status=status_filter)
    except db.InvalidValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@app.post("/api/v1/sources", status_code=status.HTTP_201_CREATED, tags=["Sources"])
async def create_source(payload: SourcePayload, user: dict = Depends(_current_user)) -> dict:
    try:
        return await db.create_source(
            payload.name, payload.source_type, payload.auth_ref, user["usr_id"],
            onion_addr=payload.onion_addr,
            crawl_policy=payload.crawl_policy,
            health=payload.health,
        )
    except db.InvalidValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# --------------------------------------------------------------- crawl jobs


class CrawlJobPayload(BaseModel):
    intent_id: str = Field(min_length=1)
    source_id: str
    kind: Literal["scheduled", "incremental", "manual"] = "manual"


@app.get("/api/v1/crawl-jobs", tags=["Crawl Jobs"])
async def list_crawl_jobs(
    state: str | None = None, _: dict = Depends(_current_user)
) -> list[dict]:
    try:
        return await db.list_crawl_jobs(state=state)
    except db.InvalidValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@app.post("/api/v1/crawl-jobs", status_code=status.HTTP_201_CREATED, tags=["Crawl Jobs"])
async def create_crawl_job(payload: CrawlJobPayload, _: dict = Depends(_current_user)) -> dict:
    source = await db.get_source(payload.source_id)
    if not source or source["status"] != "active":
        raise HTTPException(status_code=404, detail="Active source not found")
    try:
        return await db.create_crawl_job(payload.intent_id, payload.source_id, payload.kind)
    except db.ReferenceViolationError:
        raise HTTPException(status_code=404, detail="Active source not found")
    except db.InvalidValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
