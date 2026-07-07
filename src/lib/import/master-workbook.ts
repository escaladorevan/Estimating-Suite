// Pure mapping from the Estimating Master V4 workbook's three sheets into
// domain objects. Vocabulary and quirks verified against the real workbook:
// checkmark wins, "Sent"/"On Hold"/"Client Lost" statuses, Excel serial
// dates, bare job numbers with a separate PM letter column, and change
// orders that reference jobs by bid ref (Q-26-XXX), not job number.

import type { ChangeOrderStatus, Job, Opportunity, WinLoss } from "../types";

type Row = Record<string, unknown>;

const text = (value: unknown) => (value == null ? "" : String(value).trim());

const money = (value: unknown): number => {
  if (typeof value === "number") return value;
  const parsed = Number(text(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Excel serial numbers (days since 1899-12-30), MM/DD/YYYY, or ISO → ISO. */
export function normalizeWorkbookDate(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 20000 && value < 80000) {
    return new Date(Math.round((value - 25569) * 86_400_000)).toISOString().slice(0, 10);
  }
  const raw = text(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  return raw;
}

// ── Bid Tracker sheet → Opportunity ─────────────────────────────────────────
export const OPPORTUNITY_STATUSES = ["New", "Pricing", "Submitted", "Follow Up", "Cold", "Won", "Lost", "Archived"] as const;

const STATUS_ALIASES: Record<string, string> = {
  sent: "Submitted",
  pending: "Submitted",
  "on hold": "Cold",
  "client lost": "Lost",
  "client backed out": "Lost",
  declined: "Archived",
  "no bid": "Archived"
};

function mapStatus(value: unknown): string {
  const raw = text(value);
  const known = OPPORTUNITY_STATUSES.find((s) => s.toLowerCase() === raw.toLowerCase());
  return known ?? STATUS_ALIASES[raw.toLowerCase()] ?? "New";
}

function mapWinLoss(value: unknown): WinLoss {
  const raw = text(value).toLowerCase();
  if (["won", "yes", "y", "✔", "✓", "x"].includes(raw)) return "Won";
  if (["lost", "no", "n"].includes(raw)) return "Lost";
  return "";
}

export function mapBidTrackerRow(row: Row): Opportunity | null {
  const opportunityNumber = text(row["Job ID"]);
  const projectName = text(row["Project Name"]);
  if (!opportunityNumber && !projectName) return null;

  const status = mapStatus(row.Status);
  const winLoss = mapWinLoss(row["Win?"]) || (status === "Lost" ? "Lost" : "");
  const bidDueDate = normalizeWorkbookDate(row["Bid Due Date"]);
  const yearMatch = opportunityNumber.match(/^Q-(\d{2})-/);

  return {
    id: "",
    // Blank Job IDs stay blank here; assignOpportunityNumbers hands out the
    // next Q-YY-NNN before persisting (never the project name).
    opportunityNumber,
    month: text(row.Month),
    year: yearMatch ? 2000 + Number(yearMatch[1]) : bidDueDate ? Number(bidDueDate.slice(0, 4)) : null,
    client: text(row.Client),
    projectName,
    bidDueDate,
    drawingStage: text(row["Drawing Stage"]),
    bidType: text(row["Bid Type"]),
    sentDate: normalizeWorkbookDate(row["Sent Date"]),
    submissionMethod: text(row["Sub. Method"]),
    status: winLoss === "Won" ? "Won" : status,
    winLoss,
    jobType: text(row["Job Type"]),
    estValue: money(row["Est. Bid Value"]),
    linkDrawings: text(row["Link: Drawings"]),
    linkSpecs: text(row["Link: Specs"]),
    linkSchedule: text(row["Link: Schedule"]),
    notes: text(row.Notes),
    bidFeedback: text(row["Bid Feedback"]),
    ntpReceived: ["yes", "y", "true", "received", "✔", "✓"].includes(text(row["NTP Received?"]).toLowerCase()),
    finalCost: row["Final Cost"] === "" || row["Final Cost"] == null ? null : money(row["Final Cost"])
  };
}

// ── Current Jobs sheet → Job (+ approved-CO carry amount) ───────────────────
const PM_NAMES: Record<string, string> = { G: "Geoff", P: "Pat", J: "Joe" };

export type ImportedJob = {
  job: Job;
  /** "Appvd COs ($)" — becomes one synthetic approved CO so current-contract math holds. */
  approvedCoAmount: number;
};

export function mapCurrentJobsRow(row: Row): ImportedJob | null {
  const rawNumber = text(row["Job #"]);
  const project = text(row.Project);
  if (!rawNumber || !project) return null;

  const pmCode = text(row.PM).toUpperCase();
  const jobNumber = /^[0-9]+$/.test(rawNumber) && PM_NAMES[pmCode] ? `${pmCode}${rawNumber}` : rawNumber;
  const client = text(row.Client);

  return {
    job: {
      id: "",
      jobNumber,
      pm: PM_NAMES[pmCode] ?? "",
      client: client === "—" ? "" : client,
      projectName: project,
      status: "active",
      contractValue: money(row["Contract ($)"]),
      bidRef: text(row["Bid Ref"]),
      opportunityId: null,
      estimateId: null,
      installStart: normalizeWorkbookDate(row["Install Date"]),
      installEnd: "",
      crewSize: 1,
      gc: "",
      fabStatus: text(row["Fab Status"]),
      invoiceStatus: text(row["Invoice Status"]),
      notes: text(row.Notes)
    },
    approvedCoAmount: money(row["Appvd COs ($)"])
  };
}

// ── Change Order sheet ───────────────────────────────────────────────────────
export type ImportedChangeOrder = {
  /** Bid ref of the owning job ("Q-26-003") — resolved to a job at import time. */
  jobBidRef: string;
  coNumber: string;
  description: string;
  amount: number;
  status: ChangeOrderStatus;
  submittedDate: string;
  approvedDate: string;
  notes: string;
};

export function mapChangeOrderRow(row: Row): ImportedChangeOrder | null {
  const jobBidRef = text(row["Job ID"]);
  const description = text(row["CO Description"]);
  // The sheet carries a documentation row explaining the CO numbering format —
  // real rows always have a Job ID.
  if (!jobBidRef || !description) return null;

  const status = text(row.Status).toLowerCase();
  return {
    jobBidRef,
    coNumber: text(row["CO #"]),
    description,
    amount: money(row["Amount ($)"]),
    status: status === "approved" ? "approved" : "submitted",
    submittedDate: normalizeWorkbookDate(row["Date Submitted"]),
    approvedDate: normalizeWorkbookDate(row["Approved Date"]),
    notes: text(row.Notes)
  };
}

const Q_NUMBER = /^Q-(\d{2})-(\d{3})$/;

/**
 * Rows without a Job ID get the next sequential Q-YY-NNN. When an existing
 * record matches on client + project name, its number is reused so
 * re-importing the same workbook stays idempotent.
 */
export function assignOpportunityNumbers(
  opportunities: Opportunity[],
  existing: Pick<Opportunity, "opportunityNumber" | "client" | "projectName">[] = []
): Opportunity[] {
  const maxByYear = new Map<string, number>();
  for (const opp of [...existing, ...opportunities]) {
    const match = opp.opportunityNumber.match(Q_NUMBER);
    if (match) maxByYear.set(match[1], Math.max(maxByYear.get(match[1]) ?? 0, Number(match[2])));
  }
  const byIdentity = new Map(existing.map((opp) => [`${opp.client}|${opp.projectName}`.toLowerCase(), opp.opportunityNumber]));
  const fallbackYear = String((opportunities.find((opp) => opp.year)?.year ?? new Date().getFullYear())).slice(-2);

  return opportunities.map((opp) => {
    if (opp.opportunityNumber) return opp;
    const reused = byIdentity.get(`${opp.client}|${opp.projectName}`.toLowerCase());
    if (reused) return { ...opp, opportunityNumber: reused };
    const year = opp.year ? String(opp.year).slice(-2) : fallbackYear;
    const next = (maxByYear.get(year) ?? 0) + 1;
    maxByYear.set(year, next);
    return { ...opp, opportunityNumber: `Q-${year}-${String(next).padStart(3, "0")}` };
  });
}

// ── Whole-workbook parse ─────────────────────────────────────────────────────
export type ParsedMasterWorkbook = {
  opportunities: Opportunity[];
  jobs: ImportedJob[];
  changeOrders: ImportedChangeOrder[];
};

export function parseMasterWorkbookSheets(sheets: {
  bidTracker: Row[];
  currentJobs: Row[];
  changeOrders: Row[];
}): ParsedMasterWorkbook {
  return {
    opportunities: sheets.bidTracker.map(mapBidTrackerRow).filter((o): o is Opportunity => o !== null),
    jobs: sheets.currentJobs.map(mapCurrentJobsRow).filter((j): j is ImportedJob => j !== null),
    changeOrders: sheets.changeOrders.map(mapChangeOrderRow).filter((c): c is ImportedChangeOrder => c !== null)
  };
}
