// Pure builders for the proposal's line rows — the part of the PDF that
// varies by pricing mode (docs/spec-estimator.md §4). Kept jsPDF-free so the
// mode logic is unit-testable.

import type { EstimateDocument } from "./document";
import { areaTotal, computeTotals, itemTotal, money, type EstimateTotals } from "./math";

export type ProposalRow = {
  desc: string;
  drawingRef?: string;
  qty?: string;
  unit?: string;
  price?: string;
  style: "bold" | "item" | "subtotal" | "sub" | "di" | "basebid";
};

/** D&I label collapses when only one percentage is set; row omitted when both are 0. */
export function deliveryInstallLabel(delPct: number, insPct: number): string | null {
  if (delPct > 0 && insPct > 0) return "Delivery & Installation";
  if (delPct > 0) return "Delivery";
  if (insPct > 0) return "Installation";
  return null;
}

export function buildLineRows(doc: EstimateDocument, totals: EstimateTotals = computeTotals(doc)): ProposalRow[] {
  const rows: ProposalRow[] = [];
  const printedAreas = doc.areas.filter((area) => !area.noPrint);

  if (doc.pricingMode === "lumpsum") {
    rows.push({
      desc: doc.info.name || "Base Scope of Work",
      qty: "1",
      unit: "lump sum",
      price: money(totals.matOh),
      style: "bold"
    });
  } else if (doc.pricingMode === "byarea") {
    for (const area of printedAreas) {
      rows.push({
        desc: area.name,
        qty: String(area.qty),
        unit: area.qty > 1 ? "rooms" : "lump sum",
        price: money(areaTotal(area) * totals.ohFactor),
        style: "bold"
      });
    }
  } else {
    for (const area of printedAreas) {
      rows.push({ desc: area.name, style: "bold" });
      rows.push(...itemizedRowsForArea(area, totals.ohFactor));
      rows.push({ desc: `${area.name} Subtotal`, price: money(areaTotal(area) * totals.ohFactor), style: "subtotal" });
    }
  }

  for (const sub of doc.subItems) {
    if (!sub.desc && !sub.cost) continue;
    rows.push({
      desc: sub.desc,
      qty: "1",
      unit: "lump sum",
      price: money(sub.cost * (1 + sub.markupPct / 100)),
      style: "sub"
    });
  }

  const diLabel = deliveryInstallLabel(doc.delPct, doc.insPct);
  if (diLabel && totals.delAmt + totals.insAmt > 0) {
    rows.push({
      desc: diLabel,
      qty: "1",
      unit: "job",
      price: money(Math.round((totals.delAmt + totals.insAmt) * 100) / 100),
      style: "di"
    });
  }

  rows.push({ desc: "Base Bid", qty: "1", unit: "$", price: money(totals.totalBid), style: "basebid" });
  return rows;
}

function itemizedRowsForArea(area: EstimateDocument["areas"][number], ohFactor: number): ProposalRow[] {
  const rows: ProposalRow[] = [];
  for (const section of area.sections) {
    if (section.noPrint) continue;
    for (const item of section.items) {
      if (item.noPrint) continue;
      rows.push({
        desc: item.desc,
        drawingRef: item.drawingRef,
        qty: String(item.qty),
        unit: item.unit,
        price: money(itemTotal(item) * ohFactor),
        style: "item"
      });
    }
  }
  return rows;
}

export function proposalFilename(doc: EstimateDocument): string {
  const slug = (value: string) => value.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30) || "x";
  const dateMatch = doc.info.bidDate.match(/^(\d{1,2})\/(\d{2})\/\d{4}$/);
  const datePart = dateMatch ? `${Number(dateMatch[1])}.${dateMatch[2]}` : "draft";
  return `${slug(doc.info.client)}_${slug(doc.info.name)}_${datePart}.pdf`;
}
