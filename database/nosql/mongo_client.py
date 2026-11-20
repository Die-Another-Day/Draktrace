"""DarkTrace — async MongoDB client (Motor).

Companion to ``backend/db_utils.py`` (Postgres/asyncpg): same shape —
``init_client()`` once at startup, ``close_client()`` at shutdown,
helpers that return plain dicts. The FastAPI lifespan in ``main.py`` /
``dev_server.py`` can call ``init_mongo()`` next to ``init_pool()``.

Requires: ``pip install motor``.  Connection string comes from the
environment (``MONGO_URL``, see ``database/.env.example``) — never
hard-code credentials here.

Example (FastAPI lifespan)::

    from database.nosql.mongo_client import init_mongo, close_mongo, mongo

    @asynccontextmanager
    async def lifespan(app):
        await init_mongo()
        yield
        await close_mongo()

    # later, in an endpoint:
    threats = await mongo().threats.find({"severity": "critical"}).to_list(50)
"""

from __future__ import annotations

import os
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None

DEFAULT_URL = "mongodb://localhost:27017"
DEFAULT_DB = "darktrace"

# Keep in sync with init-mongo.js — a typo here must fail loudly, not
# silently create a second collection.
COLLECTIONS = (
    "threats",
    "indicators",
    "alerts",
    "crawled_documents",
    "activity_events",
    "siem_events",
    "crawl_logs",
)


def build_url() -> str:
    return os.getenv("MONGO_URL", DEFAULT_URL)


def build_db_name() -> str:
    return os.getenv("MONGO_DB", DEFAULT_DB)


async def init_mongo(url: Optional[str] = None, db_name: Optional[str] = None) -> AsyncIOMotorDatabase:
    """Connect and ping. Safe to call twice (returns the existing client)."""
    global _client, _db
    if _db is not None:
        return _db
    _client = AsyncIOMotorClient(url or build_url(), serverSelectionTimeoutMS=5000)
    _db = _client[db_name or build_db_name()]
    await _client.admin.command("ping")  # raises if MongoDB is unreachable
    return _db


async def close_mongo() -> None:
    global _client, _db
    if _client is not None:
        _client.close()
    _client, _db = None, None


def mongo() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("MongoDB not initialised — call await init_mongo() first")
    return _db


async def health_check() -> dict:
    """Never raises — returns {"ok": bool, ...} for a /health endpoint."""
    try:
        db = mongo()
        await db.command("ping")
        counts = {name: await db[name].estimated_document_count() for name in COLLECTIONS}
        return {"ok": True, "database": db.name, "collections": counts}
    except Exception as exc:  # noqa: BLE001 - a health probe must not raise
        return {"ok": False, "error": str(exc)}
