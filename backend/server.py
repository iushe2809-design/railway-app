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
        return 0, "Unclean"
    # Use effective score (override overrides AI)
    scores = []
    for p in photos:
        if p.get("override") and p["override"].get("score") is not None:
            scores.append(p["override"]["score"])
        else:
            scores.append(p["ai_analysis"].get("score", 0))
    avg = int(sum(scores) / len(scores))
    if avg >= 85:
        rating = "Clean"
    elif avg >= 60:
        rating = "Needs Attention"
    else:
        rating = "Unclean"
    return avg, rating


# ============ Auth Endpoints ============


@api_router.post("/auth/login")
async def login(req: LoginRequest):
    user = await db.users.find_one({"username": req.username.lower().strip()}, {"_id": 0})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user["id"], user["role"])
    return {"token": token, "user": public_user(user)}


@api_router.get("/auth/me")
async def me(user: Annotated[dict, Depends(require_user)]):
    return public_user(user)


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
    require_admin(user)
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
    require_admin(user)
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
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
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
    station_name: str = Form(...),
    inspection_date: Optional[str] = Form(None),
):
    if not station_name or not station_name.strip():
        raise HTTPException(status_code=400, detail="Station name is required")
    return await _save_inspection(
        station_id=None,
        station_name=station_name.strip(),
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
    require_admin(user)
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
    # SM can only see their own
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
    rating_map = {"Clean": 95, "Needs Attention": 72, "Unclean": 40}
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


# ============ Reports ============


@api_router.get("/reports/summary")
async def reports_summary(
    user: Annotated[dict, Depends(require_user)],
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    station_name: Optional[str] = None,
):
    require_admin(user)
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
    docs = await db.inspections.find(query, {"_id": 0}).to_list(2000)

    total_inspections = len(docs)
    total_photos = sum(len(d["photos"]) for d in docs)
    counts = {"Clean": 0, "Needs Attention": 0, "Unclean": 0}
    by_station: dict = {}
    by_day: dict = {}
    unclean_details = []
    for d in docs:
        rating = d.get("aggregate_rating", "Unclean")
        counts[rating] = counts.get(rating, 0) + 1
        sname = d.get("station_name", "Unknown")
        if sname not in by_station:
            by_station[sname] = {
                "station_name": sname,
                "total": 0,
                "clean": 0,
                "needs_attention": 0,
                "unclean": 0,
                "avg_score": 0,
                "_scores": [],
            }
        by_station[sname]["total"] += 1
        if rating == "Clean":
            by_station[sname]["clean"] += 1
        elif rating == "Needs Attention":
            by_station[sname]["needs_attention"] += 1
        else:
            by_station[sname]["unclean"] += 1
        by_station[sname]["_scores"].append(d.get("aggregate_score", 0))

        day = d.get("inspection_date") or d["created_at"][:10]
        by_day[day] = by_day.get(day, 0) + len(d["photos"])

        if rating == "Unclean":
            issues = []
            for p in d["photos"]:
                ai = p.get("ai_analysis", {})
                issues.extend(ai.get("issues", []))
            unclean_details.append(
                {
                    "inspection_id": d["id"],
                    "station_name": sname,
                    "score": d.get("aggregate_score", 0),
                    "inspection_date": d.get("inspection_date") or d["created_at"][:10],
                    "created_at": d["created_at"],
                    "issues": issues[:8],
                }
            )

    station_breakdown = []
    for s in by_station.values():
        scores = s.pop("_scores")
        s["avg_score"] = int(sum(scores) / len(scores)) if scores else 0
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


DEFAULT_STATIONS = [
    ("New Delhi", "NDLS"),
    ("Mumbai CST", "CSTM"),
    ("Howrah Junction", "HWH"),
    ("Chennai Central", "MAS"),
    ("Bengaluru City", "SBC"),
    ("Secunderabad", "SC"),
    ("Ahmedabad Jn", "ADI"),
    ("Lucknow", "LKO"),
    ("Patna Jn", "PNBE"),
    ("Bhopal Jn", "BPL"),
]


async def seed():
    # Stations
    existing = await db.stations.count_documents({})
    station_ids: List[str] = []
    if existing == 0:
        for name, code in DEFAULT_STATIONS:
            sid = str(uuid.uuid4())
            await db.stations.insert_one(
                {"id": sid, "name": name, "code": code, "created_at": now_iso()}
            )
            station_ids.append(sid)
        logger.info(f"Seeded {len(DEFAULT_STATIONS)} stations")
    else:
        stations = await db.stations.find({}, {"_id": 0}).to_list(100)
        station_ids = [s["id"] for s in stations]

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

    # 100 Station Masters
    if await db.users.count_documents({"role": "sm"}) == 0 and station_ids:
        bulk = []
        for i in range(1, 101):
            uname = f"sm{i:03d}"
            sid = station_ids[(i - 1) % len(station_ids)]
            station = await db.stations.find_one({"id": sid}, {"_id": 0})
            bulk.append(
                {
                    "id": str(uuid.uuid4()),
                    "username": uname,
                    "password_hash": hash_password("Station@123"),
                    "full_name": f"Station Master {i:03d}",
                    "role": "sm",
                    "station_id": sid,
                    "station_name": station["name"] if station else None,
                    "active": True,
                    "created_at": now_iso(),
                }
            )
        if bulk:
            await db.users.insert_many(bulk)
            logger.info(f"Seeded {len(bulk)} station masters (sm001..sm100 / Station@123)")


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
