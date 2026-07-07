// Orchestrates a Master V4 workbook import against the repositories.
// Reads the workbook client-side with SheetJS, maps via master-workbook.ts,
// and upserts: opportunities (on opportunity_number), jobs (on job_number,
// linked to their opportunity by bid ref), change orders (linked by bid ref;
// plus one synthetic approved CO per job carrying the sheet's approved-CO
// total so current-contract math survives the import).

import { listOpportunities, saveOpportunity } from "../repos/opportunities";
import { listChangeOrders, saveChangeOrder, saveJob } from "../repos/jobs";
import { assignOpportunityNumbers, parseMasterWorkbookSheets, type ParsedMasterWorkbook } from "./master-workbook";
import type { ChangeOrder } from "../types";

export async function readMasterWorkbook(buffer: ArrayBuffer): Promise<ParsedMasterWorkbook> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer);
  const sheet = (matcher: (name: string) => boolean) => {
    const name = workbook.SheetNames.find(matcher);
    return name ? XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name], { defval: "" }) : [];
  };
  return parseMasterWorkbookSheets({
    bidTracker: sheet((n) => n.includes("Bid Tracker")),
    currentJobs: sheet((n) => n.includes("Current Jobs")),
    changeOrders: sheet((n) => n.includes("Change Order"))
  });
}

export type ImportResult = {
  opportunities: number;
  jobs: number;
  changeOrders: number;
  failures: string[];
};

export async function runMasterImport(parsed: ParsedMasterWorkbook, author: string): Promise<ImportResult> {
  const result: ImportResult = { opportunities: 0, jobs: 0, changeOrders: 0, failures: [] };
  const opportunityIdByNumber = new Map<string, string>();

  const existing = await listOpportunities().catch(() => []);
  const numbered = assignOpportunityNumbers(parsed.opportunities, existing);

  for (const opp of numbered) {
    try {
      const saved = await saveOpportunity(opp);
      opportunityIdByNumber.set(saved.opportunityNumber, saved.id);
      result.opportunities += 1;
    } catch {
      result.failures.push(`Opportunity ${opp.opportunityNumber || opp.projectName}`);
    }
  }

  const existingCos = await listChangeOrders().catch(() => [] as ChangeOrder[]);
  const jobIdByBidRef = new Map<string, string>();

  for (const { job, approvedCoAmount } of parsed.jobs) {
    try {
      const linked = { ...job, opportunityId: opportunityIdByNumber.get(job.bidRef) ?? null };
      const saved = await saveJob(linked);
      if (saved.bidRef) jobIdByBidRef.set(saved.bidRef, saved.id);
      result.jobs += 1;

      if (approvedCoAmount && !existingCos.some((co) => co.jobId === saved.id && co.notes === "Imported from Master V4")) {
        await saveChangeOrder({
          id: "",
          jobId: saved.id,
          description: "Approved COs carried from Master V4 import",
          amount: approvedCoAmount,
          status: "approved",
          submittedDate: "",
          approvedDate: "",
          createdBy: author,
          notes: "Imported from Master V4"
        });
      }
    } catch {
      result.failures.push(`Job ${job.jobNumber}`);
    }
  }

  for (const co of parsed.changeOrders) {
    const jobId = jobIdByBidRef.get(co.jobBidRef);
    if (!jobId) {
      result.failures.push(`CO ${co.coNumber} (no job with bid ref ${co.jobBidRef})`);
      continue;
    }
    const duplicate = existingCos.some((existing) => existing.jobId === jobId && existing.description === co.description);
    if (duplicate) continue;
    try {
      await saveChangeOrder({
        id: "",
        jobId,
        description: co.description,
        amount: co.amount,
        status: co.status,
        submittedDate: co.submittedDate,
        approvedDate: co.approvedDate,
        createdBy: author,
        notes: co.notes || co.coNumber
      });
      result.changeOrders += 1;
    } catch {
      result.failures.push(`CO ${co.coNumber}`);
    }
  }

  return result;
}
