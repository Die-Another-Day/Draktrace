"""End-to-end tests for the integrated dev backend (dev_server.py).

Needs REAL databases — the point of this file is to prove the wiring,
not a fake. Run against throwaway databases::

    export TEST_DATABASE_URL=<redacted>
    export TEST_MONGO_URL=mongodb://localhost:27017
    export TEST_MONGO_DB=darktrace_test
    pytest tests/test_dev_server.py -v

The fixture wipes users / source / crawl_job / cases / revoked_tokens
and the Mongo alerts / threats / counters collections before every test.
Skipped unless both TEST_DATABASE_URL and TEST_MONGO_URL are set.
"""

import os

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient  # noqa: E402

import dev_server  # noqa: E402
from app.services import mongo_store  # noqa: E402
from dev_server import app  # noqa: E402

PG = os.getenv("TEST_DATABASE_URL")
MONGO_URL = os.getenv("TEST_MONGO_URL")
MONGO_DB = os.getenv("TEST_MONGO_DB", "darktrace_test")

pytestmark = pytest.mark.skipif(
    not (PG and MONGO_URL),
    reason="set TEST_DATABASE_URL and TEST_MONGO_URL to run the dev-server tests",
)

U = {"username": "analyst", "email": "a@example.com", "password": "Str0ngPass!"}

THREAT = {
    "threat_id": "thr-900",
    "title": "Test credential dump",
    "description": "Seeded for the API test.",
    "severity": "high",
    "category": "data-leak",
    "status": "active",
    "source": {"source_id": "src_dev_001", "name": "Test source"},
    "indicators": [{"type": "ip", "value": "1.2.3.4"}],
    "detected_at": "2026-11-20T00:00:00Z",
}


@pytest.fixture
def client():
    import db_utils as db

    os.environ["DATABASE_URL"] = PG
    os.environ["MONGO_URL"] = MONGO_URL
    os.environ["MONGO_DB"] = MONGO_DB
    with TestClient(app) as c:
        # Wipe both stores; the app lifespan already created the schema.
        c.portal.call(_wipe_postgres)
        c.portal.call(_wipe_mongo)
        c.portal.call(_seed_threat)
        yield c
        c.portal.call(_wipe_postgres)
        c.portal.call(_wipe_mongo)


async def _wipe_postgres():
    import db_utils as db

    async with db.connection() as conn:
        await conn.execute(
            "TRUNCATE crawl_job, source, cases, revoked_tokens, users RESTART IDENTITY CASCADE"
        )


async def _wipe_mongo():
    m = mongo_store.mongo()
    for name in ("alerts", "threats", "counters", "indicators"):
        await m[name].delete_many({})


async def _seed_threat():
    await mongo_store.insert_threat(dict(THREAT))


def _login(c):
    c.post("/api/v1/auth/register", json=U)
    r = c.post("/api/v1/auth/token", data={"username": U["username"], "password": U["password"]})
    assert r.status_code == 200, r.text
    return r.json()


def _headers(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def test_health_reports_both_databases(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["storage"]["postgres"]["ok"] is True
    assert r.json()["storage"]["mongodb"]["ok"] is True


def test_register_login_me_and_dev_source(client):
    r = client.post("/api/v1/auth/register", json=U)
    assert r.status_code == 201, r.text
    assert r.json()["usr_id"].startswith("usr_")
    assert "password" not in r.text
    assert client.post("/api/v1/auth/register", json=U).status_code == 409

    tokens = _login(client)
    me = client.get("/api/v1/auth/me", headers=_headers(tokens))
    assert me.status_code == 200 and me.json()["username"] == "analyst"
    assert client.get("/api/v1/auth/me").status_code == 401

    sources = client.get("/api/v1/sources", headers=_headers(tokens))
    assert sources.status_code == 200
    assert any(s["source_id"] == "src_dev_001" for s in sources.json())


def test_alerts_live_in_mongodb_and_dashboard_counts_them(client):
    tokens = _login(client)
    h = _headers(tokens)
    created = client.post(
        "/api/v1/alerts",
        json={"title": "Test alert", "severity": "high", "ioc": "1.2.3.4"},
        headers=h,
    )
    assert created.status_code == 201, created.text
    assert created.json()["id"] == "alert_001"
    assert created.json()["sent_to_siem"] is True

    listed = client.get("/api/v1/alerts", headers=h).json()
    assert [a["id"] for a in listed] == ["alert_001"]

    summary = client.get("/api/v1/dashboard/summary", headers=h).json()
    assert summary["alerts_by_severity"] == {"critical": 0, "high": 1, "medium": 0, "low": 0}
    assert summary["total_cases"] == 0 and summary["total_threats"] == 1


def test_threats_list_and_patch(client):
    tokens = _login(client)
    h = _headers(tokens)
    threats = client.get("/api/v1/threats", headers=h).json()
    assert [t["threat_id"] for t in threats] == ["thr-900"]

    patched = client.patch("/api/v1/threats/thr-900", json={"status": "triaged"}, headers=h)
    assert patched.status_code == 200 and patched.json()["status"] == "triaged"
    assert client.get("/api/v1/threats/thr-900", headers=h).json()["status"] == "triaged"
    assert client.get("/api/v1/threats/nope", headers=h).status_code == 404


def test_crawl_jobs_live_in_postgres(client):
    tokens = _login(client)
    h = _headers(tokens)
    created = client.post(
        "/api/v1/crawl-jobs",
        json={"intent_id": "intent_1", "source_id": "src_dev_001", "kind": "manual"},
        headers=h,
    )
    assert created.status_code == 201, created.text
    assert created.json()["job_id"] == "job_001"
    assert created.json()["state"] == "queued"
    assert client.get("/api/v1/crawl-jobs", headers=h).json()[0]["job_id"] == "job_001"
    assert (
        client.post(
            "/api/v1/crawl-jobs",
            json={"intent_id": "intent_2", "source_id": "src_nope", "kind": "manual"},
            headers=h,
        ).status_code
        == 404
    )


def test_refresh_rotates_and_logout_revokes(client):
    tokens = _login(client)
    refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 200
    new_tokens = refreshed.json()
    # The old refresh token is single-use.
    assert (
        client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code
        == 401
    )
    assert client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": new_tokens["refresh_token"]},
        headers=_headers(new_tokens),
    ).status_code == 204
    assert client.get("/api/v1/auth/me", headers=_headers(new_tokens)).status_code == 401
