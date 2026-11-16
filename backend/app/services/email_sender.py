"""
Outbound email service for dispatching system notifications and partner onboarding credentials.
Connects via SMTP (Mailpit in development, standard SMTP in production).
"""

from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.core.config import get_settings
from app.core.languages import normalise_language
from app.services.welcome_email_texts import WELCOME_TEXTS

logger = logging.getLogger(__name__)


def render_supplier_welcome_email(
    supplier_name: str,
    supplier_code: str,
    temporary_password: str,
    portal_link: str,
    language: Optional[str] = None,
) -> tuple[str, str, str]:
    """Build (subject, plain text, HTML) of the welcome email in the given language."""
    lang = normalise_language(language) or "en"
    tx = WELCOME_TEXTS.get(lang, WELCOME_TEXTS["en"])

    subject = str(tx['subject']).format(code=supplier_code)
    greeting = str(tx['greeting']).format(name=supplier_name)
    uses = "\n".join(f"- {line}" for line in tx['text_uses'])  # type: ignore[union-attr]

    # Plain text version
    text_content = f"""{greeting}

{tx['text_intro']}

{tx['text_creds_heading']}
--------------------------------------------------
{tx['text_label_url']} {portal_link}
{tx['label_username']} {supplier_code}
{tx['label_password']} {temporary_password}
--------------------------------------------------

{tx['text_security_heading']}
{tx['text_security']}

{tx['text_uses_heading']}
{uses}

{tx['text_contact']}

{tx['sign_off']}
{tx['team']}
"""

    # Rich HTML version
    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{subject}</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }}
    .container {{ max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }}
    .header {{ background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 28px; text-align: left; color: #ffffff; }}
    .header h1 {{ margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }}
    .header p {{ margin: 6px 0 0 0; font-size: 13px; color: #94a3b8; }}
    .content {{ padding: 28px; }}
    .salutation {{ font-size: 15px; font-weight: 600; color: #0f172a; margin-bottom: 12px; }}
    .intro {{ font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }}
    .credentials-box {{ background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 20px; margin-bottom: 24px; }}
    .cred-row {{ display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-size: 13px; }}
    .cred-row:last-child {{ border-bottom: none; }}
    .cred-label {{ color: #64748b; font-weight: 500; }}
    .cred-val {{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 700; color: #0f172a; }}
    .temp-pw {{ background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 6px; font-size: 14px; }}
    .btn {{ display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: 600; font-size: 14px; text-align: center; margin-top: 8px; }}
    .notice {{ background: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 0 8px 8px 0; font-size: 12px; color: #1e40af; line-height: 1.5; margin: 20px 0; }}
    .footer {{ padding: 20px 28px; background: #f1f5f9; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>ASN Management Platform</h1>
      <p>{tx['html_subtitle']}</p>
    </div>
    <div class="content">
      <div class="salutation">{greeting}</div>
      <p class="intro">
        {tx['html_intro']}
      </p>

      <div class="credentials-box">
        <div class="cred-row">
          <span class="cred-label">{tx['html_label_url']}</span>
          <span class="cred-val"><a href="{portal_link}" style="color: #2563eb; text-decoration: none;">{portal_link}</a></span>
        </div>
        <div class="cred-row">
          <span class="cred-label">{tx['label_username']}</span>
          <span class="cred-val">#{supplier_code}</span>
        </div>
        <div class="cred-row">
          <span class="cred-label">{tx['label_password']}</span>
          <span class="cred-val"><span class="temp-pw">{temporary_password}</span></span>
        </div>
      </div>

      <div style="text-align: center; margin-bottom: 24px;">
        <a href="{portal_link}" class="btn">{tx['html_button']}</a>
      </div>

      <div class="notice">
        <strong>{tx['html_policy_label']}</strong> {tx['html_policy']}
      </div>
    </div>
    <div class="footer">
      Sirio, Benji, Omega Line, Alpha Apparels, Vavuniya Apparels<br>
      {tx['html_support']} <a href="mailto:sirio.asn.dev@gmail.com" style="color: #2563eb;">sirio.asn.dev@gmail.com</a>
    </div>
  </div>
</body>
</html>
"""

    return subject, text_content, html_content


def send_supplier_welcome_email(
    to_email: str,
    supplier_name: str,
    supplier_code: str,
    temporary_password: str,
    portal_url: Optional[str] = None,
    language: Optional[str] = None,
) -> bool:
    """
    Send an automated onboarding email to the supplier partner with their
    portal access link, username (supplier code), and temporary password.

    `language` ("en", "zh-CN", "it") selects the email texts; default English.
    """
    settings = get_settings()
    portal_link = portal_url or settings.PORTAL_URL or "http://localhost:3000"
    recipient = (to_email or "").strip()

    if not recipient:
        logger.warning("Skipping welcome email: no recipient email provided for supplier %s", supplier_code)
        return False

    sender = settings.SMTP_FROM_EMAIL or "ASN Portal <no-reply@asn-platform.local>"
    subject, text_content, html_content = render_supplier_welcome_email(
        supplier_name=supplier_name,
        supplier_code=supplier_code,
        temporary_password=temporary_password,
        portal_link=portal_link,
        language=language,
    )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = recipient

    msg.attach(MIMEText(text_content, "plain", "utf-8"))
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    try:
        host = settings.SMTP_HOST or "mailpit"
        port = settings.SMTP_PORT or 1025
        smtp_user = settings.SMTP_USER or settings.SMTP_USERNAME
        logger.info("Connecting to SMTP %s:%s to send credentials for %s", host, port, supplier_code)

        with smtplib.SMTP(host=host, port=port, timeout=10.0) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            if smtp_user and settings.SMTP_PASSWORD:
                server.login(smtp_user, settings.SMTP_PASSWORD)
            server.send_message(msg)

        logger.info("Credentials email sent successfully to %s for supplier #%s", recipient, supplier_code)
        return True
    except Exception as ex:
        logger.error("Failed to send welcome email to %s: %s", recipient, ex)
        return False


def send_asn_dispatch_email(
    to_email: str,
    asn_number: str,
    shipment_number: str,
    supplier_code: str,
    supplier_name: str,
    xml_content: str,
    xml_filename: str,
    email_subject: str,
    reply_to_email: Optional[str] = None,
    smtp_config: Optional[dict] = None,
) -> bool:
    """
    Dispatch an ASN SdDataSlice XML email to the configured EDI / IUNGO inbox.
    Includes the official XML attachment and formatted delivery summary.
    """
    settings = get_settings()
    recipient = (to_email or "").strip()
    if not recipient:
        logger.warning("Skipping ASN dispatch email: no recipient provided for ASN %s", asn_number)
        return False

    cfg = smtp_config or {}
    host = (cfg.get("smtp_host") or "").strip() or settings.SMTP_HOST or "mailpit"
    port = int(cfg.get("smtp_port") or settings.SMTP_PORT or 1025)
    smtp_user = (cfg.get("smtp_username") or "").strip() or settings.SMTP_USER or settings.SMTP_USERNAME
    smtp_pass = cfg.get("smtp_password") or settings.SMTP_PASSWORD
    use_tls = cfg.get("smtp_use_tls") if cfg.get("smtp_use_tls") is not None else settings.SMTP_USE_TLS

    # If SMTP is still at default mailpit without credentials, fall back to configured Gmail credentials in env
    if host in ("", "mailpit") and not smtp_user:
        import os
        fallback_user = os.environ.get("SMTP_USERNAME") or os.environ.get("SMTP_USER") or os.environ.get("IMAP_USERNAME") or ""
        fallback_pass = os.environ.get("SMTP_PASSWORD") or os.environ.get("IMAP_PASSWORD") or ""
        if fallback_user and fallback_pass:
            host = os.environ.get("SMTP_HOST") or "smtp.gmail.com"
            port = int(os.environ.get("SMTP_PORT") or 587)
            smtp_user = fallback_user.strip()
            smtp_pass = fallback_pass.strip()
            use_tls = True

    configured_from = (cfg.get("smtp_from_address") or "").strip() or settings.SMTP_FROM_EMAIL
    if smtp_user and (not configured_from or "asnplatform.local" in configured_from or "asn-platform.local" in configured_from):
        sender = f"ASN Platform <{smtp_user}>"
    else:
        sender = configured_from or "ASN Dispatch <no-reply@asn-platform.local>"

    from email.mime.application import MIMEApplication
    from datetime import datetime

    msg = MIMEMultipart("mixed")
    msg["Subject"] = email_subject
    msg["From"] = sender
    msg["To"] = recipient
    if reply_to_email and reply_to_email.strip():
        msg["Reply-To"] = reply_to_email.strip()

    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

    text_content = f"""Advance Shipping Notice (ASN) Transmission
==================================================
ASN Number:      {asn_number}
Shipment Number: {shipment_number}
Supplier:        {supplier_name} (#{supplier_code})
Dispatched:      {now_str}
==================================================

Please find attached the official Calzedonia / Oniverse SdDataSlice EDI XML file.
Document conforming to: m2Data_Partner.dtd
Attachment: {xml_filename}

This is an automated transmission dispatched via the ASN Management Platform.
"""

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }}
    .card {{ max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; }}
    .header {{ background: #0f172a; padding: 24px 28px; color: #ffffff; }}
    .content {{ padding: 28px; }}
    .badge {{ background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; font-family: monospace; font-size: 11px; padding: 2px 8px; border-radius: 6px; }}
    .meta-box {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0; }}
    .row {{ display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f1f5f9; }}
    .row:last-child {{ border-bottom: none; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2 style="margin: 0; font-size: 18px;">Advance Shipping Notice (ASN)</h2>
      <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">EDI / IUNGO Dispatch Transmission</p>
    </div>
    <div class="content">
      <p style="font-size: 14px; margin-top: 0;">An Advance Shipping Notice has been generated and dispatched with the attached official EDI XML slice.</p>
      <div class="meta-box">
        <div class="row"><span style="color:#64748b;">ASN Number:</span><span style="font-weight:700; font-family:monospace;">{asn_number}</span></div>
        <div class="row"><span style="color:#64748b;">Shipment Number:</span><span style="font-weight:700; font-family:monospace;">{shipment_number}</span></div>
        <div class="row"><span style="color:#64748b;">Supplier Partner:</span><span>{supplier_name} (#{supplier_code})</span></div>
        <div class="row"><span style="color:#64748b;">XML Attachment:</span><span class="badge">{xml_filename}</span></div>
        <div class="row"><span style="color:#64748b;">Dispatched At:</span><span>{now_str}</span></div>
      </div>
      <p style="font-size: 12px; color: #64748b;">DOCTYPE: SdDataSlice SYSTEM "m2Data_Partner.dtd"</p>
    </div>
  </div>
</body>
</html>
"""

    alt_part = MIMEMultipart("alternative")
    alt_part.attach(MIMEText(text_content, "plain", "utf-8"))
    alt_part.attach(MIMEText(html_content, "html", "utf-8"))
    msg.attach(alt_part)

    if xml_content:
        attachment = MIMEApplication(xml_content.encode("utf-8"), Name=xml_filename)
        attachment["Content-Disposition"] = f'attachment; filename="{xml_filename}"'
        msg.attach(attachment)

    try:
        logger.info("Connecting to SMTP %s:%s to dispatch ASN %s to %s", host, port, asn_number, recipient)

        if port == 465:
            with smtplib.SMTP_SSL(host=host, port=port, timeout=15.0) as server:
                if smtp_user and smtp_pass:
                    server.login(smtp_user, smtp_pass)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host=host, port=port, timeout=15.0) as server:
                if use_tls:
                    server.starttls()
                if smtp_user and smtp_pass:
                    server.login(smtp_user, smtp_pass)
                server.send_message(msg)

        logger.info("ASN XML email successfully dispatched to %s for ASN %s", recipient, asn_number)
        return True
    except Exception as ex:
        logger.error("Failed to dispatch ASN email to %s: %s", recipient, ex)
        return False

