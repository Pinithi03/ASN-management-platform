"""
Email Automation Engine — inbound pipeline.

Pipeline stages:
  1. IMAP poll  →  fetch raw messages
  2. MIME decode  →  extract headers, body, attachments
  3. Classify  →  determine format (XML attachment vs HTML body)
  4. Parse  →  extract PO data (XML via lxml, HTML via BeautifulSoup)
  5. Validate & persist  →  save to DB + MinIO
"""