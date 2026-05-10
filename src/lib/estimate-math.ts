import type { EstimateArea, EstimateTotals, SubcontractorItem } from "../types";

type EstimateInput = {
  areas: EstimateArea[];
  subItems?: SubcontractorItem[];
  ohPct: number;
  delPct: number;
  insPct: number;
};

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateEstimateTotals(input: EstimateInput): EstimateTotals {
  const material = input.areas.reduce((areaSum, area) => {
    if (area.ignored) return areaSum;

    const sectionTotal = area.sections.reduce((sectionSum, section) => {
      if (section.ignored) return sectionSum;

      const itemTotal = section.items.reduce((itemSum, item) => {
        if (item.ignored) return itemSum;
        return itemSum + item.qty * item.unitCost;
      }, 0);

      return sectionSum + itemTotal;
    }, 0);

    return areaSum + sectionTotal * Math.max(area.qty || 1, 1);
  }, 0);

  const subcontractorCost = (input.subItems ?? []).reduce((sum, item) => sum + item.cost, 0);
  const subcontractorMarkup = (input.subItems ?? []).reduce(
    (sum, item) => sum + item.cost * (item.markupPct / 100),
    0
  );
  const subcontractorSell = subcontractorCost + subcontractorMarkup;
  const overhead = material * (input.ohPct / 100);
  const burdenBase = material + overhead;
  const delivery = burdenBase * (input.delPct / 100);
  const install = burdenBase * (input.insPct / 100);

  return {
    material: roundCurrency(material),
    overhead: roundCurrency(overhead),
    delivery: roundCurrency(delivery),
    install: roundCurrency(install),
    subcontractorCost: roundCurrency(subcontractorCost),
    subcontractorMarkup: roundCurrency(subcontractorMarkup),
    subcontractorSell: roundCurrency(subcontractorSell),
    bidTotal: roundCurrency(material + overhead + delivery + install + subcontractorSell)
  };
}
