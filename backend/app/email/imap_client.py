# backend/app/email/imap_client.py
"""
IMAP client — connects to a mailbox, fetches unread messages,
and marks them as SEEN after successful processing.

Supports Gmail (imap.gmail.com:993) and any standard IMAP4-SSL server.
Connection details come from per-plant config or environment variables.
"""

from __future__ import annotations

import email
import imaplib
import logging
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

_UID_PATTERN = re.compile(rb"UID\s+(\d+)")


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

    def fetch_unprocessed(
        self,
        existing_message_ids: Optional[set[str]] = None,
        limit: int = 25,
        scan_depth: int = 50,
    ) -> list[RawEmail]:
        """
        Fetch up to `limit` unprocessed messages.

        If `existing_message_ids` is provided:
        1. Identifies UNSEEN messages and recent messages in the mailbox.
        2. Peeks at their Message-ID headers without altering IMAP flags.
        3. Filters out any message whose Message-ID is already in `existing_message_ids`.
        4. Downloads and returns the full RFC-822 data for unprocessed messages.

        This ensures that incoming order emails opened in Gmail or another mail
        client (which marks them \\Seen) are still reliably fetched and not lost.
        """
        if not self._conn:
            raise RuntimeError("Not connected — call connect() first")

        # 1. Collect UNSEEN UIDs
        unseen_uids: list[bytes] = []
        try:
            status, unseen_data = self._conn.uid("search", None, "UNSEEN")
            if status == "OK" and unseen_data and unseen_data[0]:
                unseen_uids = [u for u in unseen_data[0].split() if u]
        except Exception as e:
            logger.warning("Failed to search UNSEEN messages: %s", e)

        # 2. Collect recent UIDs across the mailbox
        recent_uids: list[bytes] = []
        try:
            status, all_data = self._conn.uid("search", None, "ALL")
            if status == "OK" and all_data and all_data[0]:
                all_uids = [u for u in all_data[0].split() if u]
                recent_uids = all_uids[-scan_depth:] if len(all_uids) > scan_depth else all_uids
        except Exception as e:
            logger.warning("Failed to search ALL messages: %s", e)

        # Prioritize newest messages first
        ordered_uids: list[bytes] = []
        seen_set: set[bytes] = set()
        for u in reversed(recent_uids + unseen_uids):
            if u not in seen_set:
                seen_set.add(u)
                ordered_uids.append(u)

        if not ordered_uids:
            logger.debug("No emails found in %s", self.config.mailbox)
            return []

        # If no existing_message_ids filter provided, fallback to standard unread or recent
        if existing_message_ids is None:
            target_uids = unseen_uids[:limit] if unseen_uids else ordered_uids[:limit]
            return self._fetch_messages_by_uids(target_uids)

        # Clean existing IDs for case-insensitive matching
        clean_existing = {mid.strip().strip("<>").lower() for mid in existing_message_ids if mid}

        # Batch-peek Message-ID headers for all candidate UIDs in one round-trip
        uid_str = b",".join(ordered_uids)
        try:
            status, fetch_data = self._conn.uid(
                "fetch",
                uid_str,
                "(UID BODY.PEEK[HEADER.FIELDS (MESSAGE-ID)])",
            )
        except Exception as e:
            logger.warning("Batch header fetch failed: %s", e)
            status = "ERROR"
            fetch_data = []

        uid_to_msgid: dict[bytes, str] = {}
        if status == "OK" and fetch_data:
            for item in fetch_data:
                if isinstance(item, tuple) and len(item) == 2:
                    meta, header_bytes = item
                    m = _UID_PATTERN.search(meta)
                    if m:
                        uid = m.group(1)
                        parsed_hdr = email.message_from_bytes(header_bytes)
                        msg_id = (parsed_hdr.get("Message-ID") or "").strip()
                        uid_to_msgid[uid] = msg_id

        # Filter candidate UIDs
        uids_to_process: list[bytes] = []
        for uid in ordered_uids:
            msg_id = uid_to_msgid.get(uid, "")
            clean_id = msg_id.strip("<>").lower()
            if not clean_id or clean_id not in clean_existing:
                uids_to_process.append(uid)
                if len(uids_to_process) >= limit:
                    break

        logger.info(
            "IMAP scan: %d candidate emails, %d unprocessed (fetching %d)",
            len(ordered_uids),
            len(uids_to_process),
            len(uids_to_process),
        )

        return self._fetch_messages_by_uids(uids_to_process)

    def _fetch_messages_by_uids(self, uids: list[bytes]) -> list[RawEmail]:
        """Fetch full RFC-822 bodies for a list of UIDs."""
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

    def fetch_unread(self, limit: int = 20) -> list[RawEmail]:
        """
        Fetch up to `limit` unread (UNSEEN) messages.
        Backward-compatible alias for fetch_unprocessed without ID filtering.
        """
        return self.fetch_unprocessed(existing_message_ids=None, limit=limit)

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