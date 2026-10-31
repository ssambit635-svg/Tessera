"""The UI is shipped by the API itself: one deploy, no build step, no CDN.

These tests are deliberately shallow - they prove the page is served, the assets resolve, and
every endpoint the page calls with a token exists. The behaviour behind those endpoints is
covered by the rest of the suite.
"""
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def test_index_serves_the_app(client):
    r = client.get("/")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    html = r.text
    for marker in ('id="login"', 'id="app"', "/ui/app.css", "/ui/app.js", "Tessera"):
        assert marker in html, marker
    # no external CDN: the demo must work on a laptop with no network
    # (the inline SVG favicon carries the w3.org namespace string, which is not a request)
    assert 'src="http' not in html
    assert 'href="http' not in html


def test_assets_are_served(client):
    css = client.get("/ui/app.css")
    js = client.get("/ui/app.js")
    assert css.status_code == 200 and len(css.text) > 2000
    assert js.status_code == 200 and len(js.text) > 10000
    assert client.get("/ui/../app/main.py").status_code == 404


def test_every_endpoint_the_page_calls_exists(client):
    from app.main import app

    paths = set(app.openapi()["paths"])          # routers are mounted, so use the schema
    needed = [
        "/api/auth/accounts", "/api/auth/demo-login/{role}", "/health",
        "/api/admin/dashboard", "/api/admin/db", "/api/admin/reset", "/api/admin/exports",
        "/api/dataset/entities", "/api/timetable", "/api/timetable/week",
        "/api/timetable/sessions/{session_id}/explain", "/api/bookings",
        "/api/bookings/{request_id}", "/api/bookings/manual", "/api/bookings/manual/check",
        "/api/disruption/sample", "/api/disruption/preview-file",
        "/api/disruption/proposals", "/api/disruption/{proposal_id}/apply",
        "/api/disruption/{proposal_id}/reject", "/api/ai/parse", "/api/ai/status",
        "/api/ai/samples", "/api/ai/change-request", "/api/timetable/generate",
        "/api/admin/exports/{name}",
    ]
    missing = [p for p in needed if p not in paths]
    assert not missing, missing


def test_ai_samples_are_ready_to_paste(client):
    headers, _ = login(client, "club")
    r = client.get("/api/ai/samples", headers=headers).json()
    assert r["count"] == 8, r
    assert r["samples"][0]["text"].startswith("Need a room for 45 people")
    assert not r["samples"][0]["text"][0].isdigit()


def login(client, role="admin"):
    r = client.post(f"/api/auth/demo-login/{role}")
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()


@pytest.fixture(scope="module")
def client():
    os.environ.setdefault("LLM_PROVIDER", "none")
    from app.main import app

    with TestClient(app) as c:
        yield c
