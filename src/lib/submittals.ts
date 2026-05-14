import type { SubmittalPackage, SubmittalStatus } from "@/types";
import { SUBMITTAL_READY_STATUSES, SUBMITTAL_WAITING_STATUSES } from "./status-constants";

export type ReleaseState = "Ready" | "Waiting" | "Blocked" | "No Packages";
export type SubmittalSeverity = "good" | "warn" | "bad" | "neutral";
export type SubmittalAction = "submit" | "approve" | "approveAsNoted" | "revise" | "resubmit" | "notRequired";
export type CreateSubmittalInput = Omit<SubmittalPackage, "status" | "revision"> & {
  status?: SubmittalStatus;
  revision?: number;
};
export type UpdateSubmittalInput = Partial<
  Pick<
    SubmittalPackage,
    "name" | "type" | "status" | "revision" | "dueDate" | "submittedDate" | "returnedDate" | "owner" | "releaseBlocker" | "notes"
  >
>;
export type SubmittalChecklistState = {
  submitted?: boolean;
  approved?: boolean;
  revise?: boolean;
  resubmittedDate?: string;
};

export type SubmittalSummary = {
  label: string;
  releaseState: ReleaseState;
  severity: SubmittalSeverity;
  blockingCount: number;
  overdueCount: number;
  waitingCount: number;
};

const readyStatuses: readonly SubmittalStatus[] = SUBMITTAL_READY_STATUSES;
const waitingStatuses: readonly SubmittalStatus[] = SUBMITTAL_WAITING_STATUSES;

export function createSubmittalPackage(input: CreateSubmittalInput): SubmittalPackage {
  return {
    ...input,
    name: input.name.trim(),
    status: input.status ?? "Not Started",
    revision: input.revision ?? 0
  };
}

export function updateSubmittalPackage(item: SubmittalPackage, updates: UpdateSubmittalInput): SubmittalPackage {
  return {
    ...item,
    ...updates,
    name: updates.name == null ? item.name : updates.name.trim()
  };
}

export function setSubmittalChecklistState(
  item: SubmittalPackage,
  updates: SubmittalChecklistState,
  date: string
): SubmittalPackage {
  if (updates.approved === true) {
    return { ...item, status: "Approved", returnedDate: date };
  }

  if (updates.approved === false && item.status === "Approved") {
    return { ...item, status: item.submittedDate ? "Submitted" : "In Progress", returnedDate: undefined };
  }

  if (updates.revise === true) {
    return { ...item, status: "Rejected / Revise and Resubmit", returnedDate: date };
  }

  if (updates.revise === false && item.status === "Rejected / Revise and Resubmit") {
    return { ...item, status: item.submittedDate ? "Submitted" : "In Progress", returnedDate: undefined };
  }

  if (updates.resubmittedDate) {
    return {
      ...item,
      status: "Resubmitted",
      revision: item.status === "Rejected / Revise and Resubmit" ? item.revision + 1 : item.revision,
      submittedDate: updates.resubmittedDate
    };
  }

  if (updates.submitted === true) {
    return { ...item, status: "Submitted", submittedDate: date };
  }

  if (updates.submitted === false) {
    return { ...item, status: "In Progress", submittedDate: undefined, returnedDate: undefined };
  }

  return item;
}

function isPast(date: string | undefined, today: string) {
  return Boolean(date && date < today);
}

function formatShortDate(date: string) {
  const [, month, day] = date.split("-");
  return `${month}/${day}`;
}

export function summarizeSubmittals(packages: SubmittalPackage[] = [], today: string): SubmittalSummary {
  if (!packages.length) {
    return {
      label: "No packages",
      releaseState: "No Packages",
      severity: "neutral",
      blockingCount: 0,
      overdueCount: 0,
      waitingCount: 0
    };
  }

  const releasePackages = packages.filter((item) => item.releaseBlocker);
  const blockers = releasePackages.filter((item) => !readyStatuses.includes(item.status));
  const rejected = blockers.find((item) => item.status === "Rejected / Revise and Resubmit");
  const overdue = blockers.filter((item) => !waitingStatuses.includes(item.status) && isPast(item.dueDate, today));
  const waiting = blockers.filter((item) => waitingStatuses.includes(item.status));

  if (rejected) {
    return {
      label: `R&R Rev ${rejected.revision}`,
      releaseState: "Blocked",
      severity: "bad",
      blockingCount: blockers.length,
      overdueCount: overdue.length,
      waitingCount: waiting.length
    };
  }

  if (overdue.length) {
    return {
      label: "Overdue",
      releaseState: "Blocked",
      severity: "bad",
      blockingCount: blockers.length,
      overdueCount: overdue.length,
      waitingCount: waiting.length
    };
  }

  if (waiting.length) {
    return {
      label: waiting[0].status,
      releaseState: "Waiting",
      severity: "warn",
      blockingCount: blockers.length,
      overdueCount: overdue.length,
      waitingCount: waiting.length
    };
  }

  if (!blockers.length) {
    return {
      label: "Ready",
      releaseState: "Ready",
      severity: "good",
      blockingCount: 0,
      overdueCount: 0,
      waitingCount: 0
    };
  }

  const nextDue = blockers
    .filter((item) => item.dueDate)
    .sort((left, right) => String(left.dueDate).localeCompare(String(right.dueDate)))[0];

  return {
    label: nextDue?.dueDate ? `Due ${formatShortDate(nextDue.dueDate)}` : "In progress",
    releaseState: "Blocked",
    severity: "warn",
    blockingCount: blockers.length,
    overdueCount: overdue.length,
    waitingCount: waiting.length
  };
}

export function applySubmittalAction(
  item: SubmittalPackage,
  action: SubmittalAction,
  date: string
): SubmittalPackage {
  if (action === "submit") {
    return { ...item, status: "Submitted", submittedDate: date };
  }

  if (action === "approve") {
    return { ...item, status: "Approved", returnedDate: date };
  }

  if (action === "approveAsNoted") {
    return { ...item, status: "Approved as Noted", returnedDate: date };
  }

  if (action === "revise") {
    return { ...item, status: "Rejected / Revise and Resubmit", returnedDate: date };
  }

  if (action === "resubmit") {
    return { ...item, status: "Resubmitted", revision: item.revision + 1, submittedDate: date };
  }

  return { ...item, status: "Void / Not Required", returnedDate: date, releaseBlocker: false };
}
