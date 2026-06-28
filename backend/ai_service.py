"""Claude vision analysis for cleanliness inspection."""
import base64
import io
import json
import logging
import os
import re
import uuid
from typing import Optional

from emergentintegrations.llm.chat import ImageContent, LlmChat, UserMessage
from PIL import Image

try:  # Optional HEIC support
    import pillow_heif  # type: ignore
    pillow_heif.register_heif_opener()
except Exception:  # pragma: no cover
    pillow_heif = None

logger = logging.getLogger(__name__)


def _emergent_key() -> str:
    return os.environ.get("EMERGENT_LLM_KEY", "")


SYSTEM_PROMPT = """You are an expert railway station cleanliness inspector for Indian Railways.
Analyze the provided photograph of a railway station area and produce a structured JSON report.

Rate cleanliness on multiple criteria. Be strict but PRACTICAL and contextual.

IMPORTANT — DO NOT flag the following as issues, they are NORMAL station activity:
- Passengers, staff, vendors, or any people present in the photograph
- Luggage, suitcases, trolley bags, backpacks, baggage carts being used or kept by passengers
- Parked trolleys, baggage trolleys, wheelchairs, prams
- Newspapers/magazines being read by passengers
- Vehicles, trains, signage, lighting fixtures
- Wet floor from recent cleaning
- Normal wear-and-tear of paint or flooring (only flag if visibly dirty or damaged)

ONLY flag real CLEANLINESS issues:
- Litter, food waste, paper/plastic on the floor or tracks
- Spilled liquids, stains, sticky surfaces
- Overflowing or dirty bins
- Visible dirt, dust accumulation, stained walls, peeling paint with grime
- Spit, gutka stains, urine, faeces
- Standing dirty water, clogged drains
- Pest activity (rats, cockroaches, stray animals defecating)

You MUST respond with ONLY valid JSON (no markdown, no explanation) in this exact schema:
{
  "rating": "Clean" | "Needs Attention" | "Unclean",
  "score": <integer 0-100>,
  "area_detected": "<short label e.g. Platform, Waiting Area, Toilet, Tracks, Stairs, Concourse>",
  "area_breakdown": [
    {"aspect": "Litter / Waste", "score": <0-100>, "notes": "<one sentence>"},
    {"aspect": "Floor / Surface", "score": <0-100>, "notes": "<one sentence>"},
    {"aspect": "Walls & Fixtures", "score": <0-100>, "notes": "<one sentence>"},
    {"aspect": "Bins & Drainage", "score": <0-100>, "notes": "<one sentence>"}
  ],
  "issues": ["<concise issue 1>", "<concise issue 2>"],
  "recommendations": ["<actionable recommendation 1>", "<actionable recommendation 2>"]
}

Scoring guide:
- 85-100 => Clean
- 60-84  => Needs Attention
- 0-59   => Unclean

If there are no actual cleanliness issues (only people/luggage/normal activity), the station is CLEAN. Return an empty issues array and score 90+.
"""


def normalize_image(image_bytes: bytes, content_type: str) -> tuple[bytes, str]:
    """Convert any supported image format to JPEG bytes if needed.

    Returns (bytes, content_type). If already JPEG/PNG/WEBP we keep it as-is.
    """
    ct = (content_type or "").lower()
    safe = {"image/jpeg", "image/png", "image/webp"}
    if ct in safe and len(image_bytes) < 8 * 1024 * 1024:
        return image_bytes, ct
    try:
        img = Image.open(io.BytesIO(image_bytes))
        # Animated/multi-frame -> first frame
        if getattr(img, "is_animated", False):
            img.seek(0)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        # Down-size very large images
        max_side = 2000
        if max(img.size) > max_side:
            img.thumbnail((max_side, max_side))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85, optimize=True)
        return buf.getvalue(), "image/jpeg"
    except Exception as e:
        logger.warning(f"Image normalize failed ({e}); keeping original bytes")
        return image_bytes, ct or "application/octet-stream"


def _extract_json(text: str) -> dict:
    """Extract the first JSON object from the model's text response."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


def _calibration_block(examples: Optional[list]) -> str:
    """Render supervisor overrides as adaptive guidance for this station."""
    if not examples:
        return ""
    lines = []
    for ex in examples[:5]:
        ai_r = ex.get("ai_rating", "?")
        ai_s = ex.get("ai_score", "?")
        new_r = ex.get("override_rating", "?")
        notes = (ex.get("notes") or "").strip().replace("\n", " ")[:200]
        lines.append(
            f"- Previously you rated a photo at this station '{ai_r}' (score {ai_s}); "
            f"the supervisor corrected it to '{new_r}'. Reason: {notes}"
        )
    return (
        "\nSTATION-SPECIFIC CALIBRATION (learnt from supervisor corrections at this station — "
        "apply this judgement when borderline):\n" + "\n".join(lines) + "\n"
    )


async def analyze_image(
    image_bytes: bytes,
    content_type: str = "image/jpeg",
    station_name: Optional[str] = None,
    calibration_examples: Optional[list] = None,
) -> dict:
    """Run Claude vision analysis on a single image. Returns the parsed JSON."""
    if not _emergent_key():
        raise RuntimeError("EMERGENT_LLM_KEY not configured")

    norm_bytes, norm_ct = normalize_image(image_bytes, content_type)
    b64 = base64.b64encode(norm_bytes).decode("utf-8")
    image = ImageContent(image_base64=b64)

    calibration = _calibration_block(calibration_examples)
    station_ctx = f"\nStation: {station_name}\n" if station_name else ""
    user_text = (
        "Analyze this railway station photograph. Respond with ONLY the JSON object as instructed."
        + station_ctx
        + calibration
    )

    chat = LlmChat(
        api_key=_emergent_key(),
        session_id=f"inspect-{uuid.uuid4()}",
        system_message=SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    user_msg = UserMessage(text=user_text, file_contents=[image])

    response = await chat.send_message(user_msg)
    text = response if isinstance(response, str) else str(response)

    try:
        result = _extract_json(text)
    except Exception as e:
        logger.error(f"Failed to parse AI response: {e} | raw={text[:500]}")
        return {
            "rating": "Needs Attention",
            "score": 50,
            "area_detected": "Unknown",
            "area_breakdown": [],
            "issues": ["AI analysis could not be parsed"],
            "recommendations": ["Re-upload the photo for a fresh analysis"],
            "_raw": text[:1000],
        }

    score = int(result.get("score", 0))
    if score >= 85:
        result["rating"] = "Clean"
    elif score >= 60:
        result["rating"] = "Needs Attention"
    else:
        result["rating"] = "Unclean"

    return result
