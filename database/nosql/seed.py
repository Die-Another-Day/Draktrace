"""DarkTrace — seed MongoDB from ``seed_data/*.json``.

Idempotent: every document is upserted on its ``_id``, so re-running
this never duplicates anything. Seed data is the repo's own mock data,
transformed (see the header of each file):
  threats.json (40) + indicators.json (40 unique IOCs) <- frontend threats.json
  alerts.json (6)            <- highest-severity threats, dev_server AlertPayload shape
  crawled_documents.json (3) <- first 3 threats, as raw crawler output
  activity_events.json (29)  <- frontend activity.json
  siem_events.json (2)       <- sample inbound SIEM webhook payloads
  crawl_logs.json (4)        <- frontend crawlers.json telemetry

Usage:
    pip install pymongo pydantic
    python -m database.nosql.seed                  # MONGO_URL / MONGO_DB from env or defaults
    python -m database.nosql.seed --validate-only  # check the JSON against models.py, no DB needed
    python -m database.nosql.seed --drop           # wipe the 7 collections first, then seed

Run from the repository root.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from database.nosql.models import COLLECTIONS  # noqa: E402

SEED_DIR = Path(__file__).resolve().parent / "seed_data"
DEFAULT_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DEFAULT_DB = os.getenv("MONGO_DB", "darktrace")

# _id -> the model field holding it (all seed files already carry _id).
FILE_TO_COLLECTION = {
    "threats.json": "threats",
    "indicators.json": "indicators",
    "alerts.json": "alerts",
    "crawled_documents.json": "crawled_documents",
    "activity_events.json": "activity_events",
    "siem_events.json": "siem_events",
    "crawl_logs.json": "crawl_logs",
}

# Fields the seed JSON stores as ISO strings but MongoDB wants as Dates.
DATE_FIELDS = {
    "threats": ["detected_at", "first_seen", "last_seen", "created_at", "updated_at"],
    "indicators": ["first_seen", "last_seen", "created_at", "updated_at"],
    "alerts": ["created_at", "updated_at", "siem_forwarded_at"],
    "crawled_documents": ["fetched_at", "created_at"],
    "activity_events": ["timestamp", "created_at"],
    "siem_events": ["received_at", "created_at"],
    "crawl_logs": ["logged_at", "created_at"],
}


def _parse_date(value):
    if value is None:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def load_seed() -> dict[str, list[dict]]:
    """Read + validate every seed file against its Pydantic model."""
    data: dict[str, list[dict]] = {}
    for filename, collection in FILE_TO_COLLECTION.items():
        path = SEED_DIR / filename
        docs = json.loads(path.read_text(encoding="utf-8"))
        model = COLLECTIONS[collection]
        for doc in docs:
            # _id is the Mongo key, not a model field — validate the rest.
            model(**{k: v for k, v in doc.items() if k != "_id"})
        data[collection] = docs
        print(f"  {collection:<20} {len(docs):>3} docs OK  ({filename})")
    return data


def to_mongo_docs(collection: str, docs: list[dict]) -> list[dict]:
    out = []
    for doc in docs:
        doc = dict(doc)
        for field in DATE_FIELDS.get(collection, []):
            if field in doc:
                doc[field] = _parse_date(doc[field])
        out.append(doc)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed DarkTrace MongoDB")
    parser.add_argument("--validate-only", action="store_true", help="validate seed JSON, touch no database")
    parser.add_argument("--drop", action="store_true", help="drop the 7 collections before seeding")
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--db", default=DEFAULT_DB)
    args = parser.parse_args()

    print("Validating seed data against database/nosql/models.py ...")
    data = load_seed()
    total = sum(len(v) for v in data.values())
    print(f"Validation passed: {total} documents across {len(data)} collections.")
    if args.validate_only:
        return 0

    from pymongo import MongoClient

    client = MongoClient(args.url, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    db = client[args.db]
    if args.drop:
        for collection in FILE_TO_COLLECTION.values():
            db.drop_collection(collection)
        print("Dropped existing collections.")

    for collection, docs in data.items():
        mongo_docs = to_mongo_docs(collection, docs)
        for doc in mongo_docs:
            db[collection].replace_one({"_id": doc["_id"]}, doc, upsert=True)
        print(f"  upserted {len(mongo_docs):>3} docs -> {collection}")
    print(f"Seed complete: {total} documents in MongoDB database '{args.db}'.")
    print("Next: run database/nosql/init-mongo.js (mongosh) if indexes/validators are not set yet.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
