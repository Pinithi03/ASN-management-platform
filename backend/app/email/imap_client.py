# backend/app/email/imap_client.py
"""
IMAP client — connects to a mailbox, fetches unread messages,
and marks them as SEEN after successful processing.

Supports Gmail (imap.gmail.com:993) and any standard IMAP4-SSL server.
Connection details come from per-plant config or environment variables.
"""

from __future__ import annotations

import imaplib
import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class IMAPConfig:
    """Connection config for one plant mailbox."""
    host: str           # e.g. "imap.gmail.com"
    port: int = 993
    username: str = ""  # full email address
    password: str = ""  # Gmail app password (16 chars)
    mailbox: str = "INBOX"
    use_ssl: bool = True


@dataclass
class RawEmail:
    """A single fetched message — uid + raw bytes."""
    uid: bytes          # IMAP UID for marking as read later
    raw: bytes          # Full RFC-5322 message bytes
    mailbox: str = ""   # Which mailbox it came from


class IMAPClient:
    """
    Thin wrapper around imaplib for fetching unread emails.

    Usage
    -----
        client = IMAPClient(config)
        client.connect()
        emails = client.fetch_unread(limit=20)
        for email in emails:
            process(email)
            client.mark_as_read(email.uid)
        client.disconnect()
    """

    def __init__(self, config: IMAPConfig):
        self.config = config
        self._conn: Optional[imaplib.IMAP4_SSL | imaplib.IMAP4] = None

    def connect(self) -> None:
        """Establish IMAP connection and authenticate."""
        try:
            if self.config.use_ssl:
                self._conn = imaplib.IMAP4_SSL(
                    self.config.host,
                    self.config.port,
                )
            else:
                self._conn = imaplib.IMAP4(
                    self.config.host,
                    self.config.port,
                )

            self._conn.login(self.config.username, self.config.password)
            self._conn.select(self.config.mailbox)
            logger.info(
                "IMAP connected: %s@%s:%d/%s",
                self.config.username,
                self.config.host,
                self.config.port,
                self.config.mailbox,
            )
        except imaplib.IMAP4.error as e:
            logger.error("IMAP login failed: %s", e)
            raise ConnectionError(f"IMAP login failed: {e}") from e

    def fetch_unread(self, limit: int = 20) -> list[RawEmail]:
        """
        Fetch up to `limit` unread (UNSEEN) messages.

        Returns
        -------
        list[RawEmail]
            Raw email data with IMAP UIDs for later marking.
        """
        if not self._conn:
            raise RuntimeError("Not connected — call connect() first")

        status, data = self._conn.uid("search", None, "UNSEEN")
        if status != "OK":
            logger.warning("IMAP SEARCH failed: %s", status)
            return []

        uids = data[0].split()
        if not uids:
            logger.debug("No unread emails in %s", self.config.mailbox)
            return []

        # Limit to avoid processing too many at once
        uids = uids[:limit]
        logger.info("Found %d unread emails (processing %d)", len(data[0].split()), len(uids))

        results: list[RawEmail] = []
        for uid in uids:
            status, msg_data = self._conn.uid("fetch", uid, "(RFC822)")
            if status != "OK" or not msg_data or not msg_data[0]:
                logger.warning("Failed to fetch UID %s", uid)
                continue

            raw_bytes = msg_data[0][1]
            if isinstance(raw_bytes, bytes):
                results.append(
                    RawEmail(
                        uid=uid,
                        raw=raw_bytes,
                        mailbox=self.config.mailbox,
                    )
                )

        return results

    def mark_as_read(self, uid: bytes) -> None:
        """Mark a message as SEEN by UID."""
        if not self._conn:
            return
        try:
            self._conn.uid("store", uid, "+FLAGS", "\\Seen")
            logger.debug("Marked UID %s as read", uid)
        except imaplib.IMAP4.error as e:
            logger.warning("Failed to mark UID %s as read: %s", uid, e)

    def disconnect(self) -> None:
        """Close mailbox and logout."""
        if self._conn:
            try:
                self._conn.close()
                self._conn.logout()
                logger.info("IMAP disconnected")
            except Exception:
                pass
            finally:
                self._conn = None

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, *args):
        self.disconnect()