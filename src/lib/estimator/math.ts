// Pricing math — exact formulas from docs/spec-estimator.md §3.
// `noPrint` never affects math; only `ignore` removes cost.

import type { EstimateArea, EstimateDocument, EstimateItem, EstimateSection } from "./document";

export function itemTotal(item: EstimateItem): number {
  return item.ignore ? 0 : item.qty * item.unitCost;
}

export function sectionTotal(section: EstimateSection): number {
  return section.ignore ? 0 : section.items.reduce((sum, item) => sum + itemTotal(item), 0);
}

export function areaTotal(area: EstimateArea): number {
  return area.ignore ? 0 : (area.qty || 1) * area.sections.reduce((sum, section) => sum + sectionTotal(section), 0);
}

export type EstimateTotals = {
  mat: number;
  ohAmt: number;
  matOh: number;
  delAmt: number;
  insAmt: number;
  baseBid: number;
  subTotal: number;
  /** Printed "Base Bid" = baseBid + subTotal. Screen totals match the PDF (v2.1 bug fix #3). */
  totalBid: number;
  /** Gross-up factor applied to printed line prices. */
  ohFactor: number;
};

export function computeTotals(doc: EstimateDocument): EstimateTotals {
  const mat = doc.areas.reduce((sum, area) => sum + areaTotal(area), 0);
  const ohAmt = mat * (doc.ohPct / 100);
  const matOh = mat + ohAmt;
  const delAmt = matOh * (doc.delPct / 100); // delivery/install compound on material+OH
  const insAmt = matOh * (doc.insPct / 100);
  const baseBid = matOh + delAmt + insAmt;
  const subTotal = doc.subItems.reduce((sum, sub) => sum + sub.cost * (1 + sub.markupPct / 100), 0);
  return {
    mat,
    ohAmt,
    matOh,
    delAmt,
    insAmt,
    baseBid,
    subTotal,
    totalBid: baseBid + subTotal,
    ohFactor: 1 + doc.ohPct / 100
  };
}

/** Alternates never enter the bid totals. */
export function altTotal(alt: { qty: number; price: number }): number {
  return Math.round((alt.qty || 1) * (alt.price || 0) * 100) / 100;
}

/** Whole dollars, rounding at display time — matches v2.1's fmt$. */
export function money(value: number): string {
  return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
