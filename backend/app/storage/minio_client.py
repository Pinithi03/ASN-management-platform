# backend/app/storage/minio_client.py
"""
MinIO client — upload and retrieve email attachments.

Env vars:
    MINIO_ENDPOINT    (default: localhost:9000)
    MINIO_ACCESS_KEY  (default: minioadmin)
    MINIO_SECRET_KEY  (default: minioadmin)
    MINIO_BUCKET      (default: email-attachments)
    MINIO_USE_SSL     (default: false)
"""

from __future__ import annotations

import hashlib
import io
import logging
import os
from typing import Optional

from minio import Minio
from minio.error import S3Error

logger = logging.getLogger(__name__)

# Singleton client
_client: Optional[Minio] = None


def get_minio_client() -> Minio:
    """Get or create the MinIO client singleton."""
    global _client
    if _client is None:
        try:
            from app.core.config import get_settings
            settings = get_settings()
            endpoint = os.getenv("MINIO_ENDPOINT") or settings.MINIO_ENDPOINT
            access_key = os.getenv("MINIO_ACCESS_KEY") or settings.MINIO_ACCESS_KEY
            secret_key = os.getenv("MINIO_SECRET_KEY") or settings.MINIO_SECRET_KEY
            secure = (os.getenv("MINIO_USE_SSL", "false").lower() == "true") or settings.MINIO_SECURE or settings.MINIO_USE_SSL
        except Exception:
            endpoint = os.getenv("MINIO_ENDPOINT", "localhost:9000")
            access_key = os.getenv("MINIO_ACCESS_KEY", "ans_minio")
            secret_key = os.getenv("MINIO_SECRET_KEY", "change_me_minio_at_least_8_chars")
            secure = os.getenv("MINIO_USE_SSL", "false").lower() == "true"

        _client = Minio(
            endpoint=endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure,
        )
    return _client


def get_bucket_name() -> str:
    """Return the configured bucket name."""
    try:
        from app.core.config import get_settings
        return os.getenv("MINIO_BUCKET") or get_settings().MINIO_BUCKET
    except Exception:
        return os.getenv("MINIO_BUCKET", "email-attachments")


def ensure_bucket_exists() -> None:
    """Create the bucket if it doesn't exist."""
    client = get_minio_client()
    bucket = get_bucket_name()
    try:
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
            logger.info("Created MinIO bucket: %s", bucket)
    except S3Error as e:
        logger.error("MinIO bucket check failed: %s", e)
        raise


def upload_attachment(
    content: bytes,
    object_key: str,
    content_type: str = "application/octet-stream",
) -> dict:
    """
    Upload a file to MinIO.

    Parameters
    ----------
    content : bytes
        File content.
    object_key : str
        Object key (path) in the bucket.
        e.g. "company-id/email-record-id/filename.xml"
    content_type : str
        MIME type of the file.

    Returns
    -------
    dict
        Upload result with bucket, key, size, and checksum.
    """
    client = get_minio_client()
    bucket = get_bucket_name()

    ensure_bucket_exists()

    # Calculate SHA-256 checksum
    checksum = hashlib.sha256(content).hexdigest()

    # Upload
    data = io.BytesIO(content)
    result = client.put_object(
        bucket_name=bucket,
        object_name=object_key,
        data=data,
        length=len(content),
        content_type=content_type,
    )

    logger.info(
        "Uploaded to MinIO: bucket=%s, key=%s, size=%d",
        bucket, object_key, len(content),
    )

    return {
        "bucket": bucket,
        "key": object_key,
        "size": len(content),
        "checksum_sha256": checksum,
        "etag": result.etag,
    }


def download_attachment(object_key: str, bucket: Optional[str] = None) -> bytes:
    """Download a file from MinIO by its object key (default bucket if not given)."""
    client = get_minio_client()
    response = client.get_object(bucket or get_bucket_name(), object_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()