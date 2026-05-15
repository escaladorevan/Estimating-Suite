import type { PMNote, PMNotePriority } from "@/types";
import { BACKLOG_COMPLETE_STATUSES, PURCHASE_ORDER_INACTIVE_STATUSES, PURCHASE_ORDER_STATUSES, SUBMITTAL_READY_STATUSES } from "./status-constants";

type ActionStatus = "Open" | "Waiting" | "Done";
type ActionKind = "manual" | "submittal" | "purchase_order" | "change_order" | "file";
type ActionSeverity = "pinned" | "bad" | "warn" | "neutral";

type JobLike = {
  id: string;
  jobNumber: string;
  projectName: string;
  backlogStatus?: string;
  installStatus?: string;
  installStart?: string;
  changeOrders?: Array<{ amount?: number; status: string }>;
  purchaseOrders?: Array<{
    poNumber: string;
    scope?: string;
    status: string;
    committedAmount?: number;
    promisedDate?: string;
  }>;
  submittals?: Array<{
    name: string;
    status: string;
    dueDate?: string;
    releaseBlocker?: boolean;
  }>;
  files?: Array<{ slot: string }>;
};

export type PMActionItem = {
  id: string;
  kind: ActionKind;
  title: string;
  detail: string;
  status: ActionStatus;
  severity: ActionSeverity;
  jobId?: string;
  jobNumber?: string;
  projectName?: string;
  dueDate?: string;
  priority?: PMNotePriority;
  sourceNote?: PMNote;
};

export function parseJobReferenceFromNote(text: string): string | undefined {
  const match = text.match(/\b([A-Za-z])\s*(?:job\s*#?\s*)?(\d{2})\s*[- ]?\s*(\d{3})\b/i);
  if (!match) return undefined;
  return `${match[1].toUpperCase()}${match[2]}-${match[3]}`;
}

export function buildPmActionItems({
  jobs,
  notes,
  today
}: {
  jobs: JobLike[];
  notes: PMNote[];
  today: string;
}): PMActionItem[] {
  const openNotes = notes
    .filter((note) => note.status !== "Done")
    .map<PMActionItem>((note) => {
      const linkedJob = jobs.find((job) => job.id === note.jobId);
      return {
        id: note.id,
        kind: "manual",
        title: note.text,
        detail: linkedJob ? `${linkedJob.jobNumber} - ${linkedJob.projectName}` : "Manual PM note",
        status: note.status,
        severity: note.priority === "Pinned" ? "pinned" : note.dueDate && isPast(note.dueDate, today) ? "bad" : "neutral",
        jobId: linkedJob?.id ?? note.jobId,
        jobNumber: linkedJob?.jobNumber,
        projectName: linkedJob?.projectName,
        dueDate: note.dueDate,
        priority: note.priority,
        sourceNote: note
      };
    });

  const generated = jobs.flatMap((job) => [
    ...buildSubmittalActions(job, today),
    ...buildPurchaseOrderActions(job, today),
    ...buildChangeOrderActions(job),
    ...buildFileActions(job)
  ]);

  return [...openNotes, ...generated].sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));
}

function buildSubmittalActions(job: JobLike, today: string): PMActionItem[] {
  return (job.submittals ?? [])
    .filter((item) => Boolean(item.releaseBlocker) && !SUBMITTAL_READY_STATUSES.includes(item.status as never))
    .filter((item) => item.dueDate && isPast(item.dueDate, today))
    .map((item) => ({
      id: `submittal-${job.id}-${item.name}`,
      kind: "submittal",
      title: `${item.name} is overdue`,
      detail: `${job.jobNumber} - ${job.projectName}`,
      status: "Open",
      severity: "bad",
      jobId: job.id,
      jobNumber: job.jobNumber,
      projectName: job.projectName,
      dueDate: item.dueDate
    }));
}

function buildPurchaseOrderActions(job: JobLike, today: string): PMActionItem[] {
  return (job.purchaseOrders ?? []).flatMap((po) => {
    if (PURCHASE_ORDER_STATUSES.filter((status) => status !== "Draft").includes(po.status as never)) {
      return promisedDateAction(job, po, today);
    }

    return [
      {
        id: `po-issue-${job.id}-${po.poNumber}`,
        kind: "purchase_order",
        title: `${po.poNumber} needs to be issued`,
        detail: `${job.jobNumber} - ${po.scope ?? "Vendor PO"} - ${job.projectName}`,
        status: "Open" as const,
        severity: "warn" as const,
        jobId: job.id,
        jobNumber: job.jobNumber,
        projectName: job.projectName
      },
      ...promisedDateAction(job, po, today)
    ];
  });
}

function promisedDateAction(
  job: JobLike,
  po: NonNullable<JobLike["purchaseOrders"]>[number],
  today: string
): PMActionItem[] {
  if (!po.promisedDate || !isPast(po.promisedDate, today) || PURCHASE_ORDER_INACTIVE_STATUSES.includes(po.status as never)) return [];

  return [
    {
      id: `po-late-${job.id}-${po.poNumber}`,
      kind: "purchase_order",
      title: `${po.poNumber} promised date has slipped`,
      detail: `${job.jobNumber} - ${po.scope ?? "Vendor PO"} promised ${formatShortDate(po.promisedDate)}`,
      status: "Open",
      severity: "warn",
      jobId: job.id,
      jobNumber: job.jobNumber,
      projectName: job.projectName,
      dueDate: po.promisedDate
    }
  ];
}

function buildChangeOrderActions(job: JobLike): PMActionItem[] {
  const submitted = (job.changeOrders ?? []).filter((co) => co.status === "submitted");
  if (!submitted.length) return [];

  const value = submitted.reduce((sum, co) => sum + (co.amount ?? 0), 0);
  return [
    {
      id: `co-${job.id}`,
      kind: "change_order",
      title: "Submitted COs need follow-up",
      detail: `${job.jobNumber} - ${currency(value)} waiting on GC`,
      status: "Open",
      severity: "warn",
      jobId: job.id,
      jobNumber: job.jobNumber,
      projectName: job.projectName
    }
  ];
}

function buildFileActions(job: JobLike): PMActionItem[] {
  const hasContract = (job.files ?? []).some((file) => file.slot === "contract");
  if (hasContract || BACKLOG_COMPLETE_STATUSES.includes((job.backlogStatus ?? "") as never)) return [];

  return [
    {
      id: `file-contract-${job.id}`,
      kind: "file",
      title: "Contract file missing",
      detail: `${job.jobNumber} - ${job.projectName}`,
      status: "Open",
      severity: "neutral",
      jobId: job.id,
      jobNumber: job.jobNumber,
      projectName: job.projectName
    }
  ];
}

function isPast(date: string, today: string): boolean {
  return date < today;
}

function severityWeight(severity: ActionSeverity): number {
  return { pinned: 4, bad: 3, warn: 2, neutral: 1 }[severity];
}

function formatShortDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${month}/${day}/${year.slice(2)}`;
}

function currency(value: number): string {
  return new Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 0, style: "currency" }).format(value);
}
