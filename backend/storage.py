import os
import logging
from typing import Tuple

import cloudinary
import cloudinary.uploader
import requests

logger = logging.getLogger(__name__)

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True,
)

APP_NAME = os.getenv("APP_NAME", "railway-cleanliness")


def init_storage():
    return None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """
    Upload image to Cloudinary.
    Returns the same format expected by server.py.
    """

    upload = cloudinary.uploader.upload(
        data,
        public_id=path,
        resource_type="image",
        overwrite=True,
        unique_filename=False,
        
    )
    logger.info(upload)

    return {
        "path": upload["public_id"],
        "size": len(data),
        "etag": upload.get("asset_id", ""),
    }


def get_object(path: str) -> Tuple[bytes, str]:
    """
    Download image from Cloudinary.
    """

    url = cloudinary.CloudinaryImage(path).build_url(
        secure=True,
        resource_type="image",
    )
    logger.info(f"Cloudinary URL:{url}")

    response = requests.get(url, timeout=60)
    response.raise_for_status()

    return (
        response.content,
        response.headers.get("Content-Type", "image/jpeg"),
    )


