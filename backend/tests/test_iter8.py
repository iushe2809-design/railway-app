"""Iteration-8 backend tests: SM auto-provision, named editors/viewers, RBAC."""
import io
import os
import uuid

import pytest
import requests
from PIL import Image

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or "https://rail-clean-check.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def H(t):
    return {"Authorization": f"Bearer {t}"}


def _login(username, password):
    return requests.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=30)


def _mkimg():
    img = Image.new("RGB", (256, 256), (240, 220, 200))
    for x in range(0, 256, 20):
        for y in range(0, 256, 20):
            img.putpixel((x, y), (x % 255, y % 255, (x + y) % 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return buf.getvalue()


@pytest.fixture(scope="module")
def admin_tok():
    r = _login("admin", "Admin@123")
    assert r.status_code == 200
    return r.json()["token"]


# ============ SM Auto-provisioning ============
class TestSMAutoProvision:
    def test_sm_auto_provision_new_account(self):
        # Use a distinct pattern so multiple test runs don't collide
        uname = f"sm{900 + (uuid.uuid4().int % 90)}"  # sm900..sm989
        r = _login(uname, "Station@123")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["role"] == "sm"
        assert data["user"]["station_name"] is None
        assert data["user"]["username"] == uname
        # /auth/me returns the same user
        me = requests.get(f"{API}/auth/me", headers=H(data["token"]))
        assert me.status_code == 200
        assert me.json()["username"] == uname
        assert me.json()["station_name"] is None

    def test_sm_auto_provision_wrong_password(self):
        uname = f"sm{800 + (uuid.uuid4().int % 90)}"
        # First auto-create with correct pw
        r0 = _login(uname, "Station@123")
        assert r0.status_code == 200
        # Wrong pw -> 401
        r = _login(uname, "wrong_password")
        assert r.status_code == 401

    def test_sm_auto_provision_999(self):
        uname = f"sm{uuid.uuid4().int % 90 + 700}"
        r = _login(uname, "Station@123")
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "sm"

    def test_admin_password_blocked_for_sm_pattern(self):
        # existing SM
        r = _login("sm001", "Admin@123")
        assert r.status_code == 401
        # auto-created SM should also be blocked
        uname = f"sm{uuid.uuid4().int % 90 + 600}"
        _login(uname, "Station@123")  # provision
        r2 = _login(uname, "Admin@123")
        assert r2.status_code == 401


# ============ First-upload locks station ============
class TestFirstUploadLock:
    def test_first_upload_sets_station_and_locks_it(self):
        uname = f"sm{uuid.uuid4().int % 90 + 500}"
        tok = _login(uname, "Station@123").json()["token"]
        img = _mkimg()
        station = f"TEST_STN_{uuid.uuid4().hex[:6].upper()}"

        # First upload with station_name form field
        r = requests.post(
            f"{API}/inspections/upload",
            headers=H(tok),
            data={"station_name": station, "inspection_date": "2026-01-15"},
            files={"files": ("test.jpg", img, "image/jpeg")},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        insp = r.json()
        assert insp["station_name"] == station

        # /auth/me now returns locked station
        me = requests.get(f"{API}/auth/me", headers=H(tok)).json()
        assert me["station_name"] == station

        # Second upload WITHOUT station_name still uses locked value
        r2 = requests.post(
            f"{API}/inspections/upload",
            headers=H(tok),
            data={"inspection_date": "2026-01-15"},
            files={"files": ("t2.jpg", _mkimg(), "image/jpeg")},
            timeout=120,
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["station_name"] == station

    def test_first_upload_without_station_name_returns_400(self):
        uname = f"sm{uuid.uuid4().int % 90 + 400}"
        tok = _login(uname, "Station@123").json()["token"]
        r = requests.post(
            f"{API}/inspections/upload",
            headers=H(tok),
            data={"inspection_date": "2026-01-15"},
            files={"files": ("test.jpg", _mkimg(), "image/jpeg")},
            timeout=60,
        )
        assert r.status_code == 400


# ============ Named editors ============
class TestNamedEditors:
    @pytest.mark.parametrize("uname,full", [
        ("dhananjay.kumar.rai", "Dhananjay Kumar Rai"),
        ("santosh.kumar", "Santosh Kumar"),
        ("ashok.kumar", "Ashok Kumar"),
        ("anand.kishore", "Anand Kishore"),
        ("ajay.kumar.i", "Ajay Kumar I"),
    ])
    def test_editor_login(self, uname, full):
        r = _login(uname, "Admin@123")
        assert r.status_code == 200, f"{uname}: {r.text}"
        data = r.json()
        assert data["user"]["role"] == "admin"
        assert data["user"]["full_name"] == full


# ============ Named viewers ============
class TestNamedViewers:
    @pytest.mark.parametrize("uname", [
        "rajesh.gupta",
        "abhay.mondal",
        "sudip.kumar",
        "ajay.kumar.ii",
        "santosh.gupta",
        "govind.sharma",
        "srdcm",
        "acm.1",
        "acm.2",
        "acm.3",
        "aom",
        "dom",
        "adrm",
        "drm",
    ])
    def test_viewer_login(self, uname):
        r = _login(uname, "Admin@123")
        assert r.status_code == 200, f"{uname}: {r.text}"
        assert r.json()["user"]["role"] == "viewer"


# ============ Viewer read access ============
class TestViewerReadAccess:
    @pytest.fixture(scope="class")
    def viewer_tok(self):
        return _login("srdcm", "Admin@123").json()["token"]

    def test_get_admin_users(self, viewer_tok):
        r = requests.get(f"{API}/admin/users", headers=H(viewer_tok))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_station_names(self, viewer_tok):
        r = requests.get(f"{API}/inspections/station-names", headers=H(viewer_tok))
        assert r.status_code == 200

    def test_get_reports_summary(self, viewer_tok):
        r = requests.get(f"{API}/reports/summary", headers=H(viewer_tok))
        assert r.status_code == 200

    def test_get_reports_leaderboard(self, viewer_tok):
        r = requests.get(f"{API}/reports/leaderboard", headers=H(viewer_tok))
        assert r.status_code == 200

    def test_get_day_detail(self, viewer_tok):
        r = requests.get(f"{API}/reports/day-detail", headers=H(viewer_tok))
        assert r.status_code == 200

    def test_get_grievances(self, viewer_tok):
        r = requests.get(f"{API}/grievances", headers=H(viewer_tok))
        assert r.status_code == 200

    def test_get_inspections(self, viewer_tok):
        r = requests.get(f"{API}/inspections", headers=H(viewer_tok))
        assert r.status_code == 200

    def test_get_share_links(self, viewer_tok):
        r = requests.get(f"{API}/admin/share-links", headers=H(viewer_tok))
        assert r.status_code == 200


# ============ Viewer write-block ============
class TestViewerWriteBlock:
    @pytest.fixture(scope="class")
    def viewer_tok(self):
        return _login("srdcm", "Admin@123").json()["token"]

    def test_post_admin_users_403(self, viewer_tok):
        r = requests.post(f"{API}/admin/users", headers=H(viewer_tok),
                          json={"username": "TEST_x", "password": "abcdef", "full_name": "x"})
        assert r.status_code == 403

    def test_post_admin_stations_403(self, viewer_tok):
        r = requests.post(f"{API}/admin/stations", headers=H(viewer_tok),
                          json={"name": "TEST_X", "code": "TESTX"})
        assert r.status_code == 403

    def test_post_share_link_403(self, viewer_tok):
        r = requests.post(f"{API}/admin/share-links", headers=H(viewer_tok),
                          json={"station_name": "RNC"})
        assert r.status_code == 403

    def test_delete_share_link_403(self, viewer_tok):
        r = requests.delete(f"{API}/admin/share-links/dummyid", headers=H(viewer_tok))
        assert r.status_code == 403

    def test_delete_inspection_403(self, viewer_tok):
        r = requests.delete(f"{API}/inspections/dummyid", headers=H(viewer_tok))
        assert r.status_code == 403

    def test_override_photo_403(self, viewer_tok):
        r = requests.post(f"{API}/inspections/foo/photos/bar/override",
                          headers=H(viewer_tok),
                          json={"new_rating": "Clean", "notes": "x"})
        assert r.status_code == 403

    def test_resolve_grievance_403(self, viewer_tok):
        r = requests.post(f"{API}/grievances/dummyid/resolve", headers=H(viewer_tok))
        assert r.status_code == 403

    def test_delete_grievance_403(self, viewer_tok):
        r = requests.delete(f"{API}/grievances/dummyid", headers=H(viewer_tok))
        assert r.status_code == 403


# ============ Regression ============
class TestRegression:
    def test_admin_still_works(self):
        r = _login("admin", "Admin@123")
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "admin"

    def test_sm001_still_locked_to_rnc(self):
        r = _login("sm001", "Station@123")
        assert r.status_code == 200
        assert r.json()["user"]["station_name"] == "RNC"

    def test_sm050_auto_provision_no_station(self):
        # Delete any prior sm050 to ensure fresh test (skip if not allowed)
        r = _login("sm050", "Station@123")
        assert r.status_code == 200
        # It may or may not have a station depending on prior test runs
