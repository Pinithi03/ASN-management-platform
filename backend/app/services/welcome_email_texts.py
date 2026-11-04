"""
Texts of the supplier welcome (credentials) email, per portal language.

English is the source. zh-CN and it are drafts pending native-speaker review —
same rule as the frontend translation files. Credentials, codes and URLs are
inserted as data and never translated.
"""

from __future__ import annotations

WELCOME_TEXTS: dict[str, dict[str, object]] = {
    "en": {
        "subject": "Welcome to ASN Portal — Login Credentials for #{code}",
        "greeting": "Dear {name},",
        "text_intro": "Your partner account on the ASN Management Platform has been successfully activated.",
        "text_creds_heading": "Here are your portal access credentials:",
        "text_label_url": "Portal Access URL:",
        "label_username": "Username (Partner ID):",
        "label_password": "Temporary Password:",
        "text_security_heading": "SECURITY NOTICE:",
        "text_security": "Upon your first sign-in, you will be prompted by Keycloak to choose your own secure, permanent password before accessing the system.",
        "text_uses_heading": "You can use the ASN portal to:",
        "text_uses": [
            "Review and track your purchase orders",
            "Submit Advance Shipping Notices (ASNs)",
            "Monitor delivery statuses and packing lists",
        ],
        "text_contact": "If you have any questions, please contact Sirio Central Procurement HQ at sirio.asn.dev@gmail.com.",
        "sign_off": "Best regards,",
        "team": "Supply Chain & Procurement Team",
        "html_subtitle": "Partner Supply Chain Portal",
        "html_intro": "Your supplier partner account has been successfully provisioned. You can now access the portal to review inbound purchase orders, monitor dispatches, and manage Advance Shipping Notices (ASNs).",
        "html_label_url": "Portal URL:",
        "html_button": "Log In to ASN Portal &rarr;",
        "html_policy_label": "Security Policy:",
        "html_policy": "This temporary password is for initial sign-in only. Keycloak will prompt you to choose your own secure permanent password immediately upon logging in.",
        "html_support": "For technical support, contact Sirio Admin HQ:",
    },
    "it": {
        "subject": "Benvenuto nel portale ASN — Credenziali di accesso per #{code}",
        "greeting": "Gentile {name},",
        "text_intro": "Il tuo account partner sulla piattaforma ASN Management è stato attivato correttamente.",
        "text_creds_heading": "Ecco le tue credenziali di accesso al portale:",
        "text_label_url": "URL di accesso al portale:",
        "label_username": "Nome utente (ID partner):",
        "label_password": "Password temporanea:",
        "text_security_heading": "AVVISO DI SICUREZZA:",
        "text_security": "Al primo accesso, Keycloak ti chiederà di scegliere una password personale, sicura e permanente prima di accedere al sistema.",
        "text_uses_heading": "Con il portale ASN puoi:",
        "text_uses": [
            "Consultare e monitorare i tuoi ordini d'acquisto",
            "Inviare gli avvisi di spedizione (ASN)",
            "Monitorare lo stato delle consegne e le packing list",
        ],
        "text_contact": "Per qualsiasi domanda, contatta l'ufficio acquisti centrale Sirio all'indirizzo sirio.asn.dev@gmail.com.",
        "sign_off": "Cordiali saluti,",
        "team": "Team Supply Chain e Acquisti",
        "html_subtitle": "Portale Supply Chain per i partner",
        "html_intro": "Il tuo account partner fornitore è stato creato correttamente. Ora puoi accedere al portale per consultare gli ordini d'acquisto ricevuti, monitorare le spedizioni e gestire gli avvisi di spedizione (ASN).",
        "html_label_url": "URL del portale:",
        "html_button": "Accedi al portale ASN &rarr;",
        "html_policy_label": "Criteri di sicurezza:",
        "html_policy": "Questa password temporanea vale solo per il primo accesso. Subito dopo l'accesso, Keycloak ti chiederà di scegliere una password personale sicura e permanente.",
        "html_support": "Per assistenza tecnica, contatta l'amministrazione Sirio:",
    },
    "zh-CN": {
        "subject": "欢迎使用 ASN 门户 — #{code} 的登录凭据",
        "greeting": "尊敬的 {name}：",
        "text_intro": "您在 ASN 管理平台上的合作伙伴账户已成功激活。",
        "text_creds_heading": "以下是您的门户访问凭据：",
        "text_label_url": "门户访问网址：",
        "label_username": "用户名（合作伙伴 ID）：",
        "label_password": "临时密码：",
        "text_security_heading": "安全提示：",
        "text_security": "首次登录时，Keycloak 会提示您设置自己的安全永久密码，然后才能访问系统。",
        "text_uses_heading": "您可以使用 ASN 门户：",
        "text_uses": [
            "查看和跟踪您的采购订单",
            "提交预先发货通知 (ASN)",
            "监控交货状态和装箱单",
        ],
        "text_contact": "如有任何疑问，请通过 sirio.asn.dev@gmail.com 联系 Sirio 中央采购总部。",
        "sign_off": "此致敬礼，",
        "team": "供应链与采购团队",
        "html_subtitle": "合作伙伴供应链门户",
        "html_intro": "您的供应商合作伙伴账户已成功开通。现在您可以访问门户，查看收到的采购订单、监控发运并管理预先发货通知 (ASN)。",
        "html_label_url": "门户网址：",
        "html_button": "登录 ASN 门户 &rarr;",
        "html_policy_label": "安全策略：",
        "html_policy": "此临时密码仅用于首次登录。登录后，Keycloak 会立即提示您设置自己的安全永久密码。",
        "html_support": "如需技术支持，请联系 Sirio 管理部门：",
    },
}
