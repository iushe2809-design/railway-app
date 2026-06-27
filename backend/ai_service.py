"""Claude vision analysis for cleanliness inspection."""
import base64
import json
import logging
import os
import re
import uuid

from emergentintegrations.llm.chat import ImageContent, LlmChat, UserMessage

logger = logging.getLogger(__name__)

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

SYSTEM_PROMPT = """You are an expert railway station cleanliness inspector for Indian Railways.
Analyze the provided photograph of a railway station area and produce a structured JSON report.

Rate cleanliness on multiple criteria. Be strict and objective.

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
"""


def _extract_json(text: str) -> dict:
    """Extract the first JSON object from the model's text response."""
    text = text.strip()
    # Strip code fences if present
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


async def analyze_image(image_bytes: bytes, content_type: str = "image/jpeg") -> dict:
    """Run Claude vision analysis on a single image. Returns the parsed JSON."""
    if not EMERGENT_LLM_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY not configured")

    b64 = base64.b64encode(image_bytes).decode("utf-8")
    image = ImageContent(image_base64=b64)

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"inspect-{uuid.uuid4()}",
        system_message=SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    user_msg = UserMessage(
        text="Analyze this railway station photograph. Respond with ONLY the JSON object as instructed.",
        file_contents=[image],
    )

    response = await chat.send_message(user_msg)
    text = response if isinstance(response, str) else str(response)

    try:
        result = _extract_json(text)
    except Exception as e:
        logger.error(f"Failed to parse AI response: {e} | raw={text[:500]}")
        # Fallback minimal structure so the flow doesn't break
        return {
            "rating": "Needs Attention",
            "score": 50,
            "area_detected": "Unknown",
            "area_breakdown": [],
            "issues": ["AI analysis could not be parsed"],
            "recommendations": ["Re-upload the photo for a fresh analysis"],
            "_raw": text[:1000],
        }

    # Normalize
    score = int(result.get("score", 0))
    if score >= 85:
        result["rating"] = "Clean"
    elif score >= 60:
        result["rating"] = "Needs Attention"
    else:
        result["rating"] = "Unclean"

    return result
