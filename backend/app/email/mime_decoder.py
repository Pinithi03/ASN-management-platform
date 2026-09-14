# backend/app/email/mime_decoder.py
"""
Stage 2 — MIME decoder.

Accepts raw RFC-5322 bytes (from IMAP FETCH or a .eml file) and returns
a structured DecodedEmail with headers, body parts, and attachments.
Uses only the Python stdlib `email` package — no external deps.
"""

from __future__ import annotations

import email
import email.policy
import logging
from dataclasses import dataclass, field
from email.message import EmailMessage
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class Attachment:
    """Single decoded attachment."""
    filename: str
    content_type: str  # e.g. "application/xml", "text/xml"
    payload: bytes


@dataclass
class DecodedEmail:
    """Structured result of MIME decoding."""
    message_id: str = ""
    subject: str = ""
    from_address: str = ""
    to_address: str = ""
    date: str = ""
    body_text: str = ""
    body_html: str = ""
    attachments: list[Attachment] = field(default_factory=list)
    raw_headers: dict[str, str] = field(default_factory=dict)


def decode(raw: bytes) -> DecodedEmail:
    """
    Decode raw email bytes into a DecodedEmail.

    Parameters
    ----------
    raw : bytes
        Full RFC-5322 message (as returned by IMAP FETCH or read from .eml).

    Returns
    -------
    DecodedEmail
        Structured envelope with body parts and attachments separated.
    """
    msg: EmailMessage = email.message_from_bytes(
        raw, policy=email.policy.default
    )

    result = DecodedEmail(
        message_id=msg.get("Message-ID", ""),
        subject=msg.get("Subject", ""),
        from_address=msg.get("From", ""),
        to_address=msg.get("To", ""),
        date=msg.get("Date", ""),
        raw_headers={k: v for k, v in msg.items()},
    )

    # Walk all MIME parts
    for part in msg.walk():
        content_type = part.get_content_type()
        disposition = str(part.get("Content-Disposition", ""))

        # --- Attachments (explicit disposition OR xml/octet types) ---
        if "attachment" in disposition or content_type in (
            "application/xml",
            "text/xml",
            "application/octet-stream",
        ):
            payload = part.get_payload(decode=True)
            if payload:
                filename = part.get_filename() or "unnamed"
                result.attachments.append(
                    Attachment(
                        filename=filename,
                        content_type=content_type,
                        payload=payload,
                    )
                )
                logger.debug("Attachment: %s (%s, %d bytes)", filename, content_type, len(payload))
            continue

        # --- Body parts ---
        if content_type == "text/plain" and not result.body_text:
            text = part.get_payload(decode=True)
            if text:
                charset = part.get_content_charset() or "utf-8"
                result.body_text = text.decode(charset, errors="replace")

        elif content_type == "text/html" and not result.body_html:
            html = part.get_payload(decode=True)
            if html:
                charset = part.get_content_charset() or "utf-8"
                result.body_html = html.decode(charset, errors="replace")

    # Check for linked XML attachments in HTML body if no direct XML attachments exist
    _extract_linked_attachments(result)

    logger.info(
        "Decoded email: subject=%r, from=%s, attachments=%d",
        result.subject,
        result.from_address,
        len(result.attachments),
    )
    return result


def _extract_linked_attachments(result: DecodedEmail) -> None:
    """
    Scan HTML body (and attached HTML files) for hyperlinks pointing to XML files
    (common in IUNGO / Calzedonia order notifications and Proofpoint URLDefense wrapped links).
    Downloads any found XML files and appends them as attachments.
    """
    has_xml = any(att.filename.lower().endswith(".xml") for att in result.attachments)
    if has_xml:
        return

    html_sources: list[str] = []
    if result.body_html:
        html_sources.append(result.body_html)

    for att in result.attachments:
        if att.content_type == "text/html" or att.filename.lower().endswith((".htm", ".html")):
            try:
                html_sources.append(att.payload.decode("utf-8", errors="ignore"))
            except Exception:
                pass

    if not html_sources:
        return

    import re
    import httpx
    from bs4 import BeautifulSoup

    existing_filenames = {att.filename.lower() for att in result.attachments}

    for html in html_sources:
        try:
            soup = BeautifulSoup(html, "html.parser")
            for a in soup.find_all("a"):
                href = a.get("href", "").strip()
                text = a.get_text(strip=True)

                if not href or not href.startswith(("http://", "https://")):
                    continue

                is_xml = (
                    text.lower().endswith(".xml")
                    or bool(re.search(r"\.xml(?:\?|$)", href, re.IGNORECASE))
                )

                if not is_xml:
                    continue

                filename = text if text.lower().endswith(".xml") else ""
                if not filename:
                    match = re.search(r"/([^/?#]+\.xml)(?:\?|$)", href, re.IGNORECASE)
                    filename = match.group(1) if match else "order.xml"

                # Sanitize filename
                filename = re.sub(r'[\\/*?:"<>|]', "_", filename)

                if filename.lower() in existing_filenames:
                    continue

                logger.info("Found linked XML attachment %r at %s", filename, href[:120])

                try:
                    with httpx.Client(follow_redirects=True, timeout=30.0) as client:
                        resp = client.get(href)
                        if resp.status_code == 200:
                            content = resp.content
                            if (
                                b"<?xml" in content[:200]
                                or b"<Sd" in content[:200]
                                or b"<" in content[:50]
                            ):
                                result.attachments.append(
                                    Attachment(
                                        filename=filename,
                                        content_type="application/xml",
                                        payload=content,
                                    )
                                )
                                existing_filenames.add(filename.lower())
                                logger.info(
                                    "Successfully downloaded linked XML attachment: %s (%d bytes)",
                                    filename,
                                    len(content),
                                )
                        else:
                            logger.warning(
                                "Failed to download linked XML from %s: HTTP %s",
                                href[:100],
                                resp.status_code,
                            )
                except Exception as e:
                    logger.warning(
                        "Error fetching linked attachment %s from %s: %s",
                        filename,
                        href[:100],
                        e,
                    )
        except Exception as e:
            logger.warning("Error parsing HTML for linked attachments: %s", e)


def decode_from_file(file_path: str) -> DecodedEmail:
    """
    Convenience — decode from a .eml file on disk.

    Parameters
    ----------
    file_path : str
        Path to a .eml file.

    Returns
    -------
    DecodedEmail
    """
    with open(file_path, "rb") as f:
        return decode(f.read())