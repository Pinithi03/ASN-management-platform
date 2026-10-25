// frontend/src/utils/plantResolver.ts

export interface ResolvedPlantInfo {
  plantCode: string;           // e.g. "PPA2" or "PPB1"
  plantName: string;           // e.g. "Omega Line Ltd"
  plantGroup: string;          // e.g. "OMEGA"
  storageLocation: string;     // e.g. "0105", "0101", "Badalgama"
  fullDeliveryAddress: string; // e.g. "PPA2-0105"
  displayName: string;         // e.g. "Omega Line Ltd (PPA2-0105)"
}

export interface PlantDefinition {
  id: string;                  // e.g. "OMEGA", "ALPHA", "BENJI", "SIRIO", "VAVUNIYA"
  name: string;                // e.g. "Omega Line Ltd"
  codePrefix: string;          // e.g. "PPA"
  defaultCode: string;         // e.g. "PPA1"
  location: string;            // e.g. "Sandalankawa"
  color: string;               // Badge / accent color
  bgLight: string;
  borderColor: string;
  // Zone24x7 visual showcase metadata
  hashtags: string[];
  tagline: string;
  description: string;
  badge: string;
  accentHex: string;
  imageUrl: string;
  storageLocationsHint: string[];
}

export const KNOWN_PLANTS: Record<string, PlantDefinition> = {
  OMEGA: {
    id: "OMEGA",
    name: "Omega Line Ltd",
    codePrefix: "PPA",
    defaultCode: "PPA1",
    location: "Sandalankawa",
    color: "text-blue-700",
    bgLight: "bg-blue-50",
    borderColor: "border-blue-200",
    hashtags: ["#Sandalankawa", "#PPA1", "#PPA2", "#CentralFabricHub", "#ActiveOrders"],
    tagline: "Central Production & Raw Fabric Hub",
    description: "Primary apparel manufacturing hub handling high-capacity raw fabrics, seamless intimate garments, and central supply distribution.",
    badge: "CENTRAL HUB",
    accentHex: "#2563eb",
    imageUrl: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=1200&auto=format&fit=crop",
    storageLocationsHint: ["0101 Main Store", "0105 Fabric Store", "0102 Trims Store"],
  },
  ALPHA: {
    id: "ALPHA",
    name: "Alpha Apparels Ltd",
    codePrefix: "PPB",
    defaultCode: "PPB1",
    location: "Polgahawela",
    color: "text-purple-700",
    bgLight: "bg-purple-50",
    borderColor: "border-purple-200",
    hashtags: ["#Polgahawela", "#PPB1", "#ApparelSewing", "#PrecisionAssembly"],
    tagline: "Precision Sewing & Garment Assembly",
    description: "Advanced apparel assembly lines specializing in precision stitching, garment construction, and fast-track line assembly.",
    badge: "SEWING & ASSEMBLY",
    accentHex: "#7c3aed",
    imageUrl: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?q=80&w=1200&auto=format&fit=crop",
    storageLocationsHint: ["0101 Main Warehouse", "0102 Material Store"],
  },
  BENJI: {
    id: "BENJI",
    name: "Benji Ltd",
    codePrefix: "PPC",
    defaultCode: "PPC1",
    location: "Bingiriya",
    color: "text-amber-700",
    bgLight: "bg-amber-50",
    borderColor: "border-amber-200",
    hashtags: ["#Bingiriya", "#PPC1", "#LaceProcessing", "#TextileFinishing"],
    tagline: "Specialized Lace & Textile Finishing",
    description: "State-of-the-art facility focused on intricate lace processing, elastic materials, and delicate fabric finishing lines.",
    badge: "SPECIALIZED FINISHING",
    accentHex: "#d97706",
    imageUrl: "https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?q=80&w=1200&auto=format&fit=crop",
    storageLocationsHint: ["0101 General Store", "0103 Finishing Bay"],
  },
  SIRIO: {
    id: "SIRIO",
    name: "Sirio Ltd",
    codePrefix: "PPD",
    defaultCode: "PPD1",
    location: "Badalgama / Katunayake",
    color: "text-emerald-700",
    bgLight: "bg-emerald-50",
    borderColor: "border-emerald-200",
    hashtags: ["#Badalgama", "#Katunayake", "#PPD1", "#ExportLogistics", "#AirHub"],
    tagline: "Export Manufacturing & Logistics Center",
    description: "High-volume export manufacturing and automated logistics warehouse, handling direct international shipping dispatches.",
    badge: "EXPORT LOGISTICS",
    accentHex: "#059669",
    imageUrl: "https://images.unsplash.com/photo-1553413077-190dd305871c?q=80&w=1200&auto=format&fit=crop",
    storageLocationsHint: ["Badalgama Hub", "Katunayake EPZ", "0101 Central Store"],
  },
  VAVUNIYA: {
    id: "VAVUNIYA",
    name: "Vavuniya Apparels Ltd",
    codePrefix: "PPE",
    defaultCode: "PPE1",
    location: "Vavuniya",
    color: "text-rose-700",
    bgLight: "bg-rose-50",
    borderColor: "border-rose-200",
    hashtags: ["#Vavuniya", "#PPE1", "#NorthernApparel", "#RegionalHub"],
    tagline: "Northern Apparel & Regional Distribution",
    description: "Strategic northern manufacturing center producing export apparel lines with dedicated regional distribution channels.",
    badge: "REGIONAL PLANT",
    accentHex: "#e11d48",
    imageUrl: "https://images.unsplash.com/photo-1587293852726-70cdb56c2866?q=80&w=1200&auto=format&fit=crop",
    storageLocationsHint: ["0101 Main Store", "0104 Accessories"],
  },
};

