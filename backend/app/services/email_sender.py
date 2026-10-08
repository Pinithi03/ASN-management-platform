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

logger = logging.getLogger(__name__)


def send_supplier_welcome_email(
    to_email: str,
    supplier_name: str,
    supplier_code: str,
    temporary_password: str,
    portal_url: Optional[str] = None,
) -> bool:
    """
    Send an automated onboarding email to the supplier partner with their
    portal access link, username (supplier code), and temporary password.
    """
    settings = get_settings()
    portal_link = portal_url or settings.PORTAL_URL or "http://localhost:3000"
    recipient = (to_email or "").strip()

    if not recipient:
        logger.warning("Skipping welcome email: no recipient email provided for supplier %s", supplier_code)
        return False

    sender = settings.SMTP_FROM_EMAIL or "Oniverse ASN Portal <no-reply@oniverse.lk>"
    subject = f"Welcome to Oniverse ASN Portal — Login Credentials for #{supplier_code}"

    # Plain text version
    text_content = f"""Dear {supplier_name},

Your partner account on the Oniverse (Calzedonia Group) ASN Management Platform has been successfully activated.

Here are your portal access credentials:
--------------------------------------------------
Portal Access URL: {portal_link}
Username (Partner ID): {supplier_code}
Temporary Password: {temporary_password}
--------------------------------------------------

SECURITY NOTICE:
Upon your first sign-in, you will be prompted by Keycloak to choose your own secure, permanent password before accessing the system.

You can use the ASN portal to:
- Review and track your purchase orders
- Submit Advance Shipping Notices (ASNs)
- Monitor delivery statuses and packing lists

If you have any questions, please contact Sirio Central Procurement HQ at sirio.asn.dev@gmail.com.

Best regards,
Oniverse Supply Chain & Procurement Team
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
      <h1>Oniverse ASN Management Platform</h1>
      <p>Calzedonia Group Partner Supply Chain Portal</p>
    </div>
    <div class="content">
      <div class="salutation">Dear {supplier_name},</div>
      <p class="intro">
        Your supplier partner account has been successfully provisioned. You can now access the portal to review inbound purchase orders, monitor dispatches, and manage Advance Shipping Notices (ASNs).
      </p>

      <div class="credentials-box">
        <div class="cred-row">
          <span class="cred-label">Portal URL:</span>
          <span class="cred-val"><a href="{portal_link}" style="color: #2563eb; text-decoration: none;">{portal_link}</a></span>
        </div>
        <div class="cred-row">
          <span class="cred-label">Username (Partner ID):</span>
          <span class="cred-val">#{supplier_code}</span>
        </div>
        <div class="cred-row">
          <span class="cred-label">Temporary Password:</span>
          <span class="cred-val"><span class="temp-pw">{temporary_password}</span></span>
        </div>
      </div>

      <div style="text-align: center; margin-bottom: 24px;">
        <a href="{portal_link}" class="btn">Log In to ASN Portal &rarr;</a>
      </div>

      <div class="notice">
        <strong>Security Policy:</strong> This temporary password is for initial sign-in only. Keycloak will prompt you to choose your own secure permanent password immediately upon logging in.
      </div>
    </div>
    <div class="footer">
      Oniverse (Sirio, Benji, Omega Line, Alpha Apparels, Vavuniya Apparels)<br>
      For technical support, contact Sirio Admin HQ: <a href="mailto:sirio.asn.dev@gmail.com" style="color: #2563eb;">sirio.asn.dev@gmail.com</a>
    </div>
  </div>
</body>
</html>
"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = recipient

    msg.attach(MIMEText(text_content, "plain", "utf-8"))
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    try:
        host = settings.SMTP_HOST or "mailpit"
        port = settings.SMTP_PORT or 1025
        logger.info("Connecting to SMTP %s:%s to send credentials for %s", host, port, supplier_code)

        with smtplib.SMTP(host=host, port=port, timeout=10.0) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)

        logger.info("Credentials email sent successfully to %s for supplier #%s", recipient, supplier_code)
        return True
    except Exception as ex:
        logger.error("Failed to send welcome email to %s: %s", recipient, ex)
        return False
