/**
 * Master V4 import dry run — no writes anywhere.
 *
 * Parses the reference workbook exactly the way the in-app importer does and
 * reports what would be imported, so the go-live import can be sanity-checked
 * against real data first. Run: npx vitest run scripts/import-dryrun.test.ts --root . --globals --environment node
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { mapEstimatingMasterRow } from "../src/lib/opportunity-import";

const WORKBOOK = "project/uploads/Estimating_Master_v4.xlsx";

describe("Master V4 import dry run", () => {
  it.skipIf(!existsSync(WORKBOOK))("maps the real workbook and reports stats", () => {
    const workbook = XLSX.read(readFileSync(WORKBOOK));
    const bidSheetName = workbook.SheetNames.find((name) => name.includes("2026 Bid Tracker")) ?? workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[bidSheetName], { defval: "" });
    const mapped = rows.map(mapEstimatingMasterRow).filter((opportunity) => opportunity.jobId || opportunity.projectName);

    const byStatus = new Map<string, number>();
    for (const opp of mapped) byStatus.set(opp.status, (byStatus.get(opp.status) ?? 0) + 1);
    const won = mapped.filter((o) => o.winLoss === "Won").length;
    const lost = mapped.filter((o) => o.winLoss === "Lost").length;
    const open = mapped.filter((o) => !o.winLoss).length;
    const totalValue = mapped.reduce((sum, o) => sum + o.estimatedValue, 0);
    const missingProject = mapped.filter((o) => !o.projectName).length;
    const missingClient = mapped.filter((o) => !o.client).length;

    console.log(`\nSheet: ${bidSheetName}`);
    console.log(`Rows in sheet: ${rows.length}, mapped opportunities: ${mapped.length}`);
    console.log(`Won: ${won}, Lost: ${lost}, Open/waiting: ${open}`);
    console.log(`Total estimated value: $${totalValue.toLocaleString()}`);
    console.log(`Statuses: ${[...byStatus.entries()].map(([status, count]) => `${status}=${count}`).join(", ")}`);
    console.log(`Rows missing project name: ${missingProject}, missing client: ${missingClient}`);
    console.log(`First 3: ${mapped.slice(0, 3).map((o) => `${o.jobId || "(no ref)"} ${o.projectName} [${o.status}]`).join(" | ")}`);

    expect(mapped.length).toBeGreaterThan(0);
    expect(mapped.every((o) => typeof o.estimatedValue === "number")).toBe(true);
  });
});
