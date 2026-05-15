import type { EstimateItem } from "../types";
import rawLibrary from "../../public/data/fs_library.json";

export type PricingLibraryItem = {
  id: string;
  category: string;
  name: string;
  description: string;
  unit: string;
  unitCost: number;
};

type RawLibraryItem = {
  cat: string;
  desc: string;
  cost: number;
  uom: string;
};

const uomMap: Record<string, string> = {
  "lin. ft": "LF",
  "lin. ft.": "LF",
  "sq. ft.": "SF",
  "sq. ft": "SF",
  "ea.": "EA",
  ea: "EA",
  "hr.": "HR",
  hr: "HR",
  set: "set",
  lot: "lot",
  day: "day",
  pair: "pair"
};

export const pricingLibrary: PricingLibraryItem[] = (rawLibrary as RawLibraryItem[]).map((item, index) => {
  const category = normalizeCategory(item.cat);
  const unit = normalizeUom(item.uom);
  const unitCost = Number(item.cost) || 0;
  return {
    id: makeLibraryId({ category, description: item.desc, unit, unitCost, index }),
    category,
    name: item.desc,
    description: item.desc,
    unit,
    unitCost
  };
});

export function libraryItemToEstimateItem(item: PricingLibraryItem): EstimateItem {
  return {
    id: `item-${Date.now()}-${item.id}`,
    name: item.name,
    description: item.description,
    category: item.category,
    qty: 1,
    unit: item.unit,
    unitCost: item.unitCost
  };
}

function normalizeUom(uom: string) {
  return uomMap[uom.trim().toLowerCase()] ?? uom.trim();
}

function normalizeCategory(category: string) {
  return category.replace(/^Est-/, "").trim();
}

function makeLibraryId({
  category,
  description,
  unit,
  unitCost,
  index
}: {
  category: string;
  description: string;
  unit: string;
  unitCost: number;
  index: number;
}) {
  const basis = `${category}-${description}-${unit}-${unitCost}-${index}`;
  const slug = basis.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
  return `lib-${slug}`;
}
