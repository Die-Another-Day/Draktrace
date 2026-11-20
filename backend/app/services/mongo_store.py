"""MongoDB store for the DarkTrace dev backend (alerts + threats).

This is the backend half of ``database/nosql/``: the collections,
validators and seed data live there (``init-mongo.js``, ``models.py``,
``seed.py``); this module is the only place ``dev_server.py`` talks to
MongoDB from. It uses the shared client in
``database/nosql/mongo_client.py`` (Motor, async) so there is exactly
one connection setup in the repo.

Collections used here (all in the ``darktrace`` database):
  alerts  — durable home of the alerts dev_server used to keep in Redis
            (``darktrace:alerts`` list). Redis is no longer used by the
            dev backend at all.
  threats — threat-intelligence documents seeded from
            ``frontend/src/mock-data/threats.json`` via
            ``python -m database.nosql.seed``.

Cross-store references are plain strings: ``alerts.case_id`` /
``threats.case_id`` point at Postgres ``cases.case_id`` and
``threats.assigned_to`` / ``alerts.created_by`` at ``users.usr_id``.
There is no join — the caller does a second lookup when it needs the
Postgres side.

All datetimes are stored as BSON dates and returned as ISO strings.
``_id`` is the human-readable id (``alert_001``, ``thr-001``), so the
API can return it as ``id`` without exposing ObjectIds.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# database/ lives at the repository root, next to backend/.
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from database.nosql.models import Alert as AlertModel  # noqa: E402
from database.nosql.models import Threat as ThreatModel  # noqa: E402
from database.nosql.mongo_client import close_mongo, health_check as mongo_health  # noqa: E402
from database.nosql.mongo_client import init_mongo, mongo  # noqa: E402

__all__ = [
    "init_mongo_store",
    "close_mongo_store",
    "mongo_health_check",
    "create_alert",
    "list_alerts",
    "alerts_by_severity",
    "list_threats",
    "get_threat",
    "update_threat",
    "insert_threat",
]

SEVERITIES = ("critical", "high", "medium", "low")
THREAT_STATUSES = ("active", "triaged", "contained", "closed", "false_positive")
ALERT_STATUSES = ("active", "acknowledged", "resolved", "false_positive")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat().replace("+00:00", "Z")
    return value


def _alert_out(doc: dict) -> dict:
    return {
        "id": doc["alert_id"],
        "title": doc["title"],
        "severity": doc["severity"],
        "ioc": doc.get("ioc"),
        "type": doc.get("type"),
        "source": doc.get("source"),
        "description": doc.get("description") or "",
        "status": doc.get("status", "active"),
        "threat_id": doc.get("threat_id"),
        "case_id": doc.get("case_id"),
        "sent_to_siem": doc.get("sent_to_siem", False),
        "created_at": _iso(doc.get("created_at")),
    }


def _threat_out(doc: dict) -> dict:
    out = {k: _iso(v) for k, v in doc.items() if k != "_id"}
    out["id"] = doc.get("threat_id", doc.get("_id"))
    return out


async def init_mongo_store() -> None:
    """Connect and create the indexes this backend relies on.

    Validators are applied by ``database/nosql/init-mongo.js`` (run by
    docker compose on first start, or manually with mongosh); indexes
    are created here too so a manually-started MongoDB still works.
    """
    db = await init_mongo()
    await db["threats"].create_index([("severity", 1), ("detected_at", -1)])
    await db["threats"].create_index([("category", 1), ("detected_at", -1)])
    await db["threats"].create_index([("source.source_id", 1), ("detected_at", -1)])
    await db["threats"].create_index([("status", 1), ("detected_at", -1)])
    await db["threats"].create_index([("case_id", 1)])
    await db["threats"].create_index([("indicators.value", 1)])
    await db["alerts"].create_index([("severity", 1), ("created_at", -1)])
    await db["alerts"].create_index([("status", 1), ("created_at", -1)])
    await db["alerts"].create_index([("case_id", 1)])
    await db["indicators"].create_index(
        [("type", 1), ("value", 1)], unique=True, name="uniq_indicator"
    )


async def close_mongo_store() -> None:
    await close_mongo()


async def mongo_health_check() -> dict:
    return await mongo_health()


async def _next_alert_seq() -> int:
    db = mongo()
    doc = await db["counters"].find_one_and_update(
        {"_id": "alert"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return doc["seq"]


# ------------------------------------------------------------------ alerts


async def create_alert(
    *,
    title: str,
    severity: str,
    ioc: Optional[str] = None,
    type: Optional[str] = None,
    source: Optional[str] = None,
    description: Optional[str] = None,
    threat_id: Optional[str] = None,
    case_id: Optional[str] = None,
    created_by: Optional[str] = None,
) -> dict:
    """Insert one alert and return its API shape. Raises ValueError on
    a bad severity (the endpoint turns it into a 422)."""
    if severity not in SEVERITIES:
        raise ValueError(f"Invalid severity {severity!r}")
    now = _now()
    seq = await _next_alert_seq()
    alert_id = f"alert_{seq:03d}"
    doc = AlertModel(
        alert_id=alert_id,
        title=title,
        severity=severity,  # type: ignore[arg-type]
        type=type,
        ioc=ioc,
        source=source,
        description=description or "",
        threat_id=threat_id,
        case_id=case_id,
        created_by=created_by,
        sent_to_siem=severity in ("high", "critical"),
        created_at=now,
        updated_at=now,
    ).model_dump()
    doc["_id"] = alert_id
    await mongo()["alerts"].insert_one(doc)
    return _alert_out(doc)


async def list_alerts(*, severity: Optional[str] = None, limit: int = 100) -> list[dict]:
    query: dict = {}
    if severity:
        query["severity"] = severity
    cursor = mongo()["alerts"].find(query).sort("created_at", -1).limit(limit)
    return [_alert_out(doc) async for doc in cursor]


async def count_threats() -> int:
    return await mongo()["threats"].estimated_document_count()


async def alerts_by_severity() -> dict[str, int]:
    counts = {severity: 0 for severity in SEVERITIES}
    async for row in mongo()["alerts"].aggregate(
        [{"$group": {"_id": "$severity", "count": {"$sum": 1}}}]
    ):
        if row["_id"] in counts:
            counts[row["_id"]] = row["count"]
    return counts


# ----------------------------------------------------------------- threats


async def list_threats(
    *,
    severity: Optional[str] = None,
    category: Optional[str] = None,
    status: Optional[str] = None,
    source_id: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    query: dict = {}
    if severity:
        query["severity"] = severity
    if category:
        query["category"] = category
    if status:
        query["status"] = status
    if source_id:
        query["source.source_id"] = source_id
    if q:
        query["$text"] = {"$search": q}
    cursor = (
        mongo()["threats"]
        .find(query)
        .sort("detected_at", -1)
        .skip(offset)
        .limit(limit)
    )
    return [_threat_out(doc) async for doc in cursor]


async def get_threat(threat_id: str) -> Optional[dict]:
    doc = await mongo()["threats"].find_one({"threat_id": threat_id})
    return _threat_out(doc) if doc else None


async def update_threat(threat_id: str, patch: dict) -> Optional[dict]:
    """Patch status / case_id / assigned_to. Returns the updated threat
    or None if it does not exist. Raises ValueError on a bad status."""
    allowed = {"status", "case_id", "assigned_to"}
    updates = {k: v for k, v in patch.items() if k in allowed}
    if "status" in updates and updates["status"] not in THREAT_STATUSES:
        raise ValueError(f"Invalid threat status {updates['status']!r}")
    if not updates:
        return await get_threat(threat_id)
    updates["updated_at"] = _now()
    doc = await mongo()["threats"].find_one_and_update(
        {"threat_id": threat_id},
        {"$set": updates},
        return_document=True,
    )
    return _threat_out(doc) if doc else None


async def insert_threat(doc: dict) -> dict:
    """Insert a threat document (used by tests / ingestion). Validates
    it against the shared Pydantic model first."""
    validated = ThreatModel(**{k: v for k, v in doc.items() if k != "_id"}).model_dump()
    validated["_id"] = validated["threat_id"]
    await mongo()["threats"].insert_one(validated)
    return _threat_out(validated)
