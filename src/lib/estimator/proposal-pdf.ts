// Proposal PDF renderer — format of record per docs/spec-estimator.md §6.
// Deliberate fixes over v2.1: exclusions paginate instead of truncating, and
// page headers carry real page counts instead of "2 of 2".

import type { jsPDF } from "jspdf";
import type { EstimateDocument, TermLine } from "./document";
import { computeTotals } from "./math";
import { buildLineRows } from "./proposal-rows";
import { LOGO_B64 } from "./logo";

const LM = 19;
const RM = 192;
const BM = 275;
const COL = { desc: 19, ref: 115, qty: 143, unit: 154, price: 192 };

type Ctx = { pdf: jsPDF; doc: EstimateDocument; y: number };

function header(ctx: Ctx, continued: boolean) {
  const { pdf, doc } = ctx;
  pdf.setFont("helvetica", "bold").setFontSize(9);
  pdf.text(`Form and Structure, Inc.  ${doc.info.docType}`, LM, 16);
  pdf.setFont("helvetica", "normal").setFontSize(8);
  pdf.text(`${doc.info.id} - ${doc.info.name}    Date  ${doc.info.bidDate}`, LM, 21);
  if (continued) pdf.text("Continued…", RM, 21, { align: "right" });
  pdf.text(doc.info.client, LM, 26);
  pdf.setLineWidth(0.5).line(LM, 29, RM, 29);
  ctx.y = 35;
}

function checkY(ctx: Ctx, needed = 5) {
  if (ctx.y + needed <= BM) return;
  ctx.pdf.addPage();
  header(ctx, true);
}

function textRow(ctx: Ctx, row: { desc: string; drawingRef?: string; qty?: string; unit?: string; price?: string }, opts: { bold?: boolean; italic?: boolean; size?: number; indent?: number } = {}) {
  const { pdf } = ctx;
  checkY(ctx);
  pdf.setFont("helvetica", opts.bold ? "bold" : opts.italic ? "italic" : "normal").setFontSize(opts.size ?? 8.5);
  pdf.text(row.desc, COL.desc + (opts.indent ?? 0), ctx.y);
  if (row.drawingRef) pdf.text(row.drawingRef, COL.ref, ctx.y);
  if (row.qty) pdf.text(row.qty, COL.qty, ctx.y, { align: "right" });
  if (row.unit) pdf.text(row.unit, COL.unit, ctx.y);
  if (row.price) pdf.text(row.price, COL.price, ctx.y, { align: "right" });
  ctx.y += opts.size && opts.size >= 10 ? 6 : 4.6;
}

function rule(ctx: Ctx, weight: number, gap = 2.5) {
  checkY(ctx, gap + 2);
  ctx.pdf.setLineWidth(weight).line(LM, ctx.y, RM, ctx.y);
  ctx.y += gap;
}

function writeWrapped(ctx: Ctx, text: string, indent: number) {
  const wrapped = ctx.pdf.splitTextToSize(text, RM - LM - indent - 1) as string[];
  for (const part of wrapped) {
    checkY(ctx);
    ctx.pdf.text(part, LM + indent, ctx.y);
    ctx.y += 3.8;
  }
}

function termLines(ctx: Ctx, heading: string, lines: TermLine[], always = false) {
  const active = lines.filter((line) => line.active);
  if (!active.length && !always) return;
  checkY(ctx, 10);
  ctx.pdf.setFont("helvetica", "bold").setFontSize(8.5);
  ctx.pdf.text(heading, LM, ctx.y);
  ctx.y += 4.6;
  ctx.pdf.setFont("helvetica", "normal").setFontSize(7.5);
  for (const line of active) {
    writeWrapped(ctx, line.text, 3 + (line.sub ? 6 : 0));
  }
  ctx.y += 3;
}

