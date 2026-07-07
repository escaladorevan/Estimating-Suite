// PM handoff email + award-to-job helpers. Pure; signing and persistence
// happen at the call sites.

import type { ChangeOrder, Job, Opportunity, ProjectFile } from "../types";
import { currentContractValue, FILE_SLOT_LABELS, type FileSlot } from "../types";

export const HANDOFF_SLOTS: FileSlot[] = ["proposal", "drawings", "specs", "contract"];
export const HANDOFF_LINK_EXPIRY_SECONDS = 60 * 60 * 24 * 30;

export function buildHandoffEmail({
  job,
  changeOrders,
  links,
  missingSlots
}: {
  job: Job;
  changeOrders: ChangeOrder[];
  links: { slot: FileSlot; url: string }[];
  missingSlots: FileSlot[];
}): { subject: string; body: string } {
  const fmt = (value: number) => "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const lines = [
    `${job.pm ? `${job.pm}, here` : "Here"} is the handoff package for ${job.jobNumber}.`,
    "",
    `Project: ${job.projectName}`,
    `Client: ${job.client}${job.gc && job.gc !== job.client ? ` (GC: ${job.gc})` : ""}`,
    `Contract: ${fmt(currentContractValue(job, changeOrders))}`,
    `Install: ${job.installStart || "TBD"}${job.installEnd ? ` to ${job.installEnd}` : ""} · crew ${job.crewSize}`,
    "",
    "Documents (links valid 30 days):",
    ...links.map((link) => `- ${FILE_SLOT_LABELS[link.slot]}: ${link.url}`)
  ];
  if (missingSlots.length) lines.push("", `Not attached yet: ${missingSlots.map((slot) => FILE_SLOT_LABELS[slot]).join(", ")}.`);
  if (job.notes) lines.push("", `Notes: ${job.notes}`);
  return { subject: `Job handoff: ${job.jobNumber} — ${job.projectName}`, body: lines.join("\n") };
}

export function buildMailtoUrl(email: { subject: string; body: string }, to = ""): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
}

const PM_INITIALS: Record<string, string> = { Geoff: "G", Pat: "P", Joe: "J" };

/** Dashboard job-number convention: PM initial + zero-padded next number. */
export function suggestJobNumber(pm: string, existing: Pick<Job, "jobNumber">[]): string {
  const initial = PM_INITIALS[pm] ?? (pm.slice(0, 1).toUpperCase() || "G");
  const max = Math.max(0, ...existing.map((job) => Number(job.jobNumber.match(/(\d+)$/)?.[1] ?? 0)));
  return `${initial}${String(max + 1).padStart(3, "0")}`;
}

export function buildJobFromAward({
  opportunity,
  pm,
  jobNumber,
  contractValue
}: {
  opportunity: Opportunity;
  pm: string;
  jobNumber: string;
  contractValue: number;
}): Job {
  return {
    id: "",
    jobNumber,
    pm,
    client: opportunity.client,
    projectName: opportunity.projectName,
    status: "ready",
    contractValue,
    bidRef: opportunity.opportunityNumber,
    opportunityId: opportunity.id || null,
    estimateId: null,
    installStart: "",
    installEnd: "",
    crewSize: 2,
    gc: "",
    fabStatus: "",
    invoiceStatus: "",
    notes: opportunity.notes
  };
}
