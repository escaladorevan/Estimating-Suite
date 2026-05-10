import type { jsPDF } from "jspdf";
import { calculateEstimateTotals } from "./estimate-math";
import type { Estimate } from "../types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const companyLines = [
  "Form and Structure, Inc.",
  "10708 NE 2nd Ave",
  "Portland, OR 97211",
  "Tel: (503) 289-9204",
  "CCB# 52938"
];

const defaultExclusions = [
  "Any item shown in plan view but not dimensioned, detailed, or called out in elevations.",
  "Site finishing, including painting, patching, and putty work.",
  "Phased delivery or installation beyond a single mobilization.",
  "Mock-ups or material samples beyond standard submittals.",
  "Installation labor performed at prevailing wage rates unless explicitly included in the proposal.",
  "LEED documentation or AWI certification unless otherwise noted."
];

const generalTerms = [
  "F&S reserves the right to adjust prices 30 days after the original bid date.",
  "All quoted material and hardware pricing is based on availability and costs at the time of bid.",
  "F&S reserves the right to adjust pricing due to unforeseen increases at time of ordering.",
  "Any changes will require written approval via change order prior to procurement.",
  "All work will be performed during standard working hours unless otherwise agreed upon.",
  "F&S maintains standard commercial liability and workers' compensation coverage."
];

const warrantyTerms = [
  "Standard warranty is one (1) year, written or implied, unless otherwise stated in the proposal or contract.",
  "Casework is constructed using dowel-and-screw joinery per industry standards.",
  "Dovetail joinery or other premium construction methods are not included unless specifically requested.",
  "Standard finish consists of one coat of sanding sealer and two coats of clear lacquer."
];

const finishTerms = [
  "If finish schedule is not available at the time of bid, plastic laminate pricing is based on standard colors and patterns.",
  "A maximum of four (4) plastic laminate colors is included per project.",
  "Additional colors may result in upcharges."
];

const hardwareTerms = [
  "Hinges: Blum 125 degree concealed, self-closing, no magnetic catches.",
  "Pulls: Brushed chrome standard pulls.",
  "Drawer slides: Accuride 3832 full-extension slides.",
  "Adjustable shelving: 5mm hole system with KV nickel spoon supports.",
  "In-wall support brackets are to be furnished by F&S but installed by the general contractor."
];

function documentTitle(estimate: Estimate) {
  return estimate.documentType ?? "Proposal";
}

export function buildProposalPdf(doc: jsPDF, estimate: Estimate) {
  const totals = calculateEstimateTotals(estimate);
  let y = 18;

  drawFirstPageHeader(doc, estimate);
  y = 82;
  y = drawProjectMeta(doc, estimate, y);
  y = drawScopeTable(doc, estimate, totals.delivery + totals.install, y + 8);
  y = drawTermsSection(doc, "Exclusions / Clarifications", y + 9, [
    "EXCLUSIONS",
    "Unless explicitly noted in the proposal, the following items are excluded from Form & Structure's scope of work:",
    ...mergeTerms(defaultExclusions, estimate.exclusions),
    "",
    "CLARIFICATIONS",
    ...estimate.clarifications
  ]);

  doc.addPage();
  drawContinuationHeader(doc, estimate);
  y = 34;
  y = drawTermsSection(doc, "CLARIFICATIONS:", y, estimate.clarifications.length ? estimate.clarifications : ["Scope is based on the bid documents and clarifications listed in this proposal."]);
  y = drawTermsSection(doc, "GENERAL TERMS:", y + 5, generalTerms);
  y = drawTermsSection(doc, "WARRANTY AND FABRICATION:", y + 5, warrantyTerms);
  y = drawTermsSection(doc, "FINISH MATERIALS:", y + 5, finishTerms);
  y = drawTermsSection(doc, "HARDWARE ASSUMPTIONS:", y + 5, hardwareTerms);
  y = drawTermsSection(doc, "FABRICATION NOTE:", y + 5, [
    "Unless otherwise agreed upon in writing, all casework will be fabricated using dowel-and-screw construction, which meets or exceeds typical performance requirements.",
    "While some projects may be specified at AWI Custom Grade, fabrication will follow standard construction methods unless explicitly required and priced accordingly."
  ]);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.text(`Please Note: Prices valid for ${estimate.validDays ?? 30} days.`, 16, Math.min(y + 10, 250));
  doc.setDrawColor(0);
  doc.line(16, 267, 75, 267);
  doc.setFont("helvetica", "normal");
  doc.text("Authorized Signature", 16, 272);
}

function drawFirstPageHeader(doc: jsPDF, estimate: Estimate) {
  drawLogoMark(doc, 18, 17);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(companyLines, 146, 16, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.text(`Date  ${formatDate(estimate.bidDate)}`, 146, 38, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(documentTitle(estimate), 16, 50);
  doc.setLineWidth(0.7);
  doc.line(16, 55, 194, 55);

  doc.setFontSize(9);
  doc.text("To:", 16, 62);
  doc.text(estimate.client || "Client", 24, 62);
  doc.setFont("helvetica", "normal");
  const address = estimate.clientAddress ? estimate.clientAddress.split(/\r?\n/) : [];
  doc.text(address, 24, 68);
  doc.line(16, 78, 194, 78);
}

function drawContinuationHeader(doc: jsPDF, estimate: Estimate) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`Form and Structure, Inc.  ${documentTitle(estimate)}`, 16, 14);
  doc.setFont("helvetica", "normal");
  doc.text(`${estimate.projectId || estimate.proposalNumber || estimate.id} - ${estimate.projectName}`, 16, 20);
  doc.text(`Date  ${formatDate(estimate.bidDate)}`, 74, 20);
  doc.text(estimate.client || "Client", 16, 26);
  doc.text("Page No. 2 of 2 Pages", 146, 20);
  doc.setLineWidth(0.7);
  doc.line(16, 31, 194, 31);
}

