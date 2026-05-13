import type { EstimateArea, EstimateItem } from "../types";

export type CategoryTakeoffRow = {
  category: string;
  unit: string;
  quantity: number;
  materialTotal: number;
};

export type MaterialTakeoffRow = {
  materialType: string;
  unit: string;
  quantity: number;
  materialTotal: number;
};

export function summarizeTakeoff(areas: EstimateArea[]) {
  const categoryRows = new Map<string, CategoryTakeoffRow>();
  const materialRows = new Map<string, MaterialTakeoffRow>();

  for (const area of areas) {
    if (area.ignored) continue;
    const areaQty = area.qty || 1;

    for (const section of area.sections) {
      if (section.ignored) continue;

      for (const item of section.items) {
        if (item.ignored) continue;
        const quantity = (item.qty || 0) * areaQty;
        const materialTotal = quantity * (item.unitCost || 0);
        const unit = item.unit || "each";
        addCategoryRow(categoryRows, item, unit, quantity, materialTotal);
        addMaterialRow(materialRows, item, unit, quantity, materialTotal);
      }
    }
  }

  return {
    byCategoryUnit: [...categoryRows.values()].sort((a, b) => compareSummaryLabels(a.category, b.category) || a.unit.localeCompare(b.unit)),
    byMaterialUnit: [...materialRows.values()].sort((a, b) => compareSummaryLabels(a.materialType, b.materialType) || a.unit.localeCompare(b.unit))
  };
}

function compareSummaryLabels(a: string, b: string) {
  if (a === "Uncategorized" && b !== "Uncategorized") return 1;
  if (b === "Uncategorized" && a !== "Uncategorized") return -1;
  return a.localeCompare(b);
}

function addCategoryRow(
  rows: Map<string, CategoryTakeoffRow>,
  item: EstimateItem,
  unit: string,
  quantity: number,
  materialTotal: number
) {
  const category = item.category || "Uncategorized";
  const key = `${category}::${unit}`;
  const row = rows.get(key) ?? { category, unit, quantity: 0, materialTotal: 0 };
  row.quantity += quantity;
  row.materialTotal += materialTotal;
  rows.set(key, row);
}

function addMaterialRow(
  rows: Map<string, MaterialTakeoffRow>,
  item: EstimateItem,
  unit: string,
  quantity: number,
  materialTotal: number
) {
  const materialType = item.materialType || "Uncategorized";
  const key = `${materialType}::${unit}`;
  const row = rows.get(key) ?? { materialType, unit, quantity: 0, materialTotal: 0 };
  row.quantity += quantity;
  row.materialTotal += materialTotal;
  rows.set(key, row);
}
