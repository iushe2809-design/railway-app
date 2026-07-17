"""Main FastAPI server for Railway Station Cleanliness AI Inspector."""
import asyncio
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, List, Optional

from dotenv import load_dotenv
from fastapi import (
    APIRouter,
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Response,
    UploadFile,
)
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from auth import (  # noqa: E402
    create_token,
    decode_token,
    hash_password,
    require_admin,
    require_auth_factory,
    require_staff,
    verify_password,
)
from ai_service import analyze_image, normalize_image  # noqa: E402
from storage import APP_NAME, get_object, init_storage, put_object  # noqa: E402

# MongoDB connection
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]


def _db():
    return db


require_user = require_auth_factory(_db)

app = FastAPI(title="Railway Cleanliness Inspector")
api_router = APIRouter(prefix="/api")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# ============ Models ============


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangeCredentialsRequest(BaseModel):
    new_username: Optional[str] = None
    new_password: Optional[str] = None
    current_password: str


class GrievanceCreate(BaseModel):
    station_name: str
    message: str


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: str = "sm"  # "sm" or "admin"
    station_id: Optional[str] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    station_id: Optional[str] = None
    active: Optional[bool] = None


class StationCreate(BaseModel):
    name: str
    code: str


class OverrideRequest(BaseModel):
    new_rating: str  # "Clean" | "Needs Attention" | "Unclean"
    notes: str


class ShareLinkCreate(BaseModel):
    station_name: str


# ============ Helpers ============


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "username": user["username"],
        "full_name": user["full_name"],
        "role": user["role"],
        "station_id": user.get("station_id"),
        "station_name": user.get("station_name"),
        "active": user.get("active", True),
    }


async def aggregate_inspection(photos: List[dict]) -> tuple[int, str]:
    if not photos:
        return 0, "Need Attention"
    # Use effective score (override overrides AI)
    scores = []
    for p in photos:
        if p.get("override") and p["override"].get("score") is not None:
            scores.append(p["override"]["score"])
        else:
            scores.append(p["ai_analysis"].get("score", 0))
    avg = int(sum(scores) / len(scores))
    rating = "Clean" if avg >= 80 else "Need Attention"
    return avg, rating


# ============ Auth Endpoints ============


import re as _re_login


@api_router.post("/auth/login")
async def login(req: LoginRequest):
    username = req.username.lower().strip()
    password = req.password

    # SM auto-provision: usernames matching sm\d+ with Station@123 create the
    # account on-the-fly (station_name is set on first upload).
    is_sm_pattern = bool(_re_login.match(r"^sm\d{1,5}$", username))
    if is_sm_pattern and password == "Station@123":
        existing = await db.users.find_one({"username": username}, {"_id": 0})
        if not existing:
            await db.users.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "username": username,
                    "password_hash": hash_password("Station@123"),
                    "full_name": f"SM {username.upper()}",
                    "role": "sm",
                    "station_id": None,
                    "station_name": None,  # will be set on first upload
                    "active": True,
                    "created_at": now_iso(),
                }
            )
            logger.info(f"Auto-created SM account: {username}")

    user = await db.users.find_one({"username": username}, {"_id": 0})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # SM usernames MUST NOT be able to log in with Admin@123.
    if username.startswith("sm") and password == "Admin@123":
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Named accounts (editors + viewers) can log in with EITHER their normal
    # Admin@123 (→ admin/viewer role) OR Station@123 (→ SM upload mode). The
    # Station@123 branch bypasses the stored password hash intentionally so
    # named officials can act as an SM without a second account.
    is_named = user["role"] in ("admin", "viewer") and not username.startswith("sm")
    if is_named and password == "Station@123":
        token = create_token(user["id"], "sm", mode="sm")
        acting = {**user, "role": "sm", "station_name": None}
        return {"token": token, "user": public_user(acting)}

    if not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token(user["id"], user["role"])
    return {"token": token, "user": public_user(user)}


@api_router.get("/auth/me")
async def me(user: Annotated[dict, Depends(require_user)]):
    return public_user(user)