function drawLogoMark(doc: jsPDF, x: number, y: number) {
  doc.setDrawColor(0);
  doc.setFillColor(32, 30, 27);
  doc.roundedRect(x + 11, y + 7, 14, 14, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5);
  doc.text("Form and Structure", x + 1, y, { angle: 0 });
  doc.setTextColor(255);
  doc.setFontSize(9);
  doc.text("FS", x + 14, y + 17);
  doc.setTextColor(0);
}

function drawProjectMeta(doc: jsPDF, estimate: Estimate, y: number) {
  const leftX = 16;
  const rightX = 104;
  const gap = 7;
  const rows: Array<[string, string, string, string]> = [
    ["Attention", estimate.clientContact ?? "", "Project Id", estimate.projectId || estimate.proposalNumber || estimate.id],
    ["Project Desc.", estimate.projectName, "Ship Via", estimate.shipVia ?? ""],
    ["Terms", estimate.paymentTerms || `Net ${estimate.validDays ?? 30}`, "P.O. Number", estimate.poNumber || "n/a"],
    ["Delivery Date", estimate.deliveryDate ?? "", "Estimator", estimate.estimator ?? ""]
  ];

  doc.setFontSize(8);
  for (const [l1, v1, l2, v2] of rows) {
    doc.setFont("helvetica", "bold");
    doc.text(`${l1} :`, leftX, y);
    doc.text(`${l2} :`, rightX, y);
    doc.setFont("helvetica", "normal");
    doc.text(v1, leftX + 24, y);
    doc.text(v2, rightX + 26, y);
    y += gap;
  }
  return y;
}

function drawScopeTable(doc: jsPDF, estimate: Estimate, deliveryInstall: number, startY: number) {
  let y = startY;
  const cols = { desc: 16, ref: 112, qty: 140, unit: 154, price: 194 };
  doc.setLineWidth(0.7);
  doc.line(16, y, 194, y);
  y += 2;
  doc.setFillColor(225, 224, 221);
  doc.rect(16, y, 178, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Description", cols.desc, y + 5);
  doc.text("Drawing Ref", cols.ref, y + 5);
  doc.text("Qty", cols.qty, y + 5);
  doc.text("Unit", cols.unit, y + 5);
  doc.text("Price", cols.price, y + 5, { align: "right" });
  y += 10;
  doc.line(16, y, 194, y);
  y += 5;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("PROJECT:", cols.desc, y);
  doc.setFont("helvetica", "normal");
  doc.text((estimate.scopeSummary || estimate.projectName).toUpperCase(), cols.desc + 39, y);
  y += 5;
  if (estimate.bidDocuments) {
    doc.setFont("helvetica", "bold");
    doc.text("Bid Documents:", cols.desc, y);
    doc.setFont("helvetica", "normal");
    doc.text(estimate.bidDocuments, cols.desc + 39, y);
    y += 5;
  }
  if (estimate.drawingsDated) {
    doc.setFont("helvetica", "bold");
    doc.text("Drawings Dated:", cols.desc, y);
    doc.setFont("helvetica", "normal");
    doc.text(estimate.drawingsDated, cols.desc + 39, y);
    y += 7;
  }

  for (const area of estimate.areas) {
    if (area.ignored || area.noPrint) continue;
    for (const section of area.sections) {
      if (section.ignored || section.noPrint) continue;
      for (const item of section.items) {
        if (item.ignored || item.noPrint) continue;
        if (y > 242) {
          doc.addPage();
          y = 20;
        }
        doc.setFont("helvetica", "bold");
        doc.text(item.name || item.description || "Scope item", cols.desc, y);
        doc.setFont("helvetica", "normal");
        doc.text(item.drawingRef ?? "", cols.ref, y);
        doc.text(String(item.qty || 1), cols.qty + 4, y, { align: "right" });
        doc.text(item.unit || "lump sum", cols.unit, y);
        doc.text(money.format(item.qty * item.unitCost), cols.price, y, { align: "right" });
        y += 5;
      }
    }
  }

  y += 3;
  doc.setDrawColor(150);
  doc.line(16, y, 194, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text("Delivery & Installation", cols.desc, y);
  doc.text("1", cols.qty + 4, y, { align: "right" });
  doc.text("job", cols.unit, y);
  doc.text(money.format(deliveryInstall), cols.price, y, { align: "right" });
  y += 7;
  doc.setDrawColor(0);
  doc.line(16, y, 194, y);
  y += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Base Bid", cols.desc, y);
  doc.text("1", cols.qty + 4, y, { align: "right" });
  doc.text("$", cols.unit + 4, y);
  doc.text(money.format(calculateEstimateTotals(estimate).bidTotal), cols.price, y, { align: "right" });
  y += 7;
  doc.line(16, y, 194, y);
  return y;
}

function drawTermsSection(doc: jsPDF, title: string, y: number, lines: string[]) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(title, 16, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.4);
  for (const line of lines) {
    if (!line) {
      y += 3;
      continue;
    }
    const wrapped = doc.splitTextToSize(line, 168) as string[];
    doc.text(wrapped, 20, y);
    y += Math.max(4, wrapped.length * 3.8);
    if (y > 272) {
      doc.addPage();
      y = 18;
    }
  }
  return y;
}

function mergeTerms(defaults: string[], custom: string[]) {
  const customSet = custom.map((term) => term.trim()).filter(Boolean);
  return [...customSet, ...defaults.filter((term) => !customSet.includes(term))];
}

function formatDate(value?: string) {
  if (!value) return new Date().toLocaleDateString("en-US");
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
}
