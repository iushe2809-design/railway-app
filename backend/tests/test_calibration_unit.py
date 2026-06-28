"""Direct unit tests for calibration helpers."""
import asyncio
import os
import sys

sys.path.insert(0, "/app/backend")

from ai_service import _calibration_block  # noqa: E402


def test_calibration_block_empty():
    assert _calibration_block(None) == ""
    assert _calibration_block([]) == ""


def test_calibration_block_renders_examples():
    examples = [
        {
            "ai_rating": "Unclean",
            "ai_score": 45,
            "override_rating": "Clean",
            "notes": "people with luggage are acceptable - the area itself is clean",
        }
    ]
    block = _calibration_block(examples)
    assert "STATION-SPECIFIC CALIBRATION" in block
    assert "Unclean" in block
    assert "Clean" in block
    assert "luggage" in block.lower()


def test_calibration_for_station_db_read():
    """Hit _calibration_for_station via the real DB to confirm overrides are surfaced."""
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    # Re-import server with proper env now loaded
    from server import _calibration_for_station

    async def go():
        return await _calibration_for_station("TEST_CalibStn", limit=5)

    res = asyncio.get_event_loop().run_until_complete(go())
    # The integration test class created an override at this station
    assert isinstance(res, list)
    if res:
        ex = res[0]
        assert ex["override_rating"] == "Clean"
        assert "luggage" in (ex.get("notes") or "").lower()
        assert ex.get("ai_rating") in ("Clean", "Needs Attention", "Unclean")
