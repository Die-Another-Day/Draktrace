"""DarkTrace — MongoDB aggregation pipelines for the dashboard.

The frontend today reads pre-computed numbers from
``frontend/src/mock-data/statistics.json`` and ``charts.json``
(threat totals, severity counts, threats-over-time, category split,
crawling activity, source activity). Those files are fixtures, not a
store: the live numbers must be computed from the collections, not
saved in another table that drifts out of sync.

Each function below returns a pipeline (list of stages) for the named
collection. Run it with Motor::

    pipeline = threats_by_severity()
    rows = await mongo().threats.aggregate(pipeline).to_list(10)
    # [{"severity": "critical", "count": 4}, ...]

Expected live values from the seed data (sanity check):
  threats total 40; severity critical 4 / high 12 / medium 15 / low 9;
  categories ransomware 7, phishing 7, malware 7, data-leak 7,
  credential-theft 6, exploit 6 — exactly statistics.json / charts.json.
"""

from __future__ import annotations


def threats_by_severity() -> list[dict]:
    """statistics.severity + charts.severityDistribution."""
    return [
        {"$group": {"_id": "$severity", "count": {"$sum": 1}}},
        {"$project": {"_id": 0, "severity": "$_id", "count": 1}},
        {"$sort": {"count": -1}},
    ]


def threats_by_category() -> list[dict]:
    """charts.threatCategories."""
    return [
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
        {"$project": {"_id": 0, "category": "$_id", "count": 1}},
        {"$sort": {"count": -1}},
    ]


def threats_over_time(bucket_hours: int = 3) -> list[dict]:
    """charts.threatsOverTime — counts per N-hour bucket, oldest first."""
    return [
        {
            "$group": {
                "_id": {
                    "$dateTrunc": {"date": "$detected_at", "unit": "hour", "binSize": bucket_hours}
                },
                "count": {"$sum": 1},
            }
        },
        {"$project": {"_id": 0, "bucket": "$_id", "count": 1}},
        {"$sort": {"bucket": 1}},
    ]


def threats_by_source() -> list[dict]:
    """charts.sourceActivity (threatsFound per source)."""
    return [
        {"$group": {"_id": "$source.source_id", "name": {"$first": "$source.name"}, "threats": {"$sum": 1}}},
        {"$project": {"_id": 0, "source_id": "$_id", "name": 1, "threats": 1}},
        {"$sort": {"threats": -1}},
    ]


def dashboard_summary() -> list[dict]:
    """One-shot summary for GET /api/v1/dashboard/summary (MongoDB side).

    total/open cases still come from Postgres (cases table); this covers
    the threat/alert half. Combine both in the endpoint.
    """
    return [
        {
            "$facet": {
                "by_severity": threats_by_severity(),
                "by_category": threats_by_category(),
                "total": [{"$count": "count"}],
            }
        }
    ]


def top_indicators(limit: int = 10) -> list[dict]:
    """Most-seen IOCs — the indicator-registry leaderboard."""
    return [
        {"$sort": {"sightings": -1, "last_seen": -1}},
        {"$limit": limit},
        {"$project": {"_id": 0, "type": 1, "value": 1, "sightings": 1, "threat_ids": 1}},
    ]


def unprocessed_siem_events(limit: int = 50) -> list[dict]:
    """SIEM webhook backlog, oldest first."""
    return [
        {"$match": {"processed": False}},
        {"$sort": {"received_at": 1}},
        {"$limit": limit},
    ]