export function renderProposal(pdf: jsPDF, doc: EstimateDocument): void {
  const totals = computeTotals(doc);
  const ctx: Ctx = { pdf, doc, y: 0 };
  const info = doc.info;

  // ── Page 1 head ────────────────────────────────────────────────────────────
  try {
    pdf.addImage(LOGO_B64, "JPEG", LM, 10, 56, 56 * (219 / 800));
  } catch {
    pdf.setFont("helvetica", "bold").setFontSize(13).text("Form and Structure", LM, 18);
  }
  pdf.setFontSize(7.5);
  const company = ["Form and Structure, Inc.", "10708 NE 2nd Ave", "Portland, OR 97211", "Tel: (503) 289-9204", "CCB# 52938"];
  company.forEach((line, index) => {
    pdf.setFont("helvetica", index === 0 ? "bold" : "normal");
    pdf.text(line, RM, 11 + index * 3.4, { align: "right" });
  });

  ctx.y = 34;
  pdf.setFont("helvetica", "bold").setFontSize(16).text(info.docType, LM, ctx.y);
  pdf.setFont("helvetica", "normal").setFontSize(8.5).text(`Date  ${info.bidDate}`, RM, ctx.y, { align: "right" });
  ctx.y += 2.5;
  rule(ctx, 0.6, 5);

  pdf.setFont("helvetica", "bold").setFontSize(8.5);
  pdf.text("To:", LM, ctx.y);
  pdf.text(info.client, LM + 10, ctx.y);
  ctx.y += 4.2;
  pdf.setFont("helvetica", "normal");
  for (const part of info.address.split(",").map((s) => s.trim()).filter(Boolean)) {
    pdf.text(part, LM + 10, ctx.y);
    ctx.y += 3.8;
  }
  ctx.y += 1;
  pdf.setDrawColor(150, 150, 150).setLineWidth(0.2).line(LM, ctx.y, RM, ctx.y);
  pdf.setDrawColor(0, 0, 0);
  ctx.y += 5;

  const infoPairs: [string, string, string, string][] = [
    ["Attention", info.attention, "Project Id", info.id],
    ["Project Desc.", info.name, "Ship Via", info.shipVia],
    ["Terms", info.terms, "P.O. Number", info.poNumber || "n/a"],
    ["Delivery Date", info.deliveryDate, "Estimator", info.estimator]
  ];
  pdf.setFontSize(8);
  for (const [l1, v1, l2, v2] of infoPairs) {
    pdf.setFont("helvetica", "bold").text(`${l1}:`, LM, ctx.y);
    pdf.setFont("helvetica", "normal").text(v1 || "", LM + 24, ctx.y);
    pdf.setFont("helvetica", "bold").text(`${l2}:`, 110, ctx.y);
    pdf.setFont("helvetica", "normal").text(v2 || "", 134, ctx.y);
    ctx.y += 4.2;
  }
  rule(ctx, 0.6, 4);

  // Column header band
  pdf.setFillColor(217, 217, 217).rect(LM, ctx.y - 3.2, RM - LM, 5, "F");
  pdf.setFont("helvetica", "bold").setFontSize(7.5);
  pdf.text("Description", COL.desc + 1, ctx.y);
  pdf.text("Drawing Ref", COL.ref, ctx.y);
  pdf.text("Qty", COL.qty, ctx.y, { align: "right" });
  pdf.text("Unit", COL.unit, ctx.y);
  pdf.text("Price", COL.price, ctx.y, { align: "right" });
  ctx.y += 2;
  rule(ctx, 0.3, 4.5);

  // PROJECT block
  const projectLines: [string, string][] = [
    ["PROJECT:", info.name.toUpperCase()],
    ["Bid Documents:", info.bidDocs],
    ["Architect:", info.architect],
    ["Drawings Dated:", info.drawingsDated],
    ["Specifications Dated:", info.specsDated],
    ["Addendums:", info.addendums]
  ];
  pdf.setFontSize(8.5);
  for (const [label, value] of projectLines) {
    if (!value) continue;
    pdf.setFont("helvetica", "bold").text(label, LM, ctx.y);
    pdf.setFont("helvetica", "normal").text(value, LM + 38, ctx.y);
    ctx.y += 4.2;
  }
  ctx.y += 1.5;

  // ── Line rows ────────────────────────────────────────────────────────────
  for (const row of buildLineRows(doc, totals)) {
    if (row.style === "di") rule(ctx, 0.2, 3.5);
    if (row.style === "basebid") rule(ctx, 0.5, 4);
    textRow(ctx, row, {
      bold: row.style === "bold" || row.style === "basebid",
      italic: row.style === "subtotal",
      size: row.style === "basebid" ? 10 : row.style === "item" ? 7.5 : 8.5,
      indent: row.style === "item" ? 4 : 0
    });
    if (row.style === "basebid") rule(ctx, 0.8, 5);
  }

  // Alternates
  if (doc.altItems.length) {
    checkY(ctx, 10);
    pdf.setFont("helvetica", "bold").setFontSize(8.5).text("ALTERNATES", LM, ctx.y);
    ctx.y += 4.6;
    doc.altItems.forEach((alt, index) => {
      textRow(ctx, {
        desc: `Alternate No. ${index + 1}:  ${alt.desc}`,
        qty: String(alt.qty),
        unit: alt.unit,
        price: "$" + (Math.round(alt.qty * alt.price * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })
      });
    });
    ctx.y += 2;
  }

  // Exclusions — paginated (v2.1 fix #1)
  checkY(ctx, 12);
  pdf.setFont("helvetica", "bold").setFontSize(8.5).text("Exclusions / Clarifications", LM, ctx.y);
  ctx.y += 5;
  termLines(ctx, "EXCLUSIONS", doc.exclusions);

  // ── Page 2+: terms ───────────────────────────────────────────────────────
  pdf.addPage();
  header(ctx, false);
  termLines(ctx, "CLARIFICATIONS:", doc.clarifications, true);
  termLines(ctx, "GENERAL TERMS:", doc.generalTerms);
  termLines(ctx, "WARRANTY AND FABRICATION:", doc.warranty);
  termLines(ctx, "FINISH MATERIALS:", doc.finishTerms);
  termLines(ctx, "HARDWARE ASSUMPTIONS:", doc.hardwareTerms);
  termLines(ctx, "FABRICATION NOTE:", doc.fabNote);

  checkY(ctx, 22);
  ctx.y += 6;
  pdf.setFont("helvetica", "italic").setFontSize(8).text("Please Note: Prices valid for 30 days.", LM, ctx.y);
  ctx.y += 10;
  pdf.setLineWidth(0.3).line(LM, ctx.y, LM + 64, ctx.y);
  pdf.setFont("helvetica", "normal").text("Authorized Signature", LM, ctx.y + 4);

  // Real page numbers on pages 2+ (v2.1 fix #7)
  const total = pdf.getNumberOfPages();
  for (let page = 2; page <= total; page += 1) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal").setFontSize(8);
    pdf.text(`Page No. ${page} of ${total} Pages`, RM, 16, { align: "right" });
  }
}
