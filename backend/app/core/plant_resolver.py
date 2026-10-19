"""
Plant and Storage Location Resolver.

Resolves Oniverse / Calzedonia manufacturing plant details and storage locations
from delivery addresses, XML tags, or destination strings.
"""

from __future__ import annotations

import re
from typing import TypedDict, Optional


class ResolvedPlant(TypedDict):
    plant_code: str
    plant_name: str
    plant_group: str
    storage_location: str
    full_delivery_address: str
    display_name: str


KNOWN_PLANTS = {
    "PPA": {"name": "Omega Line Ltd", "group": "OMEGA", "default_code": "PPA1"},
    "PPB": {"name": "Alpha Apparels Ltd", "group": "ALPHA", "default_code": "PPB1"},
    "PPC": {"name": "Benji Ltd", "group": "BENJI", "default_code": "PPC1"},
    "PPD": {"name": "Sirio Ltd", "group": "SIRIO", "default_code": "PPD1"},
    "PPE": {"name": "Vavuniya Apparels Ltd", "group": "VAVUNIYA", "default_code": "PPE1"},
}


def resolve_plant_and_location(
    destination: Optional[str] = None,
    buyer_name: Optional[str] = None,
    fallback_client_code: Optional[str] = None,
) -> ResolvedPlant:
    """
    Parse destination string (e.g., 'PPA2-0105', 'PPB1-0101 (Alpha Apparels Ltd)')
    into plant_code, plant_name, storage_location, and display metadata.
    """
    raw = (destination or "").strip()
    buyer = (buyer_name or "").strip()
    client = (fallback_client_code or "").strip()
    combined = f"{raw} {buyer} {client}".strip()

    if not combined:
        return {
            "plant_code": "PPA1",
            "plant_name": "Omega Line Ltd",
            "plant_group": "OMEGA",
            "storage_location": "0101",
            "full_delivery_address": "PPA1-0101",
            "display_name": "Omega Line Ltd (PPA1-0101)",
        }

    # Match standard PP[A-Z] pattern: e.g. PPA2-0105, PPB1-0101, PPA1, etc.
    # Pattern matches PP<letter><number> optionally followed by -<storage_location>
    code_match = re.search(r"\b(PP[A-Z]\d)(?:[-_ ]([0-9A-Z]+))?\b", combined, re.IGNORECASE)
    
    plant_code = ""
    storage_loc = ""

    if code_match:
        plant_code = code_match.group(1).upper()
        if code_match.group(2):
            storage_loc = code_match.group(2).upper()
    else:
        # Check for 4-digit numeric code like 1001
        num_match = re.search(r"\b(100\d)\b", combined)
        if num_match:
            plant_code = num_match.group(1)

    # Determine Plant Group and Canonical Name
    plant_prefix = plant_code[:3].upper() if len(plant_code) >= 3 else ""
    s_lower = combined.lower()

    if plant_prefix in KNOWN_PLANTS:
        plant_info = KNOWN_PLANTS[plant_prefix]
        plant_name = plant_info["name"]
        plant_group = plant_info["group"]
    elif "alpha" in s_lower or "ppb" in s_lower or "polgahawela" in s_lower:
        plant_code = plant_code or "PPB1"
        plant_name = "Alpha Apparels Ltd"
        plant_group = "ALPHA"
    elif "benji" in s_lower or "ppc" in s_lower or "bingiriya" in s_lower:
        plant_code = plant_code or "PPC1"
        plant_name = "Benji Ltd"
        plant_group = "BENJI"
    elif "sirio" in s_lower or "ppd" in s_lower or "badalgama" in s_lower or "katunayake" in s_lower:
        plant_code = plant_code or "PPD1"
        plant_name = "Sirio Ltd"
        plant_group = "SIRIO"
        if not storage_loc:
            if "katunayake" in s_lower:
                storage_loc = "Katunayake"
            elif "badalgama" in s_lower:
                storage_loc = "Badalgama"
    elif "vavuniya" in s_lower or "ppe" in s_lower or "ppa4" in s_lower:
        plant_code = plant_code or "PPE1"
        plant_name = "Vavuniya Apparels Ltd"
        plant_group = "VAVUNIYA"
    elif "omega" in s_lower or "ppa" in s_lower or "sandalankawa" in s_lower or plant_code == "1001":
        plant_code = plant_code or "PPA1"
        plant_name = "Omega Line Ltd"
        plant_group = "OMEGA"
    else:
        # Dynamic fallback for unfamiliar plant code
        if plant_code:
            plant_name = f"Plant {plant_code}"
            plant_group = plant_code[:3].upper()
        else:
            plant_code = "PPA1"
            plant_name = raw or buyer or "Omega Line Ltd"
            plant_group = "OMEGA"

    # Default storage location if not extracted
    if not storage_loc:
        storage_loc = "0101"

    full_delivery = f"{plant_code}-{storage_loc}" if not storage_loc.startswith(plant_code) else storage_loc

    display_name = f"{plant_name} ({full_delivery})"

    return {
        "plant_code": plant_code,
        "plant_name": plant_name,
        "plant_group": plant_group,
        "storage_location": storage_loc,
        "full_delivery_address": full_delivery,
        "display_name": display_name,
    }
