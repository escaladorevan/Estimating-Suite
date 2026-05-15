import type { TakeoffRule } from "../types";
import type { PricingLibraryItem } from "./pricing-library";

const upperCabinetRunPattern = /^uppers w\/doors\b/i;

export const upperCabinetPlamRule: TakeoffRule = {
  id: "upper-cab-plam",
  name: "Upper Cabinet (PLAM, w/Doors)",
  matchCategoryFragment: "Cabs Uppers w/Doors",
  matchesItem: (item) =>
    item.category.includes("Cabs Uppers w/Doors") &&
    item.unit === "LF" &&
    upperCabinetRunPattern.test(item.name),
  params: [
    { key: "heightIn", label: "Cabinet Height (in)", inputType: "number", default: 30, min: 12, max: 60 },
    { key: "depthIn", label: "Cabinet Depth (in)", inputType: "number", default: 12, min: 10, max: 24 },
    { key: "bayWidthIn", label: "Bay Width / Door (in)", inputType: "number", default: 18, min: 12, max: 24 },
    { key: "exposedEnds", label: "Exposed End Panels", inputType: "integer", default: 0, min: 0, max: 2 }
  ],
  derivedVars: {
    DOORS: "ceil(lengthLF * 12 / bayWidthIn)",
    HINGE_PER_DOOR: "heightIn <= 40 ? 2 : 3",
    SIDE_PANELS_SF: "(DOORS + 1) * (heightIn / 12) * (depthIn / 12)",
    TOP_BOTTOM_SF: "DOORS * 2 * (bayWidthIn / 12) * (depthIn / 12)",
    ADJ_SHELF_SF: "DOORS * ((bayWidthIn - 1.5) / 12) * ((depthIn - 2) / 12)",
    CARCASS_RAW_SF: "SIDE_PANELS_SF + TOP_BOTTOM_SF",
    DOOR_RAW_SF: "DOORS * (heightIn / 12) * (bayWidthIn / 12)",
    BACK_RAW_SF: "lengthLF * (heightIn / 12)"
  },
  components: [
    { label: "Melamine 3/4 in - Carcass + Shelves", unit: "SF", category: "material", formula: "(CARCASS_RAW_SF + ADJ_SHELF_SF) * 1.10", unitCost: 0 },
    { label: "Melamine 3/4 in - Sheets (4x8)", unit: "EA", category: "material", formula: "ceil((CARCASS_RAW_SF + ADJ_SHELF_SF) * 1.10 / 32)", unitCost: 0 },
    { label: "MDF 3/4 in - Door Substrate", unit: "SF", category: "material", formula: "DOOR_RAW_SF * 1.12", unitCost: 0 },
    { label: "MDF 3/4 in - Sheets (4x8)", unit: "EA", category: "material", formula: "ceil(DOOR_RAW_SF * 1.12 / 32)", unitCost: 0 },
    { label: "Melamine 1/4 in - Backs", unit: "SF", category: "material", formula: "BACK_RAW_SF * 1.10", unitCost: 0 },
    { label: "Melamine 1/4 in - Sheets (4x8)", unit: "EA", category: "material", formula: "ceil(BACK_RAW_SF * 1.10 / 32)", unitCost: 0 },
    { label: "PLAM - Door Faces", unit: "SF", category: "material", formula: "DOOR_RAW_SF * 1.12", unitCost: 0 },
    { label: "PLAM - Exposed Ends", unit: "SF", category: "material", formula: "exposedEnds * (heightIn / 12) * (depthIn / 12) * 1.12", unitCost: 0 },
    { label: "PLAM EB - Doors", unit: "LF", category: "material", formula: "DOORS * 2 * (heightIn + bayWidthIn) / 12 * 1.15", unitCost: 0 },
    { label: "ABS EB - Box", unit: "LF", category: "material", formula: "(2 * lengthLF + (2 - exposedEnds) * (heightIn + 2 * depthIn) / 12) * 1.15", unitCost: 0 },
    { label: "Blum Hinges (cups)", unit: "EA", category: "hardware", formula: "DOORS * HINGE_PER_DOOR", unitCost: 0 },
    { label: "Blum Hinge Plates", unit: "EA", category: "hardware", formula: "DOORS * HINGE_PER_DOOR", unitCost: 0 },
    { label: "Pulls", unit: "EA", category: "hardware", formula: "DOORS", unitCost: 0 },
    { label: "Shelf Pins 5mm", unit: "EA", category: "hardware", formula: "DOORS * 4", unitCost: 0 },
    { label: "Hanging Rail", unit: "LF", category: "hardware", formula: "lengthLF * 1.05", unitCost: 0 },
    { label: "Shop Consumables", unit: "LF", category: "material", formula: "lengthLF", unitCost: 0 }
  ]
};

export const takeoffRules: TakeoffRule[] = [upperCabinetPlamRule];

export function findTakeoffRule(item: PricingLibraryItem): TakeoffRule | null {
  return takeoffRules.find((rule) =>
    rule.matchesItem
      ? rule.matchesItem(item)
      : item.category.includes(rule.matchCategoryFragment)
  ) ?? null;
}
