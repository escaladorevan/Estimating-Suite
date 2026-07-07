import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { defaultDocument, nextUid, type EstimateArea } from "./document";
import { altTotal, areaTotal, computeTotals, money } from "./math";
import { parseTakeoffRows, takeoffAreaTotal } from "./takeoff-import";

function makeArea(overrides: Partial<EstimateArea> = {}): EstimateArea {
  return {
    id: 1,
    name: "Lobby",
    qty: 1,
    ignore: false,
    noPrint: false,
    sections: [
      {
        id: 2,
        name: "Casework",
        ignore: false,
        noPrint: false,
        items: [
          { id: 3, desc: "Lowers", qty: 10, unit: "lin. ft", unitCost: 155, drawingRef: "", ignore: false, noPrint: false },
          { id: 4, desc: "Uppers", qty: 8, unit: "lin. ft", unitCost: 125, drawingRef: "", ignore: false, noPrint: false }
        ]
      }
    ],
    ...overrides
  };
}

describe("pricing math (spec §3 formulas)", () => {
  it("computes the full chain with defaults 15/5/20", () => {
    const doc = defaultDocument();
    doc.areas = [makeArea()]; // mat = 10×155 + 8×125 = 2550
    const totals = computeTotals(doc);
    expect(totals.mat).toBe(2550);
    expect(totals.ohAmt).toBeCloseTo(382.5);
    expect(totals.matOh).toBeCloseTo(2932.5);
    expect(totals.delAmt).toBeCloseTo(146.625); // on material+OH, not raw material
    expect(totals.insAmt).toBeCloseTo(586.5);
    expect(totals.baseBid).toBeCloseTo(3665.625);
    expect(totals.ohFactor).toBeCloseTo(1.15);
  });

  it("area qty multiplies the whole area; ignore zeroes; noPrint does not affect math", () => {
    const doc = defaultDocument();
    doc.areas = [makeArea({ qty: 4, noPrint: true })];
    expect(computeTotals(doc).mat).toBe(10200);
    doc.areas = [makeArea({ ignore: true })];
    expect(computeTotals(doc).mat).toBe(0);
  });

  it("subs get markup only — no OH/D&I — and screen totals include them (bug fix #3)", () => {
    const doc = defaultDocument();
    doc.areas = [makeArea()];
    doc.subItems = [{ desc: "Glass", cost: 1000, markupPct: 10 }];
    const totals = computeTotals(doc);
    expect(totals.subTotal).toBeCloseTo(1100);
    expect(totals.totalBid).toBeCloseTo(totals.baseBid + 1100);
  });

  it("alternates never enter totals", () => {
    const doc = defaultDocument();
    doc.areas = [makeArea()];
    doc.altItems = [{ desc: "Alt 1", qty: 2, unit: "ea.", price: 500 }];
    expect(computeTotals(doc).totalBid).toBeCloseTo(3665.625);
    expect(altTotal(doc.altItems[0])).toBe(1000);
  });

  it("formats whole dollars like v2.1", () => {
    expect(money(67984.4)).toBe("$67,984");
  });
});

describe("document defaults", () => {
  it("carries the verbatim v2.1 term defaults with sub-line flags", () => {
    const doc = defaultDocument();
    expect(doc.exclusions).toHaveLength(15);
    expect(doc.exclusions[0].sub).toBe(false);
    expect(doc.exclusions[9]).toMatchObject({ sub: true, active: true });
    expect(doc.exclusions[9].text).toContain("FRP panels");
    expect(doc.clarifications).toHaveLength(3);
    expect(doc.generalTerms).toHaveLength(6);
    expect(doc.warranty).toHaveLength(4);
    expect(doc.finishTerms).toHaveLength(4);
    expect(doc.hardwareTerms).toHaveLength(6);
    expect(doc.fabNote).toHaveLength(3);
    expect(doc).toMatchObject({ ohPct: 15, delPct: 5, insPct: 20, pricingMode: "byarea" });
    expect(doc.info).toMatchObject({ shipVia: "Truck", terms: "Net 30", estimator: "Evan Ramsey", docType: "Proposal" });
  });

  it("hands out monotonically increasing uids", () => {
    const doc = defaultDocument();
    expect(nextUid(doc)).toBe(2);
    expect(nextUid(doc)).toBe(3);
  });
});

describe("takeoff import classification", () => {
  const header = ["Name", "Measurement 1", "Units 1", "Qty", "Units", "SKU", "Description", "Cost Each"];

  it("maps priced exports: areas, primary-row skip, proper and simple items", () => {
    const parsed = parseTakeoffRows([
      header,
      ["Beverage Station", "9.17", "", "9.17", "", "", "", ""],
      ["  C-Top w/4\" Splash", "5.17", "FT", "5.17", "", "", "", "55.00"], // primary → skip
      ["    C-Top w/4\" Splash", "", "", "5.17", "LF", "", "", "55.00"], // proper child → item
      ["  Bench With Drawers", "3.5", "LF", "3.5", "LF", "", "", "200"], // simple → item
      ["  Bench", "19.47", "FT", "", "", "", "", ""] // unpriced condition → skipped, no phantom area
    ])!;
    expect(parsed.measuredOnly).toBe(false);
    expect(parsed.areas).toHaveLength(1);
    expect(parsed.areas[0].items).toEqual([
      { desc: "C-Top w/4\" Splash", qty: 5.17, unit: "LF", unitCost: 55 },
      { desc: "Bench With Drawers", qty: 3.5, unit: "LF", unitCost: 200 }
    ]);
  });

  it("maps measured-only exports (Format B) with zero costs", () => {
    const parsed = parseTakeoffRows([
      ["Group", "Measurement 1", "Units 1"],
      ["Kitchen", "12", ""],
      ["Lowers", "12", "FT"]
    ])!;
    expect(parsed.measuredOnly).toBe(true);
    expect(parsed.areas[0].items[0]).toEqual({ desc: "Lowers", qty: 12, unit: "FT", unitCost: 0 });
  });

  it("returns null when no ZZTakeoff header exists", () => {
    expect(parseTakeoffRows([["random", "sheet"], ["no", "header"]])).toBeNull();
  });
});

const CSV = "project/uploads/Archies Playground_2026-05-07T15-12-51.csv";

describe.skipIf(!existsSync(CSV))("against the real Archies ZZTakeoff export", () => {
  const workbook = XLSX.read(readFileSync(CSV, "utf8"), { type: "string", raw: true });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "", raw: false });
  const parsed = parseTakeoffRows(rows as unknown[][])!;

  it("finds the real areas", () => {
    const names = parsed.areas.map((area) => area.name);
    expect(names).toContain("Beverage Station");
    expect(names).toContain("Check Out / Aisle Casework");
  });

  it("reproduces the export's own rolled-up area total for Beverage Station", () => {
    const beverage = parsed.areas.find((area) => area.name === "Beverage Station")!;
    // The CSV's group row says Cost Total = 1251.17. The export displays
    // rounded quantities (5.17 for a true 5.1667), so item math lands within
    // display precision — the same behavior as v2.1 importing the same file.
    expect(takeoffAreaTotal(beverage)).toBeCloseTo(1251.17, 0);
    expect(beverage.items.length).toBe(4);
  });
});
