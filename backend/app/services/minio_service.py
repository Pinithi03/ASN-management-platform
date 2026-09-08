# backend/app/services/minio_service.py
"""
MinIO storage service — stores raw emails and attachments for audit trail.

Bucket structure:
    ans-emails/
        {company_id}/{year}/{month}/{email_id}.eml
    ans-attachments/
        {company_id}/{year}/{month}/{original_filename}
"""

from __future__ import annotations

import io
import logging
from datetime import datetime, timezone
from typing import Optional

from minio import Minio
from minio.error import S3Error

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Bucket names
EMAILS_BUCKET = "ans-emails"
ATTACHMENTS_BUCKET = "ans-attachments"


class MinIOService:
    """Wrapper around the MinIO Python client."""

    def __init__(self):
        settings = get_settings()
        self.client = Minio(
            endpoint=settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
        self._ensure_buckets()

    def _ensure_buckets(self) -> None:
        """Create required buckets if they don't exist."""
        for bucket in [EMAILS_BUCKET, ATTACHMENTS_BUCKET]:
            try:
                if not self.client.bucket_exists(bucket):
                    self.client.make_bucket(bucket)
                    logger.info("Created MinIO bucket: %s", bucket)
            except S3Error as e:
                logger.error("MinIO bucket check failed for %s: %s", bucket, e)

    def _build_path(
        self, company_id: str, filename: str, timestamp: Optional[datetime] = None
    ) -> str:
        """
        Build a storage path: {company_id}/{year}/{month}/{filename}
        """
        ts = timestamp or datetime.now(timezone.utc)
        return f"{company_id}/{ts.year}/{ts.month:02d}/{filename}"

    def store_raw_email(
        self,
        raw_bytes: bytes,
        email_id: str,
        company_id: str,
        timestamp: Optional[datetime] = None,
    ) -> str:
        """
        Store a raw .eml file in MinIO.

        Parameters
        ----------
        raw_bytes : bytes
            Full RFC-5322 email message.
        email_id : str
            UUID of the email record in the database.
        company_id : str
            Company UUID for path scoping.
        timestamp : datetime, optional
            Email received time (for folder structure).

        Returns
        -------
        str
            The MinIO object path (e.g. "company-uuid/2026/09/email-id.eml").
        """
        filename = f"{email_id}.eml"
        object_path = self._build_path(company_id, filename, timestamp)

        try:
            data = io.BytesIO(raw_bytes)
            self.client.put_object(
                bucket_name=EMAILS_BUCKET,
                object_name=object_path,
                data=data,
                length=len(raw_bytes),
                content_type="message/rfc822",
            )
            logger.info(
                "Stored raw email: %s/%s (%d bytes)",
                EMAILS_BUCKET, object_path, len(raw_bytes),
            )
            return f"{EMAILS_BUCKET}/{object_path}"
        except S3Error as e:
            logger.error("Failed to store raw email %s: %s", email_id, e)
            raise

    def store_attachment(
        self,
        content: bytes,
        filename: str,
        company_id: str,
        email_id: str,
        content_type: str = "application/octet-stream",
        timestamp: Optional[datetime] = None,
    ) -> str:
        """
        Store an email attachment in MinIO.

        Parameters
        ----------
        content : bytes
            Attachment file content.
        filename : str
            Original attachment filename.
        company_id : str
            Company UUID for path scoping.
        email_id : str
            Parent email record UUID (prefixed to avoid collisions).
        content_type : str
            MIME type of the attachment.
        timestamp : datetime, optional

        Returns
        -------
        str
            The MinIO object path.
        """
        # Prefix with email_id to avoid filename collisions
        safe_filename = f"{email_id}_{filename}"
        object_path = self._build_path(company_id, safe_filename, timestamp)

        try:
            data = io.BytesIO(content)
            self.client.put_object(
                bucket_name=ATTACHMENTS_BUCKET,
                object_name=object_path,
                data=data,
                length=len(content),
                content_type=content_type,
            )
            logger.info(
                "Stored attachment: %s/%s (%d bytes)",
                ATTACHMENTS_BUCKET, object_path, len(content),
            )
            return f"{ATTACHMENTS_BUCKET}/{object_path}"
        except S3Error as e:
            logger.error("Failed to store attachment %s: %s", filename, e)
            raise

    def get_object_url(
        self, bucket: str, object_path: str, expires_hours: int = 24
    ) -> str:
        """
        Generate a presigned URL for downloading a stored object.

        Parameters
        ----------
        bucket : str
            Bucket name.
        object_path : str
            Object path within the bucket.
        expires_hours : int
            URL expiry in hours (default 24).

        Returns
        -------
        str
            Presigned download URL.
        """
        from datetime import timedelta

        try:
            url = self.client.presigned_get_object(
                bucket_name=bucket,
                object_name=object_path,
                expires=timedelta(hours=expires_hours),
            )
            return url
        except S3Error as e:
            logger.error("Failed to generate presigned URL: %s", e)
            raise


# Singleton instance — lazily initialized
_minio_service: Optional[MinIOService] = None


def get_minio_service() -> MinIOService:
    """
    Get or create the MinIO service singleton.

    Returns None if MinIO connection fails (non-critical service).
    """
    global _minio_service
    if _minio_service is None:
        try:
            _minio_service = MinIOService()
        except Exception as e:
            logger.warning("MinIO unavailable — file storage disabled: %s", e)
            return None
    return _minio_service


def store_email_and_attachments(
    raw_bytes: bytes,
    email_id: str,
    company_id: str,
    attachments: list[dict],
    timestamp: Optional[datetime] = None,
) -> dict:
    """
    Convenience function — store raw email + all its attachments.

    Parameters
    ----------
    raw_bytes : bytes
        Full email message bytes.
    email_id : str
        UUID of the email record.
    company_id : str
        Company UUID.
    attachments : list[dict]
        List of {"filename": str, "content": bytes, "content_type": str}.
    timestamp : datetime, optional

    Returns
    -------
    dict
        Storage paths: {"email_path": str, "attachment_paths": [str]}
        Returns empty dict if MinIO is unavailable.
    """
    svc = get_minio_service()
    if svc is None:
        logger.warning("MinIO unavailable — skipping file storage")
        return {}

    result = {"email_path": "", "attachment_paths": []}

    try:
        result["email_path"] = svc.store_raw_email(
            raw_bytes, email_id, company_id, timestamp
        )
    except Exception:
        logger.exception("Failed to store raw email")

    for att in attachments:
        try:
            path = svc.store_attachment(
                content=att["content"],
                filename=att["filename"],
                company_id=company_id,
                email_id=email_id,
                content_type=att.get("content_type", "application/octet-stream"),
                timestamp=timestamp,
            )
            result["attachment_paths"].append(path)
        except Exception:
            logger.exception("Failed to store attachment: %s", att["filename"])

    return result