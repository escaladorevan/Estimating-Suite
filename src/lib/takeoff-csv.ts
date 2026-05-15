import type { BOMComponent } from "../types";

export function bomComponentsToCsv(components: BOMComponent[]) {
  const header = ["Component", "Qty", "Unit", "Unit Cost", "Total Cost", "Category"].map(csvCell).join(",");
  const rows = components.map((component) =>
    [
      component.label,
      component.qty,
      component.unit,
      component.unitCost,
      component.totalCost,
      component.category
    ].map(csvCell).join(",")
  );
  return [header, ...rows].join("\n");
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}
