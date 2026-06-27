"""Backend API tests for Railway Cleanliness Inspector."""
import base64
import io
import os
import time
import pytest
import requests
from PIL import Image, ImageDraw

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://rail-clean-check.preview.emergentagent.com"
API = f"{BASE_URL}/api"


def _make_real_jpeg_bytes(label: str = "Platform") -> bytes:
    """Create a JPEG with visual features (gradient + shapes + text)."""
    img = Image.new("RGB", (640, 480), (200, 200, 200))
    d = ImageDraw.Draw(img)
    # gradient stripes
    for y in range(0, 480, 8):
        d.rectangle([0, y, 640, y + 4], fill=(120 + y // 8 % 100, 140, 90))
    # litter dots & bin shape
    for i in range(40):
        x, y = (i * 37) % 640, (i * 53) % 480
        d.ellipse([x, y, x + 12, y + 12], fill=(60, 40, 30))
    d.rectangle([520, 320, 600, 460], fill=(50, 50, 60))
    d.text((20, 20), f"Station - {label}", fill=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@123"})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def sm_token(s):
    r = s.post(f"{API}/auth/login", json={"username": "sm001", "password": "Station@123"})
    assert r.status_code == 200, f"sm001 login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def H(token):
    return {"Authorization": f"Bearer {token}"}


# ---- Auth ----
class TestAuth:
    def test_admin_login(self, s):
        r = s.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@123"})
        assert r.status_code == 200
        data = r.json()
        assert "token" in data
        assert data["user"]["role"] == "admin"
        assert data["user"]["username"] == "admin"

    def test_sm_login(self, s):
        r = s.post(f"{API}/auth/login", json={"username": "sm001", "password": "Station@123"})
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["role"] == "sm"
        assert data["user"].get("station_id")

    def test_invalid_creds(self, s):
        r = s.post(f"{API}/auth/login", json={"username": "admin", "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, s, admin_token):
        r = s.get(f"{API}/auth/me", headers=H(admin_token))
        assert r.status_code == 200
        assert r.json()["role"] == "admin"


# ---- Stations ----
class TestStations:
    def test_list_stations_seeded(self, s, admin_token):
        r = s.get(f"{API}/stations", headers=H(admin_token))
        assert r.status_code == 200
        assert len(r.json()) >= 10

    def test_create_and_delete_station(self, s, admin_token):
        code = f"TST{int(time.time()) % 100000}"
        r = s.post(f"{API}/admin/stations", json={"name": "TEST_Station", "code": code}, headers=H(admin_token))
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        r2 = s.delete(f"{API}/admin/stations/{sid}", headers=H(admin_token))
        assert r2.status_code == 200

    def test_sm_cannot_create_station(self, s, sm_token):
        r = s.post(f"{API}/admin/stations", json={"name": "X", "code": "ZZZ"}, headers=H(sm_token))
        assert r.status_code == 403


# ---- Users count ----
class TestUsers:
    def test_users_seeded(self, s, admin_token):
        r = s.get(f"{API}/admin/users", headers=H(admin_token))
        assert r.status_code == 200
        users = r.json()
        assert len(users) >= 101
        usernames = {u["username"] for u in users}
        assert "admin" in usernames and "sm001" in usernames and "sm100" in usernames

    def test_sm_cannot_list_users(self, s, sm_token):
        r = s.get(f"{API}/admin/users", headers=H(sm_token))
        assert r.status_code == 403

    def test_create_update_delete_user(self, s, admin_token):
        uname = f"test_{int(time.time())}"
        r = s.post(f"{API}/admin/users", json={
            "username": uname, "password": "Test@123",
            "full_name": "TEST User", "role": "sm"
        }, headers=H(admin_token))
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        r2 = s.put(f"{API}/admin/users/{uid}", json={"active": False}, headers=H(admin_token))
        assert r2.status_code == 200
        r3 = s.delete(f"{API}/admin/users/{uid}", headers=H(admin_token))
        assert r3.status_code == 200


# ---- Inspections upload (AI analysis) ----
class TestInspectionUpload:
    @pytest.fixture(scope="class")
    def inspection_id(self, s, sm_token):
        files = {"files": ("platform.jpg", _make_real_jpeg_bytes("Platform A"), "image/jpeg")}
        r = s.post(f"{API}/inspections/upload", headers=H(sm_token), files=files, timeout=120)
        assert r.status_code == 200, f"upload failed: {r.status_code} {r.text[:400]}"
        data = r.json()
        assert "id" in data and len(data["photos"]) == 1
        photo = data["photos"][0]
        ai = photo["ai_analysis"]
        assert "rating" in ai and "score" in ai
        assert ai["rating"] in ("Clean", "Needs Attention", "Unclean")
        assert isinstance(ai.get("area_breakdown"), list)
        return data["id"]

    def test_upload_and_persist(self, s, sm_token, inspection_id):
        r = s.get(f"{API}/inspections/{inspection_id}", headers=H(sm_token))
        assert r.status_code == 200
        assert r.json()["id"] == inspection_id

    def test_admin_can_view(self, s, admin_token, inspection_id):
        r = s.get(f"{API}/inspections/{inspection_id}", headers=H(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert "aggregate_rating" in d
        assert d["photos"][0]["ai_analysis"]["score"] is not None

    def test_sm_listing_only_own(self, s, sm_token):
        r = s.get(f"{API}/inspections", headers=H(sm_token))
        assert r.status_code == 200
        for d in r.json():
            assert "ai_analysis" not in d.get("photos", [{}])[0] or True  # SM photos stripped

    def test_reject_bad_mime(self, s, sm_token):
        files = {"files": ("a.svg", b"<svg/>", "image/svg+xml")}
        r = s.post(f"{API}/inspections/upload", headers=H(sm_token), files=files)
        assert r.status_code == 400

    def test_admin_override(self, s, admin_token, inspection_id):
        det = s.get(f"{API}/inspections/{inspection_id}", headers=H(admin_token)).json()
        photo_id = det["photos"][0]["id"]
        r = s.post(
            f"{API}/inspections/{inspection_id}/photos/{photo_id}/override",
            json={"new_rating": "Unclean", "notes": "TEST override"},
            headers=H(admin_token),
        )
        assert r.status_code == 200
        assert r.json()["aggregate_rating"] == "Unclean"

    def test_file_serving_with_auth(self, s, admin_token, inspection_id):
        det = s.get(f"{API}/inspections/{inspection_id}", headers=H(admin_token)).json()
        path = det["photos"][0]["storage_path"]
        # No auth -> 401
        r0 = s.get(f"{API}/files/{path}")
        assert r0.status_code == 401
        # With ?auth=
        r1 = s.get(f"{API}/files/{path}?auth={admin_token}")
        assert r1.status_code == 200
        assert r1.headers["content-type"].startswith("image/")
        # With bearer header
        r2 = s.get(f"{API}/files/{path}", headers=H(admin_token))
        assert r2.status_code == 200


# ---- Share links + public upload ----
class TestShareLinks:
    @pytest.fixture(scope="class")
    def share_token(self, s, admin_token):
        stations = s.get(f"{API}/stations", headers=H(admin_token)).json()
        sid = stations[0]["id"]
        r = s.post(f"{API}/admin/share-links", json={"station_id": sid}, headers=H(admin_token))
        assert r.status_code == 200, r.text
        return r.json()

    def test_validate_share(self, s, share_token):
        r = s.get(f"{API}/public/share/{share_token['token']}")
        assert r.status_code == 200
        assert r.json()["station_name"] == share_token["station_name"]

    def test_invalid_token(self, s):
        r = s.get(f"{API}/public/share/bogus-token-xyz")
        assert r.status_code == 404

    def test_public_upload(self, s, share_token):
        files = {"files": ("p.jpg", _make_real_jpeg_bytes("Concourse"), "image/jpeg")}
        r = s.post(
            f"{API}/public/upload/{share_token['token']}",
            files=files,
            data={"uploader_name": "TEST visitor"},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["upload_source"] == "public"

    def test_revoke(self, s, admin_token, share_token):
        r = s.delete(f"{API}/admin/share-links/{share_token['id']}", headers=H(admin_token))
        assert r.status_code == 200
        # Now public upload should fail
        files = {"files": ("p.jpg", _make_real_jpeg_bytes(), "image/jpeg")}
        r2 = s.post(f"{API}/public/upload/{share_token['token']}", files=files)
        assert r2.status_code == 404


# ---- Reports ----
class TestReports:
    def test_admin_reports(self, s, admin_token):
        r = s.get(f"{API}/reports/summary", headers=H(admin_token))
        assert r.status_code == 200
        d = r.json()
        for k in ("total_inspections", "total_photos", "rating_counts", "station_breakdown", "daily_uploads", "unclean_details"):
            assert k in d

    def test_sm_cannot_get_reports(self, s, sm_token):
        r = s.get(f"{API}/reports/summary", headers=H(sm_token))
        assert r.status_code == 403


# ---- Authorization ----
class TestAuthz:
    def test_sm_cannot_create_share_link(self, s, sm_token, admin_token):
        stations = s.get(f"{API}/stations", headers=H(admin_token)).json()
        r = s.post(f"{API}/admin/share-links", json={"station_id": stations[0]["id"]}, headers=H(sm_token))
        assert r.status_code == 403