/**
 * Resolves plant code, plant name, and storage location from any raw
 * destination string, buyer name, or client code.
 *
 * Examples:
 *   "PPA2-0105"                   -> Plant: Omega Line Ltd (PPA2), Storage: 0105
 *   "PPB1-0101 (Alpha Apparels)"  -> Plant: Alpha Apparels Ltd (PPB1), Storage: 0101
 *   "SIRIO Plant - Badalgama"     -> Plant: Sirio Ltd (PPD1), Storage: Badalgama
 */
export function resolvePlantAndLocation(
  destinationOrAddress?: string | null,
  clientCode?: string | null
): ResolvedPlantInfo {
  const raw = (destinationOrAddress || "").trim();
  const client = (clientCode || "").trim();
  const combined = `${raw} ${client}`.trim();

  if (!combined) {
    return {
      plantCode: "PPA1",
      plantName: "Omega Line Ltd",
      plantGroup: "OMEGA",
      storageLocation: "0101",
      fullDeliveryAddress: "PPA1-0101",
      displayName: "Omega Line Ltd (PPA1-0101)",
    };
  }

  // Look for standard Oniverse code pattern (e.g., PPA2-0105, PPB1-0101, PPA1, etc.)
  const codeMatch = combined.match(/\b(PP[A-Z]\d)(?:[-_ ]([0-9A-Z]+))?\b/i);
  let plantCode = codeMatch ? codeMatch[1].toUpperCase() : "";
  let storageLocation = codeMatch && codeMatch[2] ? codeMatch[2].toUpperCase() : "";

  if (!plantCode) {
    const numMatch = combined.match(/\b(100\d)\b/);
    if (numMatch) {
      plantCode = numMatch[1];
    }
  }

  const sLower = combined.toLowerCase();
  let plantGroup = "OMEGA";
  let plantName = "Omega Line Ltd";

  const prefix = plantCode ? plantCode.slice(0, 3).toUpperCase() : "";

  if (prefix === "PPA") {
    plantGroup = "OMEGA";
    plantName = "Omega Line Ltd";
  } else if (prefix === "PPB") {
    plantGroup = "ALPHA";
    plantName = "Alpha Apparels Ltd";
  } else if (prefix === "PPC") {
    plantGroup = "BENJI";
    plantName = "Benji Ltd";
  } else if (prefix === "PPD") {
    plantGroup = "SIRIO";
    plantName = "Sirio Ltd";
  } else if (prefix === "PPE") {
    plantGroup = "VAVUNIYA";
    plantName = "Vavuniya Apparels Ltd";
  } else if (sLower.includes("alpha") || sLower.includes("ppb") || sLower.includes("polgahawela")) {
    plantCode = plantCode || "PPB1";
    plantGroup = "ALPHA";
    plantName = "Alpha Apparels Ltd";
  } else if (sLower.includes("benji") || sLower.includes("ppc") || sLower.includes("bingiriya")) {
    plantCode = plantCode || "PPC1";
    plantGroup = "BENJI";
    plantName = "Benji Ltd";
  } else if (sLower.includes("sirio") || sLower.includes("ppd") || sLower.includes("badalgama") || sLower.includes("katunayake")) {
    plantCode = plantCode || "PPD1";
    plantGroup = "SIRIO";
    plantName = "Sirio Ltd";
    if (!storageLocation) {
      if (sLower.includes("katunayake")) storageLocation = "Katunayake";
      else if (sLower.includes("badalgama")) storageLocation = "Badalgama";
    }
  } else if (sLower.includes("vavuniya") || sLower.includes("ppe") || sLower.includes("ppa4")) {
    plantCode = plantCode || "PPE1";
    plantGroup = "VAVUNIYA";
    plantName = "Vavuniya Apparels Ltd";
  } else if (sLower.includes("omega") || sLower.includes("ppa") || sLower.includes("sandalankawa") || plantCode === "1001") {
    plantCode = plantCode || "PPA1";
    plantGroup = "OMEGA";
    plantName = "Omega Line Ltd";
  } else {
    // Dynamic fallback for any new/custom plant in incoming XML
    if (plantCode) {
      plantName = `Plant ${plantCode}`;
      plantGroup = plantCode.slice(0, 3).toUpperCase();
    } else {
      plantCode = "PPA1";
      plantName = raw || client || "Omega Line Ltd";
      plantGroup = "OMEGA";
    }
  }

  if (!storageLocation) {
    storageLocation = "0101";
  }

  const fullDeliveryAddress = storageLocation.startsWith(plantCode)
    ? storageLocation
    : `${plantCode}-${storageLocation}`;

  const displayName = `${plantName} (${fullDeliveryAddress})`;

  return {
    plantCode,
    plantName,
    plantGroup,
    storageLocation,
    fullDeliveryAddress,
    displayName,
  };
}
