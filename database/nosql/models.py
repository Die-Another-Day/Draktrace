"""DarkTrace — MongoDB document models (Pydantic v2).

These are the Python mirror of ``init-mongo.js``: same field names, same
enums, same required fields. Use them in the FastAPI backend to validate
anything before it reaches MongoDB, so a bad crawler payload fails here
with a 422 instead of silently landing in the collection.

No database connection is needed to import this file — validation only.
Install: ``pip install pydantic`` (already in the backend's stack).

Field-name notes (kept identical to the code that produces/consumes them):
- ``threats`` mirrors ``frontend/src/mock-data/threats.json`` field for
  field, plus the lifecycle fields the UI will need (``status``,
  ``case_id``, ``assigned_to``).
- ``alerts`` mirrors ``backend/dev_server.py`` ``AlertPayload``.
- ``crawled_documents`` mirrors the ``DocumentIngest`` payload the
  crawler POSTs to ``/api/v1/ingestion/document`` (backend/main.py).
- Cross-store references (``case_id`` -> Postgres ``cases``,
  ``assigned_to``/``created_by`` -> Postgres ``users.usr_id``,
  ``job_id``/``source_id`` -> Postgres ``crawl_job``/``source``) are
  plain strings. There is deliberately no join: the backend resolves
  them with a second, cheap lookup only when the UI asks for it.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal, Optional

from pydantic import BaseModel, Field

Severity = Literal["critical", "high", "medium", "low"]
Category = Literal[
    "ransomware", "credential-theft", "phishing", "malware", "data-leak", "exploit"
]
IocType = Literal["domain", "ip", "hash", "url", "email"]


class SourceRef(BaseModel):
    """Denormalised source snapshot copied into a threat/document at write time."""

    source_id: str
    name: str
    url: Optional[str] = None


class Indicator(BaseModel):
    type: IocType
    value: str = Field(min_length=1)


class Threat(BaseModel):
    threat_id: str  # thr-001 — also the Mongo _id
    title: str = Field(min_length=1)
    severity: Severity
    category: Category
    status: Literal["active", "triaged", "contained", "closed", "false_positive"] = "active"
    confidence: int = Field(default=0, ge=0, le=100)
    description: str = ""
    tags: list[str] = Field(default_factory=list)
    source: SourceRef
    indicators: list[Indicator] = Field(default_factory=list)
    detected_at: datetime
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    case_id: Optional[str] = None  # Postgres cases.case_id
    assigned_to: Optional[str] = None  # Postgres users.usr_id
    enrichment: dict = Field(default_factory=dict)


class IndicatorDoc(BaseModel):
    """Canonical IOC registry entry — one doc per (type, value)."""

    type: IocType
    value: str = Field(min_length=1)
    threat_ids: list[str] = Field(default_factory=list)
    categories: list[Category] = Field(default_factory=list)
    sightings: int = Field(default=1, ge=1)
    confidence: int = Field(default=0, ge=0, le=100)
    status: Literal["active", "blocked", "expired", "false_positive"] = "active"
    first_seen: datetime
    last_seen: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class Alert(BaseModel):
    """Mirrors dev_server.AlertPayload + main.py prod Alert fields."""

    alert_id: str
    title: str = Field(min_length=1)
    severity: Severity
    type: Optional[str] = None  # threat category, e.g. "ransomware"
    ioc: Optional[str] = None
    ioc_type: Optional[IocType] = None
    source: Optional[str] = None
    description: str = ""
    status: Literal["active", "acknowledged", "resolved", "false_positive"] = "active"
    threat_id: Optional[str] = None
    case_id: Optional[str] = None  # Postgres cases.case_id
    created_by: Optional[str] = None  # Postgres users.usr_id
    sent_to_siem: bool = False
    siem_forwarded_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class CrawledDocument(BaseModel):
    doc_id: str
    job_id: str  # Postgres crawl_job.job_id
    source: SourceRef
    url: str
    title: Optional[str] = None
    raw_text: Optional[str] = None
    content_hash: Optional[str] = None
    language: str = "en"
    entities: list[dict] = Field(default_factory=list)
    threat_ids: list[str] = Field(default_factory=list)
    fetched_at: datetime
    created_at: Optional[datetime] = None


class ActivityEvent(BaseModel):
    timestamp: datetime
    level: Literal["info", "success", "warn", "error"]
    severity: Literal["system", "critical", "high", "medium", "low"] = "system"
    message: str
    actor: str = "system"
    source: Optional[str] = None
    related: dict = Field(default_factory=dict)
    created_at: Optional[datetime] = None


class SiemEvent(BaseModel):
    """Inbound SIEM webhook payload — envelope validated, payload free-form."""

    received_at: datetime
    vendor: str
    event_type: Optional[str] = None
    payload: dict  # vendor-defined JSON, intentionally unvalidated
    processed: bool = False
    alert_id: Optional[str] = None
    created_at: Optional[datetime] = None


class CrawlLog(BaseModel):
    job_id: str
    crawler_id: str
    crawler_name: Optional[str] = None
    source: Optional[SourceRef] = None
    status: Literal["running", "paused", "stopped", "idle"] = "idle"
    pages_crawled: int = Field(default=0, ge=0)
    pages_discovered: int = Field(default=0, ge=0)
    progress_pct: int = Field(default=0, ge=0, le=100)
    throughput_per_min: int = Field(default=0, ge=0)
    latency_ms: int = Field(default=0, ge=0)
    tor_circuit: Optional[str] = None
    logged_at: datetime
    created_at: Optional[datetime] = None


# Collection name -> model, used by seed.py validation.
COLLECTIONS: dict[str, type[BaseModel]] = {
    "threats": Threat,
    "indicators": IndicatorDoc,
    "alerts": Alert,
    "crawled_documents": CrawledDocument,
    "activity_events": ActivityEvent,
    "siem_events": SiemEvent,
    "crawl_logs": CrawlLog,
}
