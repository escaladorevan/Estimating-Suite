import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { defaultDocument, nextUid } from "./document";
import { computeTotals } from "./math";
import { buildLineRows, deliveryInstallLabel, proposalFilename } from "./proposal-rows";
import { parseTakeoffRows } from "./takeoff-import";
import { renderProposal } from "./proposal-pdf";

function docWithArea() {
  const doc = defaultDocument();
  doc.info.name = "HMC Ortho Renovation";
  doc.info.client = "NOR Construction";
  doc.info.bidDate = "4/14/2026";
  doc.areas = [{
    id: 1, name: "Beverage Station", qty: 1, ignore: false, noPrint: false,
    sections: [{ id: 2, name: "Casework", ignore: false, noPrint: false, items: [
      { id: 3, desc: "C-Top", qty: 5, unit: "LF", unitCost: 55, drawingRef: "A-501", ignore: false, noPrint: false }
    ] }]
  }];
  return doc;
}

describe("buildLineRows", () => {
  it("byarea: one bold row per area, price grossed by ohFactor, D&I and Base Bid rows", () => {
    const doc = docWithArea();
    const rows = buildLineRows(doc);
    expect(rows[0]).toMatchObject({ desc: "Beverage Station", qty: "1", unit: "lump sum", style: "bold", price: "$316" }); // 275 × 1.15
    expect(rows.at(-2)).toMatchObject({ desc: "Delivery & Installation", unit: "job", style: "di" });
    expect(rows.at(-1)).toMatchObject({ desc: "Base Bid", unit: "$", style: "basebid" });
  });

  it("byarea: multi-room areas print 'rooms'; noPrint areas are skipped but still priced into Base Bid", () => {
    const doc = docWithArea();
    doc.areas[0].qty = 4;
    doc.areas.push({ ...structuredClone(doc.areas[0]), id: 9, qty: 1, noPrint: true, name: "Hidden" });
    const rows = buildLineRows(doc);
    expect(rows[0].unit).toBe("rooms");
    expect(rows.filter((r) => r.style === "bold")).toHaveLength(1);
    const totals = computeTotals(doc);
    expect(totals.mat).toBe(275 * 4 + 275); // hidden area still in the money
  });

  it("lumpsum: single row at matOh; itemized: item rows + subtotal", () => {
    const doc = docWithArea();
    doc.pricingMode = "lumpsum";
    expect(buildLineRows(doc)[0]).toMatchObject({ desc: "HMC Ortho Renovation", price: "$316", style: "bold" });
    doc.pricingMode = "itemized";
    const rows = buildLineRows(doc);
    expect(rows[0]).toMatchObject({ desc: "Beverage Station", style: "bold" });
    expect(rows[1]).toMatchObject({ desc: "C-Top", drawingRef: "A-501", qty: "5", unit: "LF", style: "item", price: "$316" });
    expect(rows[2]).toMatchObject({ desc: "Beverage Station Subtotal", style: "subtotal" });
  });

  it("subs print as '1 lump sum' with markup; D&I label collapses", () => {
    const doc = docWithArea();
    doc.subItems = [{ desc: "Glass", cost: 1000, markupPct: 10 }];
    const subRow = buildLineRows(doc).find((r) => r.style === "sub")!;
    expect(subRow).toMatchObject({ desc: "Glass", qty: "1", unit: "lump sum", price: "$1,100" });
    expect(deliveryInstallLabel(5, 20)).toBe("Delivery & Installation");
    expect(deliveryInstallLabel(5, 0)).toBe("Delivery");
    expect(deliveryInstallLabel(0, 20)).toBe("Installation");
    expect(deliveryInstallLabel(0, 0)).toBeNull();
  });

  it("builds the v2.1 filename shape", () => {
    expect(proposalFilename(docWithArea())).toBe("NOR_Construction_HMC_Ortho_Renovation_4.14.pdf");
  });
});

const CSV = "project/uploads/Archies Playground_2026-05-07T15-12-51.csv";
const OUT = "/tmp/claude-0/-home-user-Estimating-Suite/649e7026-5f26-5226-b449-707aa1b2b55b/scratchpad/v2-proposal-archies.pdf";

describe.skipIf(!existsSync(CSV))("renderProposal against the real Archies takeoff", () => {
  it("renders a multi-page PDF with real page numbers", () => {
    const workbook = XLSX.read(readFileSync(CSV, "utf8"), { type: "string", raw: true });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "", raw: false });
    const takeoff = parseTakeoffRows(rows as unknown[][])!;

    const doc = defaultDocument();
    doc.info.name = "Archies Playground";
    doc.info.client = "NOR Construction";
    doc.info.id = "Q-26-119";
    doc.info.bidDate = "4/14/2026";
    doc.info.attention = "Estimating";
    doc.info.address = "1234 SE Example St, Portland, OR 97202";
    for (const area of takeoff.areas) {
      doc.areas.push({
        id: nextUid(doc), name: area.name, qty: 1, ignore: false, noPrint: false,
        sections: [{ id: nextUid(doc), name: "Casework", ignore: false, noPrint: false,
          items: area.items.map((item) => ({ id: nextUid(doc), desc: item.desc, qty: item.qty, unit: item.unit, unitCost: item.unitCost, drawingRef: "", ignore: false, noPrint: false })) }]
      });
    }

    const pdf = new jsPDF({ unit: "mm", format: "letter" });
    renderProposal(pdf, doc);
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    writeFileSync(OUT, Buffer.from(pdf.output("arraybuffer")));
    expect(existsSync(OUT)).toBe(true);
  });
});