@api_router.post("/auth/change-credentials")
async def change_credentials(
    payload: ChangeCredentialsRequest,
    user: Annotated[dict, Depends(require_user)],
):
    """Self-service username/password update. Requires current password."""
    if not verify_password(payload.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    updates: dict = {}
    if payload.new_username:
        new_u = payload.new_username.lower().strip()
        if not new_u or len(new_u) < 3:
            raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
        if new_u != user["username"] and await db.users.find_one({"username": new_u}):
            raise HTTPException(status_code=400, detail="Username already taken")
        updates["username"] = new_u
    if payload.new_password:
        if len(payload.new_password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        updates["password_hash"] = hash_password(payload.new_password)
    if not updates:
        return {"ok": True, "changed": False}
    await db.users.update_one({"id": user["id"]}, {"$set": updates})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    token = create_token(fresh["id"], fresh["role"])
    return {"ok": True, "changed": True, "token": token, "user": public_user(fresh)}


# ============ Station Endpoints ============


@api_router.get("/stations")
async def list_stations(user: Annotated[dict, Depends(require_user)]):
    stations = await db.stations.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    return stations


@api_router.post("/admin/stations")
async def create_station(
    payload: StationCreate, user: Annotated[dict, Depends(require_user)]
):
    require_admin(user)
    code = payload.code.upper().strip()
    if await db.stations.find_one({"code": code}):
        raise HTTPException(status_code=400, detail="Station code already exists")
    station = {
        "id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "code": code,
        "created_at": now_iso(),
    }
    await db.stations.insert_one(station)
    return {k: v for k, v in station.items() if k != "_id"}


@api_router.delete("/admin/stations/{station_id}")
async def delete_station(
    station_id: str, user: Annotated[dict, Depends(require_user)]
):
    require_admin(user)
    res = await db.stations.delete_one({"id": station_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Station not found")
    return {"ok": True}


# ============ User Management ============


@api_router.get("/admin/users")
async def list_users(user: Annotated[dict, Depends(require_user)]):
    require_staff(user)
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("username", 1).to_list(500)
    return users


@api_router.post("/admin/users")
async def create_user(
    payload: UserCreate, user: Annotated[dict, Depends(require_user)]
):
    require_admin(user)
    username = payload.username.lower().strip()
    if await db.users.find_one({"username": username}):
        raise HTTPException(status_code=400, detail="Username already exists")
    station_name = None
    if payload.station_id:
        st = await db.stations.find_one({"id": payload.station_id}, {"_id": 0})
        if not st:
            raise HTTPException(status_code=400, detail="Station not found")
        station_name = st["name"]
    new_user = {
        "id": str(uuid.uuid4()),
        "username": username,
        "password_hash": hash_password(payload.password),
        "full_name": payload.full_name.strip(),
        "role": payload.role if payload.role in ("admin", "sm") else "sm",
        "station_id": payload.station_id,
        "station_name": station_name,
        "active": True,
        "created_at": now_iso(),
    }
    await db.users.insert_one(new_user)
    return public_user(new_user)


@api_router.put("/admin/users/{user_id}")
async def update_user(
    user_id: str,
    payload: UserUpdate,
    user: Annotated[dict, Depends(require_user)],
):
    require_admin(user)
    updates = {}
    if payload.full_name is not None:
        updates["full_name"] = payload.full_name
    if payload.password:
        updates["password_hash"] = hash_password(payload.password)
    if payload.role in ("admin", "sm"):
        updates["role"] = payload.role
    if payload.station_id is not None:
        if payload.station_id:
            st = await db.stations.find_one({"id": payload.station_id}, {"_id": 0})
            if not st:
                raise HTTPException(status_code=400, detail="Station not found")
            updates["station_id"] = payload.station_id
            updates["station_name"] = st["name"]
        else:
            updates["station_id"] = None
            updates["station_name"] = None
    if payload.active is not None:
        updates["active"] = payload.active
    if not updates:
        return {"ok": True}
    res = await db.users.update_one({"id": user_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


@api_router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, user: Annotated[dict, Depends(require_user)]):
    require_admin(user)
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    res = await db.users.delete_one({"id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


# ============ Share Links ============


@api_router.get("/admin/share-links")
async def list_share_links(user: Annotated[dict, Depends(require_user)]):
    require_staff(user)
    links = await db.share_links.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return links


@api_router.post("/admin/share-links")
async def create_share_link(
    payload: ShareLinkCreate, user: Annotated[dict, Depends(require_user)]
):
    require_admin(user)
    name = (payload.station_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Station name is required")
    link = {
        "id": str(uuid.uuid4()),
        "token": secrets.token_urlsafe(16),
        "station_id": None,
        "station_name": name,
        "created_at": now_iso(),
        "created_by": user["id"],
        "active": True,
    }
    await db.share_links.insert_one(link)
    return {k: v for k, v in link.items() if k != "_id"}


@api_router.delete("/admin/share-links/{link_id}")
async def revoke_share_link(
    link_id: str, user: Annotated[dict, Depends(require_user)]
):
    require_admin(user)
    res = await db.share_links.update_one(
        {"id": link_id}, {"$set": {"active": False}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Link not found")
    return {"ok": True}


@api_router.get("/public/share/{token}")
async def validate_share_link(token: str):
    link = await db.share_links.find_one({"token": token, "active": True}, {"_id": 0})
    if not link:
        raise HTTPException(status_code=404, detail="Invalid or expired link")
    return {
        "station_id": link["station_id"],
        "station_name": link["station_name"],
        "token": token,
    }


# ============ Upload & Analyze ============

ALLOWED_MIMES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/gif",
    "image/bmp",
    "image/tiff",
}


async def _calibration_for_station(station_name: str, limit: int = 5) -> list:
    """Recent supervisor overrides at this station — used to teach the AI."""
    docs = (
        await db.inspections.find(
            {
                "station_name": station_name,
                "is_deleted": False,
                "photos.override": {"$ne": None},
            },
            {"_id": 0, "photos": 1, "created_at": 1},
        )
        .sort("created_at", -1)
        .to_list(20)
    )
    examples = []
    for d in docs:
        for p in d.get("photos", []):
            ov = p.get("override")
            ai = p.get("ai_analysis") or {}
            if not ov:
                continue
            examples.append(
                {
                    "ai_rating": ai.get("rating"),
                    "ai_score": ai.get("score"),
                    "override_rating": ov.get("rating"),
                    "notes": ov.get("notes"),
                }
            )
            if len(examples) >= limit:
                return examples
    return examples


async def _save_inspection(
    station_id: Optional[str],
    station_name: str,
    uploaded_by_id: Optional[str],
    uploaded_by_name: str,
    upload_source: str,
    files: List[UploadFile],
    inspection_date: Optional[str] = None,
) -> dict:
    if len(files) != 5:
    raise HTTPException(
        status_code=400,
        detail="Exactly 5 photos are required for every inspection."
    )
    photos = []
    calibration = await _calibration_for_station(station_name)
    for f in files:
        content_type = (f.content_type or "").lower()
        if content_type not in ALLOWED_MIMES and not content_type.startswith("image/"):
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {content_type or 'unknown'}. Please upload an image.",
            )
        data = await f.read()
        if len(data) > 25 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large (max 25MB)")
        # Normalize to JPEG if needed (HEIC, BMP, TIFF, GIF, very large -> JPEG)
        norm_bytes, norm_ct = normalize_image(data, content_type)
        ext = norm_ct.split("/")[-1].replace("jpeg", "jpg")
        slug = re.sub(r"[^a-z0-9]+", "-", station_name.lower())[:40] or "station"
        path = f"{APP_NAME}/stations/{slug}/{uuid.uuid4()}.{ext}"
        result = put_object(path, norm_bytes, norm_ct)
        # Run AI analysis with station-specific calibration
        try:
            ai = await analyze_image(
                norm_bytes,
                norm_ct,
                station_name=station_name,
                calibration_examples=calibration,
            )
        except Exception as e:
            logger.exception(f"AI analysis failed: {e}")
            ai = {
                "rating": "Needs Attention",
                "score": 50,
                "area_detected": "Unknown",
                "area_breakdown": [],
                "issues": [f"AI analysis error: {str(e)[:120]}"],
                "recommendations": ["Retry analysis later"],
            }
        photos.append(
            {
                "id": str(uuid.uuid4()),
                "storage_path": result["path"],
                "original_filename": f.filename,
                "content_type": norm_ct,
                "size": result.get("size", len(norm_bytes)),
                "ai_analysis": ai,
                "override": None,
                "uploaded_at": now_iso(),
            }
        )

    score, rating = await aggregate_inspection(photos)
    today_iso_date = datetime.now(timezone.utc).date().isoformat()
    insp_date = (inspection_date or today_iso_date).strip()
    inspection = {
        "id": str(uuid.uuid4()),
        "station_id": station_id,
        "station_name": station_name.strip(),
        "uploaded_by_id": uploaded_by_id,
        "uploaded_by_name": uploaded_by_name,
        "upload_source": upload_source,  # "sm" or "public"
        "photos": photos,
        "aggregate_score": score,
        "aggregate_rating": rating,
        "inspection_date": insp_date,
        "created_at": now_iso(),
        "is_deleted": False,
    }
    await db.inspections.insert_one(inspection)
    return {k: v for k, v in inspection.items() if k != "_id"}


@api_router.post("/inspections/upload")
async def upload_inspection(
    user: Annotated[dict, Depends(require_user)],
    files: List[UploadFile] = File(...),
    station_name: Optional[str] = Form(None),
    inspection_date: Optional[str] = Form(None),
):
    # SMs always upload for THEIR assigned station. First-time upload from an
    # auto-provisioned SM (station_name is empty) locks in the value they submit.
    if user["role"] == "sm":
        assigned = user.get("station_name")
        if not assigned:
            if not station_name or not station_name.strip():
                raise HTTPException(
                    status_code=400,
                    detail="Enter your station name on this first upload — it will be locked to your account.",
                )
            effective_station = station_name.strip()
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {"station_name": effective_station}},
            )
            logger.info(f"Locked station '{effective_station}' to SM {user['username']}")
        else:
            effective_station = assigned
    else:
        if not station_name or not station_name.strip():
            raise HTTPException(status_code=400, detail="Station name is required")
        effective_station = station_name.strip()
    return await _save_inspection(
        station_id=None,
        station_name=effective_station,
        uploaded_by_id=user["id"],
        uploaded_by_name=user["full_name"],
        upload_source="sm" if user["role"] == "sm" else "admin",
        files=files,
        inspection_date=inspection_date,
    )


@api_router.post("/public/upload/{token}")
async def public_upload(
    token: str,
    files: List[UploadFile] = File(...),
    uploader_name: str = Form("Anonymous"),
    inspection_date: Optional[str] = Form(None),
):
    link = await db.share_links.find_one({"token": token, "active": True}, {"_id": 0})
    if not link:
        raise HTTPException(status_code=404, detail="Invalid or expired link")
    return await _save_inspection(
        station_id=link.get("station_id"),
        station_name=link["station_name"],
        uploaded_by_id=None,
        uploaded_by_name=f"Public: {uploader_name.strip()[:50]}",
        upload_source="public",
        files=files,
        inspection_date=inspection_date,
    )


# ============ Inspection list / detail / override ============


@api_router.get("/inspections/station-names")
async def list_station_names(user: Annotated[dict, Depends(require_user)]):
    """Distinct station names taken from actual SM submissions (admin filter use)."""
    require_staff(user)
    names = await db.inspections.distinct("station_name", {"is_deleted": False})
    names = sorted([n for n in names if n])
    return names


@api_router.get("/inspections")
async def list_inspections(
    user: Annotated[dict, Depends(require_user)],
    station_name: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    rating: Optional[str] = None,
    limit: int = 200,
):
    query: dict = {"is_deleted": False}
    # SM can only see their own; admin & viewer see all
    if user["role"] == "sm":
        query["uploaded_by_id"] = user["id"]
    if station_name:
        query["station_name"] = station_name
    if date_from or date_to:
        rng: dict = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        query["inspection_date"] = rng
    if rating:
        query["aggregate_rating"] = rating
    docs = (
        await db.inspections.find(query, {"_id": 0})
        .sort("created_at", -1)
        .to_list(limit)
    )
    # For SM, strip AI analysis details
    if user["role"] == "sm":
        for d in docs:
            d["photos"] = [
                {
                    "id": p["id"],
                    "storage_path": p["storage_path"],
                    "uploaded_at": p["uploaded_at"],
                }
                for p in d["photos"]
            ]
            d.pop("aggregate_score", None)
            d.pop("aggregate_rating", None)
    return docs


@api_router.get("/inspections/{inspection_id}")
async def get_inspection(
    inspection_id: str, user: Annotated[dict, Depends(require_user)]
):
    doc = await db.inspections.find_one(
        {"id": inspection_id, "is_deleted": False}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Inspection not found")
    if user["role"] == "sm" and doc.get("uploaded_by_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Not allowed")
    if user["role"] == "sm":
        doc["photos"] = [
            {
                "id": p["id"],
                "storage_path": p["storage_path"],
                "uploaded_at": p["uploaded_at"],
            }
            for p in doc["photos"]
        ]
        doc.pop("aggregate_score", None)
        doc.pop("aggregate_rating", None)
    return doc


@api_router.post("/inspections/{inspection_id}/photos/{photo_id}/override")
async def override_photo(
    inspection_id: str,
    photo_id: str,
    payload: OverrideRequest,
    user: Annotated[dict, Depends(require_user)],
):
    require_admin(user)
    rating_map = {"Clean": 90, "Need Attention": 60}
    if payload.new_rating not in rating_map:
        raise HTTPException(status_code=400, detail="Invalid rating")
    doc = await db.inspections.find_one({"id": inspection_id, "is_deleted": False})
    if not doc:
        raise HTTPException(status_code=404, detail="Inspection not found")
    photos = doc["photos"]
    found = False
    for p in photos:
        if p["id"] == photo_id:
            p["override"] = {
                "rating": payload.new_rating,
                "score": rating_map[payload.new_rating],
                "notes": payload.notes,
                "by_id": user["id"],
                "by_name": user["full_name"],
                "at": now_iso(),
            }
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Photo not found")
    score, rating = await aggregate_inspection(photos)
    await db.inspections.update_one(
        {"id": inspection_id},
        {
            "$set": {
                "photos": photos,
                "aggregate_score": score,
                "aggregate_rating": rating,
            }
        },
    )
    return {"ok": True, "aggregate_score": score, "aggregate_rating": rating}


@api_router.delete("/inspections/{inspection_id}")
async def delete_inspection(
    inspection_id: str, user: Annotated[dict, Depends(require_user)]
):
    """Admin-only soft delete of an inspection record."""
    require_admin(user)
    res = await db.inspections.update_one(
        {"id": inspection_id, "is_deleted": False},
        {
            "$set": {
                "is_deleted": True,
                "deleted_at": now_iso(),
                "deleted_by_id": user["id"],
                "deleted_by_name": user["full_name"],
            }
        },
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Inspection not found")
    return {"ok": True}


# ============ Grievances ============


@api_router.post("/grievances")
async def create_grievance(
    payload: GrievanceCreate, user: Annotated[dict, Depends(require_user)]
):
    if not payload.station_name.strip() or not payload.message.strip():
        raise HTTPException(status_code=400, detail="Station and message required")
    doc = {
        "id": str(uuid.uuid4()),
        "station_name": payload.station_name.strip(),
        "message": payload.message.strip(),
        "submitted_by_id": user["id"],
        "submitted_by_name": user["full_name"],
        "submitted_by_username": user["username"],
        "role": user["role"],
        "created_at": now_iso(),
        "is_deleted": False,
        "resolved": False,
    }
    await db.grievances.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api_router.get("/grievances")
async def list_grievances(
    user: Annotated[dict, Depends(require_user)],
    include_resolved: bool = True,
):
    query: dict = {"is_deleted": False}
    if user["role"] == "sm":
        query["submitted_by_id"] = user["id"]
    # admins and viewers see all grievances
    if not include_resolved:
        query["resolved"] = False
    docs = (
        await db.grievances.find(query, {"_id": 0})
        .sort("created_at", -1)
        .to_list(500)
    )
    return docs


@api_router.post("/grievances/{gid}/resolve")
async def resolve_grievance(gid: str, user: Annotated[dict, Depends(require_user)]):
    require_admin(user)
    res = await db.grievances.update_one(
        {"id": gid}, {"$set": {"resolved": True, "resolved_at": now_iso(), "resolved_by": user["id"]}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@api_router.delete("/grievances/{gid}")
async def delete_grievance(gid: str, user: Annotated[dict, Depends(require_user)]):
    require_admin(user)
    res = await db.grievances.update_one(
        {"id": gid}, {"$set": {"is_deleted": True}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


# ============ Today's uploads drill-down ============


@api_router.get("/reports/day-detail")
async def day_detail(
    user: Annotated[dict, Depends(require_user)],
    date: Optional[str] = None,
):
    """Per-station and per-SM upload counts for a single date (default = today).

    Response:
      {
        "date": "YYYY-MM-DD",
        "stations": [{"station_name": "RNC", "photos": 3, "inspections": 1}],
        "uploaders": [{"submitted_by_name": "SM RNC", "username": "sm001",
                       "station_name": "RNC", "photos": 3, "inspections": 1}],
        "stations_count": <int>,
        "photos_count": <int>,
      }
    """
    require_staff(user)
    d = date or datetime.now(timezone.utc).date().isoformat()
    docs = await db.inspections.find(
        {"is_deleted": False, "inspection_date": d}, {"_id": 0}
    ).to_list(4000)
    by_station: dict = {}
    by_uploader: dict = {}
    for doc in docs:
        sname = doc.get("station_name", "Unknown")
        st = by_station.setdefault(sname, {"station_name": sname, "photos": 0, "inspections": 0})
        st["photos"] += len(doc["photos"])
        st["inspections"] += 1
        uname = doc.get("uploaded_by_name") or "Anonymous"
        uid = doc.get("uploaded_by_id") or f"public-{sname}"
        up = by_uploader.setdefault(
            uid,
            {
                "submitted_by_name": uname,
                "username": None,
                "station_name": sname,
                "photos": 0,
                "inspections": 0,
            },
        )
        up["photos"] += len(doc["photos"])
        up["inspections"] += 1
    return {
        "date": d,
        "stations": sorted(by_station.values(), key=lambda x: -x["photos"]),
        "uploaders": sorted(by_uploader.values(), key=lambda x: -x["photos"]),
        "stations_count": len(by_station),
        "photos_count": sum(len(d["photos"]) for d in docs),
    }


# ============ Reports ============


@api_router.get("/reports/summary")
async def reports_summary(
    user: Annotated[dict, Depends(require_user)],
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    station_name: Optional[str] = None,
):
    require_staff(user)
    query: dict = {"is_deleted": False}
    if date_from or date_to:
        rng: dict = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        query["inspection_date"] = rng
    if station_name:
        query["station_name"] = station_name
    docs = await db.inspections.find(query, {"_id": 0}).to_list(4000)

    def _is_clean(rating: str, score: int) -> bool:
        # Global 2-tier rule: score >= 80 → Clean. Rating field is authoritative
        # when new; legacy "Unclean" is folded into Need Attention automatically.
        if rating == "Clean":
            return True
        return score >= 80

    total_inspections = len(docs)
    total_photos = sum(len(d["photos"]) for d in docs)
    counts = {"Clean": 0, "Need Attention": 0}
    by_station: dict = {}
    by_day: dict = {}
    unclean_details = []
    for d in docs:
        rating = d.get("aggregate_rating", "Need Attention")
        score = int(d.get("aggregate_score", 0))
        is_clean = _is_clean(rating, score)
        counts["Clean" if is_clean else "Need Attention"] += 1
        sname = d.get("station_name", "Unknown")
        if sname not in by_station:
            by_station[sname] = {
                "station_name": sname,
                "total": 0,
                "clean": 0,
                "need_attention": 0,
                "avg_score": 0,
                "_scores": [],
                "_days": set(),
            }
        bs = by_station[sname]
        bs["total"] += 1
        if is_clean:
            bs["clean"] += 1
        else:
            bs["need_attention"] += 1
        bs["_scores"].append(score)
        bs["_days"].add(d.get("inspection_date") or d["created_at"][:10])

        day = d.get("inspection_date") or d["created_at"][:10]
        by_day[day] = by_day.get(day, 0) + len(d["photos"])

        if not is_clean:
            issues = []
            for p in d["photos"]:
                ai = p.get("ai_analysis", {})
                issues.extend(ai.get("issues", []))
            unclean_details.append(
                {
                    "inspection_id": d["id"],
                    "station_name": sname,
                    "score": score,
                    "inspection_date": d.get("inspection_date") or d["created_at"][:10],
                    "created_at": d["created_at"],
                    "issues": issues[:8],
                }
            )

    station_breakdown = []
    for s in by_station.values():
        scores = s.pop("_scores")
        days = s.pop("_days")
        total = s["total"] or 1
        s["avg_score"] = int(sum(scores) / len(scores)) if scores else 0
        s["inspection_days"] = len(days)
        s["clean_pct"] = round((s["clean"] / total) * 100, 1)
        s["need_attention_pct"] = round((s["need_attention"] / total) * 100, 1)
        station_breakdown.append(s)
    station_breakdown.sort(key=lambda x: x["avg_score"])

    daily_uploads = [{"date": k, "photos": v} for k, v in sorted(by_day.items())]

    return {
        "total_inspections": total_inspections,
        "total_photos": total_photos,
        "rating_counts": counts,
        "station_breakdown": station_breakdown,
        "daily_uploads": daily_uploads,
        "unclean_details": unclean_details,
    }


@api_router.get("/reports/leaderboard")
async def reports_leaderboard(
    user: Annotated[dict, Depends(require_user)],
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    """Ranked station performance for the Dashboard best/worst callouts.

    Returns:
      - `overall`: all-time ranking (ignores date filter). Used for the live
        Best/Worst callouts.
      - `average`: within [date_from,date_to], per-station AVERAGE clean_pct
        across all uploads in the window, ranked desc.
      - `most_recent`: within the same window, per-station clean_pct of the
        SINGLE most recent upload, ranked desc.
    """
    require_staff(user)

    def _is_clean(doc):
        if doc.get("aggregate_rating") == "Clean":
            return True
        return int(doc.get("aggregate_score", 0)) >= 80

    async def _rank(query: dict) -> list:
        docs = await db.inspections.find(query, {"_id": 0}).to_list(4000)
        by_station: dict = {}
        for d in docs:
            sname = d.get("station_name", "Unknown")
            entry = by_station.setdefault(
                sname,
                {"station_name": sname, "total": 0, "clean": 0, "avg_score": 0, "_scores": []},
            )
            entry["total"] += 1
            if _is_clean(d):
                entry["clean"] += 1
            entry["_scores"].append(int(d.get("aggregate_score", 0)))
        out = []
        for e in by_station.values():
            scores = e.pop("_scores")
            total = e["total"] or 1
            e["clean_pct"] = round((e["clean"] / total) * 100, 1)
            e["avg_score"] = int(sum(scores) / len(scores)) if scores else 0
            out.append(e)
        out.sort(key=lambda x: (-x["clean_pct"], -x["avg_score"]))
        return out

    # Overall (all time, no date filter)
    overall = await _rank({"is_deleted": False})

    # Windowed (average across window)
    win_q: dict = {"is_deleted": False}
    if date_from or date_to:
        rng: dict = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        win_q["inspection_date"] = rng
    average = await _rank(win_q)

    # Most-recent upload per station within window
    docs = (
        await db.inspections.find(win_q, {"_id": 0})
        .sort("created_at", -1)
        .to_list(4000)
    )
    seen: dict = {}
    for d in docs:
        sname = d.get("station_name", "Unknown")
        if sname in seen:
            continue
        clean_pct = 100.0 if _is_clean(d) else 0.0
        seen[sname] = {
            "station_name": sname,
            "clean_pct": clean_pct,
            "score": int(d.get("aggregate_score", 0)),
            "inspection_date": d.get("inspection_date"),
            "created_at": d.get("created_at"),
            "rating": "Clean" if _is_clean(d) else "Need Attention",
        }
    most_recent = sorted(seen.values(), key=lambda x: (-x["clean_pct"], -x["score"]))

    return {
        "overall": overall,
        "average": average,
        "most_recent": most_recent,
    }


# ============ File Serving ============


@api_router.get("/files/{path:path}")
async def get_file(
    path: str,
    auth: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    share_token: Optional[str] = Query(None),
):
    # Allow either bearer auth (header or ?auth=) or a valid share_token query
    is_authed = False
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]
    elif auth:
        token = auth
    else:
        token = None
    if token:
        try:
            decode_token(token)
            is_authed = True
        except Exception:
            is_authed = False
    if not is_authed and share_token:
        link = await db.share_links.find_one(
            {"token": share_token, "active": True}, {"_id": 0}
        )
        if link:
            is_authed = True
    if not is_authed:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        data, content_type = get_object(path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    return Response(content=data, media_type=content_type)


# ============ Startup: init storage + seed admin/stations/SMs ============


DEFAULT_STATIONS: list = []  # Stations are now free-text codes tied to each SM

# Per the official station-master roster (45 stations on the network).
SM_ROSTER: list[tuple[str, str]] = [
    ("sm001", "RNC"), ("sm002", "MURI"), ("sm003", "HTE"), ("sm004", "BLRG"),
    ("sm005", "LOM"), ("sm006", "KRRA"), ("sm007", "GBX"), ("sm008", "BKPR"),
    ("sm009", "PKF"), ("sm010", "PKC"), ("sm011", "KRKR"), ("sm012", "MCZ"),
    ("sm013", "BANO"), ("sm014", "KNRN"), ("sm015", "TATI"), ("sm016", "PBB"),
    ("sm017", "ORGA"), ("sm018", "PIS"), ("sm019", "TGB"), ("sm020", "NJA"),
    ("sm021", "LAD"), ("sm022", "BICI"), ("sm023", "BODG"), ("sm024", "BLNG"),
    ("sm025", "HRBR"), ("sm026", "GRE"), ("sm027", "MAEL"), ("sm028", "BRKP"),
    ("sm029", "RMT"), ("sm030", "ILO"), ("sm031", "TRAN"), ("sm032", "SSIA"),
    ("sm033", "TUL"), ("sm034", "LTMD"), ("sm035", "JHMR"), ("sm036", "GDBR"),
    ("sm037", "NKM"), ("sm038", "TIS"), ("sm039", "GAG"), ("sm040", "JONA"),
    ("sm041", "GATD"), ("sm042", "KITA"), ("sm043", "SLF"), ("sm044", "THO"),
    ("sm045", "JAA"),
]


# Full-name → role for named accounts. Editors get the "admin" role (view + edit).
# Viewers get the "viewer" role (view only).
NAMED_EDITORS: list[str] = [
    "Dhananjay Kumar Rai",
    "Santosh Kumar",
    "Ashok Kumar",
    "Anand Kishore",
    "Ajay Kumar I",
]
NAMED_VIEWERS: list[str] = [
    "Rajesh Gupta",
    "Abhay Mondal",
    "Sudip Kumar",
    "Ajay Kumar II",
    "Santosh Gupta",
    "Govind Sharma",
    "SrDCM",
    "ACM 1",
    "ACM 2",
    "ACM 3",
    "AOM",
    "DOM",
    "ADRM",
    "DRM",
]


def _uname_from_name(name: str) -> str:
    return _re_login.sub(r"[^a-z0-9]+", ".", name.lower()).strip(".")


async def seed():
    # Drop legacy seeded stations (Jaipur, NDLS, etc.). Stations are now defined
    # purely by what SMs are assigned to via SM_ROSTER.
    try:
        await db.stations.delete_many({})
    except Exception as e:
        logger.warning(f"Could not clear stations: {e}")

    # Super admin
    if not await db.users.find_one({"username": "admin"}):
        await db.users.insert_one(
            {
                "id": str(uuid.uuid4()),
                "username": "admin",
                "password_hash": hash_password("Admin@123"),
                "full_name": "Super Admin",
                "role": "admin",
                "station_id": None,
                "station_name": None,
                "active": True,
                "created_at": now_iso(),
            }
        )
        logger.info("Seeded super admin (admin / Admin@123)")

    # Upsert official roster: 45 SMs, each pre-assigned to a station code.
    valid_usernames: set[str] = set()
    for uname, code in SM_ROSTER:
        valid_usernames.add(uname)
        existing = await db.users.find_one({"username": uname})
        if existing:
            await db.users.update_one(
                {"username": uname},
                {
                    "$set": {
                        "station_name": code,
                        "station_id": None,
                        "active": True,
                    }
                },
            )
        else:
            await db.users.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "username": uname,
                    "password_hash": hash_password("Station@123"),
                    "full_name": f"SM {code}",
                    "role": "sm",
                    "station_id": None,
                    "station_name": code,
                    "active": True,
                    "created_at": now_iso(),
                }
            )

    # Remove any SM accounts that aren't on the roster anymore (legacy sm046..sm100 etc.)
    # Note: we now allow sm046+ to be auto-provisioned on login, but we do NOT
    # wipe them if they exist. Only remove those that are older placeholders
    # (roster + any additional 'sm\d+' accounts stay).
    removed = await db.users.delete_many(
        {
            "role": "sm",
            "username": {"$nin": list(valid_usernames)},
            "station_name": None,
            "created_at": {"$lt": "2026-02-04"},
        }
    )
    if removed.deleted_count:
        logger.info(f"Removed {removed.deleted_count} legacy SM accounts not on roster")
    logger.info(f"Roster sync complete: {len(SM_ROSTER)} SMs active")

    # Named editors & viewers
    for full_name in NAMED_EDITORS:
        uname = _uname_from_name(full_name)
        if not await db.users.find_one({"username": uname}):
            await db.users.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "username": uname,
                    "password_hash": hash_password("Admin@123"),
                    "full_name": full_name,
                    "role": "admin",
                    "station_id": None,
                    "station_name": None,
                    "active": True,
                    "created_at": now_iso(),
                }
            )
    for full_name in NAMED_VIEWERS:
        uname = _uname_from_name(full_name)
        if not await db.users.find_one({"username": uname}):
            await db.users.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "username": uname,
                    "password_hash": hash_password("Admin@123"),
                    "full_name": full_name,
                    "role": "viewer",
                    "station_id": None,
                    "station_name": None,
                    "active": True,
                    "created_at": now_iso(),
                }
            )
    logger.info(f"Seeded/verified {len(NAMED_EDITORS)} editors + {len(NAMED_VIEWERS)} viewers")


@app.on_event("startup")
async def startup_event():
    try:
        init_storage()
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    try:
        await seed()
    except Exception as e:
        logger.exception(f"Seeding failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


@api_router.get("/")
async def root():
    return {"service": "railway-cleanliness", "status": "ok"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
