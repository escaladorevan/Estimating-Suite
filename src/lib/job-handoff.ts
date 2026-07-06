import type { Job, ProjectFile } from "@/types";

/**
 * PM handoff: when a job is awarded, the PM gets an email with links to the
 * core bid documents. This module is the pure part — slot selection, email
 * composition, mailto encoding — so it stays unit-testable. Signing the URLs
 * and logging the activity event happen at the call site.
 */

export const HANDOFF_SLOTS = ["proposal", "drawings", "specs"] as const;

/** Signed links in the handoff email stay valid for 30 days. */
export const HANDOFF_LINK_EXPIRY_SECONDS = 60 * 60 * 24 * 30;

export type HandoffLink = {
  slot: string;
  name: string;
  url: string;
};

export type HandoffFilePick = {
  /** Job files sitting in handoff slots, in HANDOFF_SLOTS order. */
  files: ProjectFile[];
  /** Handoff slots with no file attached — surfaced so nothing goes out silently incomplete. */
  missingSlots: string[];
};

export function pickHandoffFiles(files: ProjectFile[]): HandoffFilePick {
  const picked: ProjectFile[] = [];
  const missingSlots: string[] = [];
  for (const slot of HANDOFF_SLOTS) {
    const file = files.find((candidate) => candidate.slot === slot);
    if (file) picked.push(file);
    else missingSlots.push(slot);
  }
  return { files: picked, missingSlots };
}

/**
 * Best-effort PM email: a job contact whose role or contact title is "PM"
 * and that has an email. Falls back to empty — the mail client draft opens
 * with a blank To: field and the sender fills it in.
 */
export function findPmEmail(job: Job): string {
  const contacts = job.contacts ?? [];
  const pmContact =
    contacts.find((pc) => (pc.role === "PM" || pc.contact?.title === "PM") && pc.contact?.email) ??
    contacts.find((pc) => pc.contact?.email && pc.contact?.name && job.pm && pc.contact.name.toLowerCase().includes(job.pm.toLowerCase()));
  return pmContact?.contact?.email ?? "";
}

const slotLabels: Record<string, string> = {
  proposal: "Proposal",
  drawings: "Drawings / Planset",
  specs: "Specifications"
};

export function handoffSlotLabel(slot: string): string {
  return slotLabels[slot] ?? slot;
}

export function buildHandoffEmail({
  job,
  links,
  missingSlots,
  currentContract
}: {
  job: Job;
  links: HandoffLink[];
  missingSlots: string[];
  currentContract: number;
}): { to: string; subject: string; body: string } {
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const subject = `Job handoff: ${job.jobNumber} — ${job.projectName}`;

  const lines: string[] = [
    `${job.pm ? `${job.pm}, here` : "Here"} is the handoff package for ${job.jobNumber}.`,
    "",
    `Project: ${job.projectName}`,
    `Client: ${job.client}${job.gc && job.gc !== job.client ? ` (GC: ${job.gc})` : ""}`,
    `Contract: ${money.format(currentContract)}`,
    `NTP: ${job.ntpDate || "TBD"}`,
    `Install: ${job.installStart || "TBD"}${job.installEnd ? ` to ${job.installEnd}` : ""}`,
    "",
    "Documents (links valid 30 days):"
  ];
  for (const link of links) {
    lines.push(`- ${handoffSlotLabel(link.slot)}: ${link.url}`);
  }
  if (missingSlots.length) {
    lines.push("", `Not attached yet: ${missingSlots.map(handoffSlotLabel).join(", ")}.`);
  }
  if (job.notes) {
    lines.push("", `Notes: ${job.notes}`);
  }

  return { to: findPmEmail(job), subject, body: lines.join("\n") };
}

export function buildMailtoUrl({ to, subject, body }: { to: string; subject: string; body: string }): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildHandoffActivityMessage(job: Job, links: HandoffLink[]): string {
  const sent = links.length ? links.map((link) => handoffSlotLabel(link.slot)).join(", ") : "no documents";
  return `Handoff sent to ${job.pm || "PM"}: ${sent}.`;
}
