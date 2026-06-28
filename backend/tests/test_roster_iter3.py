"""Iteration-3 tests for the 45-SM official roster, station lock-down,
and admin-vs-SM upload semantics.

Covers:
- Roster seeding (45 SMs + 1 admin = 46) and station_name mapping (sm001..sm045)
- Old SMs sm046..sm100 GONE; stations collection empty
- SM upload backend enforcement: station_name from form is IGNORED for SMs
- Admin upload: station_name from form IS honored
- /api/inspections/station-names distinct list
"""

import io
import os
import pytest
import requests
from PIL import Image

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

# Sample mapping from the official roster, used as spot-checks across the range.
EXPECTED_MAP = {
    "sm001": "RNC",
    "sm002": "MURI",
    "sm003": "HTE",
    "sm007": "GBX",
    "sm010": "PKC",
    "sm022": "BICI",
    "sm025": "HRBR",
    "sm033": "TUL",
    "sm045": "JAA",
}

LEGACY_USERNAMES = ["sm046", "sm050", "sm075", "sm099", "sm100"]


# ---------- fixtures ----------


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Accept": "application/json"})
    return sess


def _login(s, username, password):
    r = s.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {username} -> {r.status_code} {r.text}"
    return r.json()["token"], r.json()["user"]


@pytest.fixture(scope="session")
def admin_token(s):
    tok, _ = _login(s, "admin", "Admin@123")
    return tok


def _img_bytes():
    img = Image.new("RGB", (320, 240), color=(70, 110, 140))
    # add a tiny pattern so it's not solid-color
    for x in range(0, 320, 16):
        for y in range(0, 240, 16):
            img.putpixel((x, y), (200, 200, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=70)
    return buf.getvalue()


# ---------- roster / seeding ----------


def test_admin_login_works(s):
    tok, u = _login(s, "admin", "Admin@123")
    assert u["role"] == "admin"
    assert u["username"] == "admin"


def test_user_count_is_45_sm_plus_1_admin(s, admin_token):
    r = s.get(f"{API}/admin/users", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200
    users = r.json()
    sms = [u for u in users if u["role"] == "sm"]
    admins = [u for u in users if u["role"] == "admin"]
    assert len(sms) == 45, f"Expected 45 SMs, got {len(sms)}: {[u['username'] for u in sms]}"
    assert len(admins) >= 1, "Expected at least one admin"
    assert len(users) == len(sms) + len(admins)


def test_sm_usernames_are_exactly_sm001_through_sm045(s, admin_token):
    r = s.get(f"{API}/admin/users", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    sms = sorted([u["username"] for u in r.json() if u["role"] == "sm"])
    expected = [f"sm{str(i).zfill(3)}" for i in range(1, 46)]
    assert sms == expected, f"Roster mismatch.\nExpected: {expected}\nGot: {sms}"


def test_all_sms_are_active(s, admin_token):
    r = s.get(f"{API}/admin/users", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    for u in r.json():
        if u["role"] == "sm":
            assert u.get("active") is True, f"{u['username']} is not active"


def test_legacy_sms_are_gone(s, admin_token):
    r = s.get(f"{API}/admin/users", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    usernames = {u["username"] for u in r.json()}
    for legacy in LEGACY_USERNAMES:
        assert legacy not in usernames, f"Legacy SM {legacy} should have been removed"


@pytest.mark.parametrize("uname,code", list(EXPECTED_MAP.items()))
def test_station_assignment_for_sample_sm(uname, code, s, admin_token):
    r = s.get(f"{API}/admin/users", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    user = next((u for u in r.json() if u["username"] == uname), None)
    assert user is not None, f"{uname} missing from roster"
    assert user["station_name"] == code, f"{uname} -> expected {code}, got {user['station_name']}"


def test_stations_collection_empty_via_api(s, admin_token):
    """GET /api/stations should be empty (legacy Jaipur/NDLS/Howrah dropped)."""
    r = s.get(f"{API}/stations", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert body == [], f"Expected empty stations list, got {body}"


# ---------- SM login + auth/me station ----------


@pytest.mark.parametrize("uname,code", [("sm001", "RNC"), ("sm007", "GBX"), ("sm045", "JAA")])
def test_sm_login_and_me_returns_correct_station(s, uname, code):
    tok, user = _login(s, uname, "Station@123")
    assert user["role"] == "sm"
    assert user["station_name"] == code
    r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["station_name"] == code


# ---------- backend lock-down enforcement on upload ----------


def _upload_as(s, token, station_name_form_value, inspection_date="2026-07-01"):
    files = [("files", ("test.jpg", _img_bytes(), "image/jpeg"))]
    data = {"inspection_date": inspection_date}
    if station_name_form_value is not None:
        data["station_name"] = station_name_form_value
    r = s.post(
        f"{API}/inspections/upload",
        headers={"Authorization": f"Bearer {token}"},
        files=files,
        data=data,
        timeout=120,  # AI analysis takes time
    )
    return r


def test_sm_upload_ignores_forged_station_name_sm007(s):
    tok, _ = _login(s, "sm007", "Station@123")
    r = _upload_as(s, tok, station_name_form_value="HackedStation")
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    assert body["station_name"] == "GBX", f"sm007 must persist as GBX, got {body['station_name']}"
    assert body["inspection_date"] == "2026-07-01"
    assert body["upload_source"] == "sm"


def test_sm_upload_ignores_forged_station_name_sm045(s):
    tok, _ = _login(s, "sm045", "Station@123")
    r = _upload_as(s, tok, station_name_form_value="Hacked")
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    assert body["station_name"] == "JAA"


def test_sm_upload_without_station_name_form_field_uses_assigned(s):
    """SM client omits station_name entirely (matches new SMDashboard.jsx)."""
    tok, _ = _login(s, "sm010", "Station@123")
    r = _upload_as(s, tok, station_name_form_value=None)
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    assert body["station_name"] == "PKC"
    assert body["inspection_date"] == "2026-07-01"


def test_admin_upload_uses_form_station_name(s, admin_token):
    r = _upload_as(s, admin_token, station_name_form_value="TEST_AdHocAdmin")
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    assert body["station_name"] == "TEST_AdHocAdmin"
    assert body["upload_source"] == "admin"


def test_admin_upload_requires_station_name(s, admin_token):
    r = _upload_as(s, admin_token, station_name_form_value=None)
    assert r.status_code == 400, f"admin without station_name should 400, got {r.status_code} {r.text[:200]}"


# ---------- station-names endpoint ----------


def test_station_names_endpoint_contains_uploaded_codes(s, admin_token):
    r = s.get(
        f"{API}/inspections/station-names",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert r.status_code == 200
    names = r.json()
    assert isinstance(names, list)
    # After the SM-upload tests above run, these should be present
    for required in ["GBX", "JAA", "PKC"]:
        assert required in names, f"Expected {required} in station-names list, got {names}"


def test_station_names_requires_admin(s):
    tok, _ = _login(s, "sm007", "Station@123")
    r = s.get(
        f"{API}/inspections/station-names",
        headers={"Authorization": f"Bearer {tok}"},
        timeout=15,
    )
    assert r.status_code in (401, 403), f"SM should not access admin endpoint, got {r.status_code}"
