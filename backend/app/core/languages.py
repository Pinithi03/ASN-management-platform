"""
Supported UI languages and their Keycloak locale codes.

The portal uses "zh-CN"; Keycloak 26 names Simplified Chinese "zh-Hans".
Always convert with to_keycloak_locale() before writing to Keycloak.
"""

from __future__ import annotations

from typing import Literal, Optional

Language = Literal["en", "zh-CN", "it"]
SUPPORTED_LANGUAGES: tuple[Language, ...] = ("en", "zh-CN", "it")
DEFAULT_LANGUAGE: Language = "en"


def normalise_language(value: Optional[str]) -> Optional[Language]:
    """Map a locale variant (zh, zh_CN, zh-Hans, it-IT, en-GB, …) to a supported language."""
    if not value:
        return None
    code = value.strip().replace("_", "-").lower()
    if code in ("zh", "zh-cn", "zh-hans") or code.startswith("zh-hans-"):
        return "zh-CN"
    if code == "it" or code.startswith("it-"):
        return "it"
    if code == "en" or code.startswith("en-"):
        return "en"
    return None


def to_keycloak_locale(language: Language) -> str:
    """Portal language → Keycloak locale code."""
    return "zh-Hans" if language == "zh-CN" else language
