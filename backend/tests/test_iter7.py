"""Iteration-7 backend tests: change-credentials, grievances, day-detail, reports pie filter."""
import os
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "https://rail-clean-check.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"


def _login(username, password):
    r = requests.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def admin_tok():
    return _login("admin", "Admin@123")["token"]


@pytest.fixture(scope="module")
def sm001_tok():
    return _login("sm001", "Station@123")["token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


# ---------- change credentials (use sm045 to avoid disturbing sm001) ----------
class TestChangeCredentials:
    def test_wrong_current_password(self):
        tok = _login("sm045", "Station@123")["token"]
        r = requests.post(f"{API}/auth/change-credentials",
                          headers=H(tok),
                          json={"current_password": "WRONG", "new_username": "sm045x"})
        assert r.status_code == 400

    def test_username_too_short(self):
        tok = _login("sm045", "Station@123")["token"]
        r = requests.post(f"{API}/auth/change-credentials",
                          headers=H(tok),
                          json={"current_password": "Station@123", "new_username": "ab"})
        assert r.status_code == 400

    def test_password_too_short(self):
        tok = _login("sm045", "Station@123")["token"]
        r = requests.post(f"{API}/auth/change-credentials",
                          headers=H(tok),
                          json={"current_password": "Station@123", "new_password": "abc"})
        assert r.status_code == 400

    def test_username_collision(self):
        tok = _login("sm045", "Station@123")["token"]
        r = requests.post(f"{API}/auth/change-credentials",
                          headers=H(tok),
                          json={"current_password": "Station@123", "new_username": "sm001"})
        assert r.status_code == 400

    def test_change_username_and_password_then_revert(self):
        tok = _login("sm045", "Station@123")["token"]
        # change to myjaa + newpass
        r = requests.post(f"{API}/auth/change-credentials",
                          headers=H(tok),
                          json={"current_password": "Station@123",
                                "new_username": "myjaa",
                                "new_password": "NewPass@123"})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["changed"] is True
        assert "token" in j and j["user"]["username"] == "myjaa"
        new_tok = j["token"]
        # verify /auth/me returns new username
        me = requests.get(f"{API}/auth/me", headers=H(new_tok))
        assert me.status_code == 200
        assert me.json()["username"] == "myjaa"
        # re-login with new creds
        relogin = _login("myjaa", "NewPass@123")
        assert relogin["user"]["username"] == "myjaa"
        # revert both back to sm045 / Station@123
        r2 = requests.post(f"{API}/auth/change-credentials",
                           headers=H(relogin["token"]),
                           json={"current_password": "NewPass@123",
                                 "new_username": "sm045",
                                 "new_password": "Station@123"})
        assert r2.status_code == 200
        # verify we can log back in with original creds
        _login("sm045", "Station@123")


# ---------- Grievances ----------
class TestGrievances:
    def test_sm_create_and_only_own_visible(self, sm001_tok):
        payload = {"station_name": "RNC", "message": "TEST_grievance_iter7 broken bench"}
        r = requests.post(f"{API}/grievances", headers=H(sm001_tok), json=payload)
        assert r.status_code == 200, r.text
        g = r.json()
        assert g["role"] == "sm"
        assert g["submitted_by_username"] == "sm001"
        assert g["resolved"] is False
        gid = g["id"]

        # SM sees own only
        lst = requests.get(f"{API}/grievances", headers=H(sm001_tok)).json()
        ids = [x["id"] for x in lst]
        assert gid in ids
        assert all(x["submitted_by_username"] == "sm001" for x in lst)

    def test_sm_resolve_forbidden(self, sm001_tok, admin_tok):
        # create via sm
        r = requests.post(f"{API}/grievances", headers=H(sm001_tok),
                          json={"station_name": "RNC", "message": "TEST_iter7 sm403"})
        gid = r.json()["id"]
        r2 = requests.post(f"{API}/grievances/{gid}/resolve", headers=H(sm001_tok))
        assert r2.status_code == 403
        r3 = requests.delete(f"{API}/grievances/{gid}", headers=H(sm001_tok))
        assert r3.status_code == 403
        # admin resolves
        r4 = requests.post(f"{API}/grievances/{gid}/resolve", headers=H(admin_tok))
        assert r4.status_code == 200

    def test_admin_sees_all_and_filter(self, admin_tok, sm001_tok):
        all_g = requests.get(f"{API}/grievances", headers=H(admin_tok)).json()
        assert isinstance(all_g, list) and len(all_g) >= 1
        # include_resolved=False
        open_only = requests.get(f"{API}/grievances?include_resolved=false", headers=H(admin_tok)).json()
        assert all(x["resolved"] is False for x in open_only)

    def test_empty_message_rejected(self, sm001_tok):
        r = requests.post(f"{API}/grievances", headers=H(sm001_tok),
                          json={"station_name": "RNC", "message": "   "})
        assert r.status_code == 400

    def test_admin_delete(self, admin_tok, sm001_tok):
        r = requests.post(f"{API}/grievances", headers=H(sm001_tok),
                          json={"station_name": "RNC", "message": "TEST_iter7 to_delete"})
        gid = r.json()["id"]
        d = requests.delete(f"{API}/grievances/{gid}", headers=H(admin_tok))
        assert d.status_code == 200
        # verify soft-deleted (not in admin list)
        lst = requests.get(f"{API}/grievances", headers=H(admin_tok)).json()
        assert gid not in [x["id"] for x in lst]


# ---------- day-detail ----------
class TestDayDetail:
    def test_admin_day_detail_shape(self, admin_tok):
        r = requests.get(f"{API}/reports/day-detail", headers=H(admin_tok))
        assert r.status_code == 200
        j = r.json()
        for k in ["date", "stations", "uploaders", "stations_count", "photos_count"]:
            assert k in j
        assert isinstance(j["stations"], list)
        assert isinstance(j["uploaders"], list)

    def test_sm_forbidden(self, sm001_tok):
        r = requests.get(f"{API}/reports/day-detail", headers=H(sm001_tok))
        assert r.status_code == 403


# ---------- reports summary date filter (for pie) ----------
class TestReportsSummaryDateFilter:
    def test_summary_supports_date_range(self, admin_tok):
        today = datetime.now(timezone.utc).date().isoformat()
        r = requests.get(f"{API}/reports/summary?date_from={today}&date_to={today}",
                         headers=H(admin_tok))
        assert r.status_code == 200
        j = r.json()
        # should contain rating counts (Clean / Need Attention)
        assert "rating_counts" in j or "clean_count" in j or "total_photos" in j


# ---------- Regression: sm001 locked to RNC ----------
class TestRegression:
    def test_sm001_locked_to_RNC(self, sm001_tok):
        # small valid JPEG
        import base64
        jpeg = base64.b64decode(
            "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q=="
        )
        files = {"files": ("t.jpg", jpeg, "image/jpeg")}
        data = {"station_name": "MURI"}  # try to spoof
        r = requests.post(f"{API}/inspections/upload", headers=H(sm001_tok),
                          files=files, data=data, timeout=60)
        assert r.status_code == 200, r.text
        assert r.json()["station_name"] == "RNC"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
