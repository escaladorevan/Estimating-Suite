import type { Opportunity, OpportunityStatus, WinLoss } from "../types";

type MasterRow = Record<string, unknown>;

const text = (value: unknown) => (value == null ? "" : String(value).trim());

const money = (value: unknown): number => {
  if (typeof value === "number") return value;
  const parsed = Number(text(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const boolish = (value: unknown) => ["yes", "y", "true", "received"].includes(text(value).toLowerCase());

const status = (value: unknown): OpportunityStatus => {
  const raw = text(value);
  const allowed: OpportunityStatus[] = [
    "Lead / ITB",
    "Pricing",
    "Review / Send",
    "New",
    "Estimating",
    "Submitted",
    "Follow Up",
    "Cold",
    "Won",
    "Lost",
    "Archived"
  ];
  const found = allowed.find((candidate) => candidate.toLowerCase() === raw.toLowerCase());
  return found ?? "New";
};

const winLoss = (value: unknown): WinLoss => {
  const raw = text(value).toLowerCase();
  if (raw === "won" || raw === "yes" || raw === "y") return "Won";
  if (raw === "lost" || raw === "no" || raw === "n") return "Lost";
  return "";
};

export function mapEstimatingMasterRow(row: MasterRow): Opportunity {
  const mappedWinLoss = winLoss(row["Win?"]);

  return {
    id: cryptoSafeId(text(row["Job ID"]) || text(row["Project Name"])),
    jobId: text(row["Job ID"]),
    month: text(row.Month),
    client: text(row.Client),
    projectName: text(row["Project Name"]),
    bidDueDate: text(row["Bid Due Date"]),
    drawingStage: text(row["Drawing Stage"]),
    bidType: text(row["Bid Type"]),
    sentDate: text(row["Sent Date"]),
    submissionMethod: text(row["Sub. Method"]),
    status: mappedWinLoss || status(row.Status),
    winLoss: mappedWinLoss,
    jobType: text(row["Job Type"]),
    estimatedValue: money(row["Est. Bid Value"]),
    links: {
      drawings: text(row["Link: Drawings"]),
      specs: text(row["Link: Specs"]),
      schedule: text(row["Link: Schedule"])
    },
    notes: text(row.Notes),
    bidFeedback: text(row["Bid Feedback"]),
    ntpReceived: boolish(row["NTP Received?"]),
    initialContractValue: mappedWinLoss === "Won" ? money(row["Est. Bid Value"]) : null,
    finalCost: row["Final Cost"] ? money(row["Final Cost"]) : null
  };
}

export function shouldFlagStaleFollowUp(input: {
  status: string;
  sentDate: string;
  winLoss: string;
  today: string;
  staleAfterDays: number;
}): boolean {
  if (input.winLoss || !input.sentDate) return false;
  if (!["Submitted", "Follow Up", "Cold"].includes(input.status)) return false;

  const sentAt = new Date(input.sentDate);
  const today = new Date(input.today);
  if (Number.isNaN(sentAt.getTime()) || Number.isNaN(today.getTime())) return false;

  const days = (today.getTime() - sentAt.getTime()) / 86_400_000;
  return days >= input.staleAfterDays;
}

function cryptoSafeId(seed: string): string {
  const base = seed || Math.random().toString(36);
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}
