import type { Opportunity, OpportunityStatus, WinLoss } from "../types";
import { OPPORTUNITY_STATUSES } from "./status-constants";

type MasterRow = Record<string, unknown>;

const text = (value: unknown) => (value == null ? "" : String(value).trim());

const money = (value: unknown): number => {
  if (typeof value === "number") return value;
  const parsed = Number(text(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const boolish = (value: unknown) => ["yes", "y", "true", "received"].includes(text(value).toLowerCase());

// Vocabulary the physical Master V4 workbook actually uses, mapped into the
// app's opportunity statuses. Anything unrecognized lands on "New" so it
// surfaces for triage instead of vanishing.
const STATUS_ALIASES: Record<string, OpportunityStatus> = {
  sent: "Submitted",
  pending: "Submitted",
  "on hold": "Cold",
  "client lost": "Lost",
  "client backed out": "Lost",
  declined: "Archived",
  "no bid": "Archived"
};

const status = (value: unknown): OpportunityStatus => {
  const raw = text(value);
  const found = OPPORTUNITY_STATUSES.find((candidate) => candidate.toLowerCase() === raw.toLowerCase());
  return found ?? STATUS_ALIASES[raw.toLowerCase()] ?? "New";
};

// The workbook marks wins with a checkmark character in the Win? column.
const winLoss = (value: unknown): WinLoss => {
  const raw = text(value).toLowerCase();
  if (raw === "won" || raw === "yes" || raw === "y" || raw === "✔" || raw === "✓" || raw === "x") return "Won";
  if (raw === "lost" || raw === "no" || raw === "n") return "Lost";
  return "";
};

/**
 * Normalize workbook dates to ISO. Cells arrive either as Excel serial
 * numbers (days since 1899-12-30) or as US-format strings like 01/19/2026.
 */
export function normalizeWorkbookDate(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 20000 && value < 80000) {
    const ms = Math.round((value - 25569) * 86_400_000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const raw = text(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  return raw;
}

export function mapEstimatingMasterRow(row: MasterRow): Opportunity {
  const mappedStatus = status(row.Status);
  const mappedWinLoss = winLoss(row["Win?"]) || (mappedStatus === "Lost" ? "Lost" : "");

  return {
    id: cryptoSafeId(text(row["Job ID"]) || text(row["Project Name"])),
    jobId: text(row["Job ID"]),
    month: text(row.Month),
    client: text(row.Client),
    projectName: text(row["Project Name"]),
    bidDueDate: normalizeWorkbookDate(row["Bid Due Date"]),
    drawingStage: text(row["Drawing Stage"]),
    bidType: text(row["Bid Type"]),
    sentDate: normalizeWorkbookDate(row["Sent Date"]),
    submissionMethod: text(row["Sub. Method"]),
    status: mappedWinLoss || mappedStatus,
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
