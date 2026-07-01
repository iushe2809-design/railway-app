"""Iteration 6 backend tests: AI reliability, 2-tier thresholds, override validation, leaderboard, reports schema."""
import io
import os
import pytest
import requests
from PIL import Image

from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


def _login(username, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin", "Admin@123")


@pytest.fixture(scope="module")
def sm_token():
    return _login("sm001", "Station@123")


@pytest.fixture(scope="module")
def jpeg_bytes():
    buf = io.BytesIO()
    img = Image.new("RGB", (640, 480), color=(120, 140, 160))
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


# ---------- AI reliability ----------
def test_ai_upload_returns_valid_rating(sm_token, jpeg_bytes):
    files = {"files": ("test.jpg", jpeg_bytes, "image/jpeg")}
    r = requests.post(
        f"{BASE_URL}/api/inspections/upload",
        headers={"Authorization": f"Bearer {sm_token}"},
        files=files,
        timeout=90,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["station_name"] == "RNC", "sm001 must be locked to RNC"
    assert len(data["photos"]) == 1
    ai = data["photos"][0]["ai_analysis"]
    assert ai["rating"] in ("Clean", "Need Attention"), f"got rating {ai['rating']}"
    issues = ai.get("issues") or []
    for it in issues:
        assert "AI analysis error" not in it, f"AI fallback fired: {it}"
    # Save inspection id for override tests
    pytest.INSPECTION_ID = data["id"]
    pytest.PHOTO_ID = data["photos"][0]["id"]
    # Aggregate must be 2-tier
    assert data["aggregate_rating"] in ("Clean", "Need Attention")


# ---------- Override endpoint ----------
def test_override_clean(admin_token):
    iid = getattr(pytest, "INSPECTION_ID", None)
    pid = getattr(pytest, "PHOTO_ID", None)
    if not iid:
        pytest.skip("No inspection available")
    r = requests.post(
        f"{BASE_URL}/api/inspections/{iid}/photos/{pid}/override",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"new_rating": "Clean", "notes": "TEST clean override"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["aggregate_score"] == 90
    assert body["aggregate_rating"] == "Clean"


def test_override_need_attention(admin_token):
    iid = getattr(pytest, "INSPECTION_ID", None)
    pid = getattr(pytest, "PHOTO_ID", None)
    if not iid:
        pytest.skip("No inspection available")
    r = requests.post(
        f"{BASE_URL}/api/inspections/{iid}/photos/{pid}/override",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"new_rating": "Need Attention", "notes": "TEST attention override"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["aggregate_score"] == 60
    assert body["aggregate_rating"] == "Need Attention"


@pytest.mark.parametrize("bad_rating", ["Unclean", "Needs Attention", "Dirty", ""])
def test_override_rejects_legacy_ratings(admin_token, bad_rating):
    iid = getattr(pytest, "INSPECTION_ID", None)
    pid = getattr(pytest, "PHOTO_ID", None)
    if not iid:
        pytest.skip("No inspection available")
    r = requests.post(
        f"{BASE_URL}/api/inspections/{iid}/photos/{pid}/override",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"new_rating": bad_rating, "notes": "should fail"},
    )
    assert r.status_code == 400, f"Expected 400 for {bad_rating!r}, got {r.status_code}: {r.text}"


# ---------- Reports summary schema ----------
def test_reports_summary_schema(admin_token):
    r = requests.get(
        f"{BASE_URL}/api/reports/summary",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    # rating_counts must be 2-key (Clean + Need Attention)
    assert set(data["rating_counts"].keys()) == {"Clean", "Need Attention"}
    assert data["station_breakdown"], "expected at least one station in breakdown"
    for s in data["station_breakdown"]:
        for key in ("station_name", "total", "clean", "need_attention", "avg_score",
                    "inspection_days", "clean_pct", "need_attention_pct"):
            assert key in s, f"missing {key} in {s}"
        # clean_pct + need_attention_pct == 100 (within rounding)
        pct_sum = s["clean_pct"] + s["need_attention_pct"]
        assert abs(pct_sum - 100.0) <= 0.2, f"{s['station_name']}: pct sum={pct_sum}"


# ---------- Leaderboard endpoint ----------
def test_leaderboard_endpoint(admin_token):
    r = requests.get(
        f"{BASE_URL}/api/reports/leaderboard",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    for key in ("overall", "average", "most_recent"):
        assert key in data, f"missing {key}"
        assert isinstance(data[key], list)
    if data["overall"]:
        top = data["overall"][0]
        for k in ("station_name", "clean_pct", "avg_score", "total"):
            assert k in top


def test_leaderboard_sm_forbidden(sm_token):
    r = requests.get(
        f"{BASE_URL}/api/reports/leaderboard",
        headers={"Authorization": f"Bearer {sm_token}"},
    )
    assert r.status_code == 403


# ---------- SM upload locked to their station ----------
def test_sm_upload_ignores_station_name(sm_token, jpeg_bytes):
    files = {"files": ("t.jpg", jpeg_bytes, "image/jpeg")}
    data = {"station_name": "HACKED"}
    r = requests.post(
        f"{BASE_URL}/api/inspections/upload",
        headers={"Authorization": f"Bearer {sm_token}"},
        files=files,
        data=data,
        timeout=90,
    )
    assert r.status_code == 200
    assert r.json()["station_name"] == "RNC"
