"""The UI is shipped by the API itself: one deploy, no build step, no CDN.

These tests are deliberately shallow - they prove the page is served, the assets resolve, and
every endpoint the page calls with a token exists. The behaviour behind those endpoints is
covered by the rest of the suite.
"""
import os
import re
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


DESIGN_MARKERS = [
    'id="kpis"', 'id="miniWeek"', 'id="venueStrip"', 'id="roomHero"', 'id="ttBody"',
    'id="bookTable"', 'id="changeJson"', 'id="proposalList"', 'id="aiDraft"',
    'id="sideChat"', 'id="dbInfo"', 'id="roleButtons"',
    'data-view="overview"', 'data-view="timetable"', 'data-view="bookings"',
    'data-view="changes"', 'data-view="ai"', 'data-view="admin"',
]


def test_the_shell_carries_the_full_design(client):
    """Every panel the design promises is in the markup the API serves."""
    html = client.get("/").text
    missing = [m for m in DESIGN_MARKERS if m not in html]
    assert not missing, missing


def test_javascript_only_touches_ids_that_exist(client):
    """The classic break: rewrite the HTML, forget the script. Catch it here."""
    html = client.get("/").text
    js = client.get("/ui/app.js").text
    html_ids = set(re.findall(r'id="([^"]+)"', html))
    js_made_ids = set(re.findall(r'id=\\?"([A-Za-z0-9_]+)', js))
    used = set(re.findall(r'\$\("([^"]+)"\)', js))
    used |= set(re.findall(r"getElementById\(\\?['\"]([A-Za-z0-9_]+)", js))
    missing = sorted(u for u in used if u not in html_ids and u not in js_made_ids)
    assert not missing, missing


def test_inline_handlers_are_real_functions(client):
    html = client.get("/").text
    js = client.get("/ui/app.js").text
    handlers = set(re.findall(r'on(?:click|change)="([A-Za-z_$][\w$]*)\(', html))
    handlers |= set(re.findall(r'onclick=\\?"([A-Za-z_$][\w$]*)\(', js))
    defined = set(re.findall(r'(?:async )?function ([A-Za-z0-9_]+)\(', js))
    defined |= set(re.findall(r'const ([A-Za-z0-9_]+) = ', js))
    missing = sorted(h for h in handlers if h not in defined)
    assert not missing, missing


def test_no_cdn_no_gradients_and_art_is_inline_svg(client):
    """The design rule we promised the judges: borders and space, no glow."""
    css = client.get("/ui/app.css").text
    js = client.get("/ui/app.js").text
    html = client.get("/").text
    assert "gradient(" not in css, "no decorative gradients"
    assert "url(http" not in css and "url(//" not in css
    assert "<img" not in html, "venue art is drawn, not linked"
    assert "http://" not in js and "https://" not in js, "no CDN, no telemetry"
    assert "function venueArt(" in js, "halls must have artwork"
    for kind in ("auditorium", "lecture_hall", "seminar_hall", "outdoor", "workshop"):
        assert kind in js, kind


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


def test_favicon_and_cache_headers(client):
    icon = client.get("/favicon.ico")
    assert icon.status_code == 200
    assert icon.headers["content-type"].startswith("image/svg")
    assert client.get("/").headers["cache-control"] == "no-store"
    assert client.get("/api/info").headers["cache-control"] == "no-store"
    assert "max-age" in client.get("/ui/app.css").headers["cache-control"]


def test_large_payloads_are_compressed(client):
    headers, _ = login(client, "admin")
    r = client.get("/api/timetable/week", headers={**headers, "Accept-Encoding": "gzip"})
    assert r.status_code == 200
    assert r.headers.get("content-encoding") == "gzip"
    assert r.json()["count"] == 189


def test_cors_never_combines_wildcard_with_credentials(client):
    """`*` + credentials is rejected by browsers; the app must pick one."""
    import importlib

    from app import main as main_module

    cors = [m for m in main_module.app.user_middleware if "CORS" in str(m)]
    assert cors, "CORSMiddleware must be installed"
    kwargs = cors[0].kwargs
    if "*" in kwargs.get("allow_origins", []):
        assert kwargs.get("allow_credentials") is False, kwargs
    r = client.get("/health", headers={"Origin": "http://example.com"})
    assert r.status_code == 200
