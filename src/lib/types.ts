// Domain types — mirror supabase/v2-schema.sql, which mirrors the three
// source tools (docs/rebuild-plan.md).

export type Role = "admin" | "estimator" | "pm";

export type Profile = {
  id: string;
  fullName: string;
  role: Role;
  active: boolean;
};

// ── Bid Tracker (Estimating Master "2026 Bid Tracker" sheet) ─────────────────
export type WinLoss = "" | "Won" | "Lost";

export type Opportunity = {
  id: string;
  opportunityNumber: string; // "Q-26-119"
  month: string;
  year: number | null;
  client: string;
  projectName: string;
  bidDueDate: string; // ISO date or ""
  drawingStage: string;
  bidType: string;
  sentDate: string;
  submissionMethod: string;
  status: string;
  winLoss: WinLoss;
  jobType: string;
  estValue: number;
  linkDrawings: string;
  linkSpecs: string;
  linkSchedule: string;
  notes: string;
  bidFeedback: string;
  ntpReceived: boolean;
  finalCost: number | null;
};

// ── Jobs (FS Job Dashboard model) ────────────────────────────────────────────
export const JOB_STATUSES = ["ready", "active", "completed", "installed", "void"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  ready: "Ready to Start",
  active: "In Progress",
  completed: "Completed",
  installed: "Installed",
  void: "Void"
};

export type Job = {
  id: string;
  jobNumber: string; // "G047"
  pm: string;
  client: string;
  projectName: string;
  status: JobStatus;
  contractValue: number; // original; current = + approved COs
  bidRef: string;
  opportunityId: string | null;
  estimateId: string | null;
  installStart: string;
  installEnd: string;
  crewSize: number; // 1–6
  gc: string;
  fabStatus: string;
  invoiceStatus: string;
  notes: string;
};

export type ChangeOrderStatus = "submitted" | "approved";

export type ChangeOrder = {
  id: string;
  jobId: string;
  description: string;
  amount: number; // may be negative
  status: ChangeOrderStatus;
  submittedDate: string;
  approvedDate: string;
  createdBy: string;
  notes: string;
};

/** current contract = original + approved COs (dashboard rule) */
export function currentContractValue(job: Pick<Job, "contractValue">, changeOrders: ChangeOrder[]): number {
  return job.contractValue + changeOrders
    .filter((co) => co.status === "approved")
    .reduce((sum, co) => sum + co.amount, 0);
}

// ── Files (six fixed slots per owner) ────────────────────────────────────────
export const FILE_SLOTS = ["drawings", "specs", "schedule", "contract", "proposal", "other"] as const;
export type FileSlot = (typeof FILE_SLOTS)[number];

export const FILE_SLOT_LABELS: Record<FileSlot, string> = {
  drawings: "Drawings",
  specs: "Specifications",
  schedule: "Schedule",
  contract: "PO / Contract",
  proposal: "Proposal",
  other: "Other"
};

export type FileOwnerType = "opportunity" | "job";

export type ProjectFile = {
  id: string;
  ownerType: FileOwnerType;
  ownerId: string;
  slot: FileSlot;
  name: string;
  storageBucket: string;
  storagePath: string;
  sizeBytes: number | null;
  mimeType: string | null;
  uploadedBy: string;
  uploadedAt: string;
  url?: string; // signed, attached on load
};

export type ActivityEvent = {
  id: string;
  jobId: string;
  author: string;
  note: string;
  createdAt: string;
};

// ── Estimator ────────────────────────────────────────────────────────────────
// The estimate document (FS Estimator state) is defined fully in Phase 3
// (src/lib/estimator/). At the persistence layer it is an opaque JSON doc.
export type EstimateRecord = {
  id: string;
  opportunityId: string | null;
  name: string;
  client: string;
  docType: string;
  baseBid: number;
  document: unknown;
  updatedAt: string;
};

export type LibraryItem = {
  id: string;
  category: string;
  description: string;
  unitCost: number;
  uom: string;
  active: boolean;
};

export type Contact = {
  id: string;
  company: string;
  attention: string;
  address: string;
  phone: string;
  email: string;
};
