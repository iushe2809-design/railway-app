"""Backend tests for iteration 5:
- BUG FIX 1: Date-range filtering on /reports/summary and /inspections
- FEATURE 4: No Jaipur in station-names/station_breakdown
- FEATURE 5: Admin-only DELETE /inspections/{id}; soft delete (404 afterwards,
  removed from listings + reports.station_breakdown)
"""
import io
import os
from datetime import date, timedelta

import pytest
import requests
from PIL import Image

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


# ---- fixtures ----

@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def sm_token():
    r = requests.post(f"{API}/auth/login", json={"username": "sm001", "password": "Station@123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def sm_h(sm_token):
    return {"Authorization": f"Bearer {sm_token}"}


def _make_image_bytes() -> bytes:
    # Real visual content: random-ish gradient w/ shapes (not solid)
    img = Image.new("RGB", (320, 240), color=(64, 96, 128))
    px = img.load()
    for y in range(240):
        for x in range(320):
            px[x, y] = ((x * 3) % 255, (y * 5) % 255, ((x + y) * 7) % 255)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=70)
    return buf.getvalue()


@pytest.fixture(scope="session")
def fresh_inspection_id(sm_h):
    """Upload a fresh inspection as sm001 (RNC) and return its id."""
    img = _make_image_bytes()
    files = {"files": ("test_rnc.jpg", img, "image/jpeg")}
    r = requests.post(
        f"{API}/inspections/upload",
        headers=sm_h,
        files=files,
        timeout=120,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["station_name"] == "RNC"
    return data["id"]


# ---- FEATURE 4: Jaipur removed ----

class TestNoJaipur:
    def test_station_names_no_jaipur(self, admin_h):
        r = requests.get(f"{API}/inspections/station-names", headers=admin_h)
        assert r.status_code == 200
        names = r.json()
        # Match any flavor of jaipur
        assert all("jaipur" not in n.lower() for n in names), names

    def test_reports_no_jaipur(self, admin_h):
        r = requests.get(f"{API}/reports/summary", headers=admin_h)
        assert r.status_code == 200
        breakdown = r.json()["station_breakdown"]
        assert all("jaipur" not in s["station_name"].lower() for s in breakdown), breakdown


# ---- BUG FIX 1: date-range filtering ----

class TestDateRange:
    def test_today_summary_matches_today_inspections(self, admin_h, fresh_inspection_id):
        today = date.today().isoformat()
        r = requests.get(
            f"{API}/reports/summary",
            headers=admin_h,
            params={"date_from": today, "date_to": today},
        )
        assert r.status_code == 200
        s = r.json()
        # we just uploaded one photo today -> total_photos >= 1
        assert s["total_photos"] >= 1
        assert s["total_inspections"] >= 1

        # Verify by fetching today's inspections
        r2 = requests.get(
            f"{API}/inspections",
            headers=admin_h,
            params={"date_from": today, "date_to": today},
        )
        assert r2.status_code == 200
        today_insps = r2.json()
        total_today_photos = sum(len(i["photos"]) for i in today_insps)
        assert s["total_photos"] == total_today_photos

    def test_range_30d_geq_today(self, admin_h, fresh_inspection_id):
        today = date.today().isoformat()
        from_30d = (date.today() - timedelta(days=29)).isoformat()
        r_today = requests.get(
            f"{API}/reports/summary",
            headers=admin_h,
            params={"date_from": today, "date_to": today},
        ).json()
        r_30d = requests.get(
            f"{API}/reports/summary",
            headers=admin_h,
            params={"date_from": from_30d, "date_to": today},
        ).json()
        assert r_30d["total_photos"] >= r_today["total_photos"]
        assert r_30d["total_inspections"] >= r_today["total_inspections"]

    def test_future_range_returns_zero(self, admin_h):
        future = (date.today() + timedelta(days=10)).isoformat()
        future2 = (date.today() + timedelta(days=15)).isoformat()
        r = requests.get(
            f"{API}/reports/summary",
            headers=admin_h,
            params={"date_from": future, "date_to": future2},
        )
        assert r.status_code == 200
        s = r.json()
        assert s["total_photos"] == 0
        assert s["total_inspections"] == 0


# ---- FEATURE 5: delete inspection ----

class TestDeleteInspection:
    def test_sm_cannot_delete(self, sm_h, fresh_inspection_id):
        r = requests.delete(f"{API}/inspections/{fresh_inspection_id}", headers=sm_h)
        assert r.status_code == 403, r.text

    def test_unauth_cannot_delete(self, fresh_inspection_id):
        r = requests.delete(f"{API}/inspections/{fresh_inspection_id}")
        assert r.status_code in (401, 403)

    def test_admin_can_delete_and_404(self, admin_h, fresh_inspection_id):
        # Confirm it exists first
        g = requests.get(f"{API}/inspections/{fresh_inspection_id}", headers=admin_h)
        assert g.status_code == 200

        d = requests.delete(f"{API}/inspections/{fresh_inspection_id}", headers=admin_h)
        assert d.status_code == 200, d.text
        assert d.json().get("ok") is True

        # Subsequent GET should 404 (soft-deleted excluded)
        g2 = requests.get(f"{API}/inspections/{fresh_inspection_id}", headers=admin_h)
        assert g2.status_code == 404

        # Second delete must also 404 (already soft-deleted)
        d2 = requests.delete(f"{API}/inspections/{fresh_inspection_id}", headers=admin_h)
        assert d2.status_code == 404

    def test_deleted_not_in_lists(self, admin_h, fresh_inspection_id):
        # Listing
        r = requests.get(f"{API}/inspections", headers=admin_h, params={"limit": 500})
        assert r.status_code == 200
        ids = [i["id"] for i in r.json()]
        assert fresh_inspection_id not in ids

    def test_admin_delete_nonexistent_404(self, admin_h):
        r = requests.delete(f"{API}/inspections/nonexistent-id-12345", headers=admin_h)
        assert r.status_code == 404


# ---- Regression: SM login / RNC binding / station-names list ----

class TestRegression:
    def test_sm001_locked_to_rnc(self, sm_h):
        r = requests.get(f"{API}/auth/me", headers=sm_h)
        assert r.status_code == 200
        assert r.json()["station_name"] == "RNC"

    def test_sm_cannot_call_admin_endpoints(self, sm_h):
        r = requests.get(f"{API}/inspections/station-names", headers=sm_h)
        assert r.status_code == 403
        r2 = requests.get(f"{API}/reports/summary", headers=sm_h)
        assert r2.status_code == 403

    def test_share_link_creation(self, admin_h):
        r = requests.post(
            f"{API}/admin/share-links",
            headers=admin_h,
            json={"station_name": "TEST_REGRESSION_LINK"},
        )
        assert r.status_code == 200
        link = r.json()
        assert link["station_name"] == "TEST_REGRESSION_LINK"
        assert "token" in link
        # cleanup
        requests.delete(f"{API}/admin/share-links/{link['id']}", headers=admin_h)
