import { describe, expect, it } from "vitest";
import {
  buildHandoffActivityMessage,
  buildHandoffEmail,
  buildMailtoUrl,
  findPmEmail,
  HANDOFF_LINK_EXPIRY_SECONDS,
  HANDOFF_SLOTS,
  pickHandoffFiles
} from "./job-handoff";
import type { Job, ProjectFile } from "@/types";

function makeFile(slot: string, name = `${slot}.pdf`): ProjectFile {
  return {
    id: `file-${slot}`,
    ownerType: "job",
    ownerId: "job-1",
    slot,
    name,
    uploadedAt: "2026-07-06",
    storagePath: `job/job-1/${slot}/${name}`,
    url: `https://signed.example/${slot}`
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    jobNumber: "G26-014",
    pm: "Geoff",
    client: "Sundt",
    projectName: "Tower Lobby",
    baseContract: 100000,
    bidRef: "Q-26-001",
    awardDate: "2026-07-01",
    ntpDate: "2026-07-01",
    backlogStatus: "Awarded / Waiting",
    forecastStart: "",
    forecastEnd: "",
    expectedFabStart: "",
    expectedCompletion: "",
    fabStatus: "Not Started",
    installStart: "2026-08-10",
    installEnd: "2026-08-14",
    installStatus: "Ready",
    invoiceStatus: "Not Billed",
    crewSize: 3,
    gc: "Sundt",
    workType: "Bid / ITB",
    notes: "",
    changeOrders: [],
    purchaseOrders: [],
    submittals: [],
    files: [],
    contacts: [],
    activity: [],
    ...overrides
  } as Job;
}

describe("pickHandoffFiles", () => {
  it("picks proposal, drawings, and specs in order and reports missing slots", () => {
    const { files, missingSlots } = pickHandoffFiles([
      makeFile("specs"),
      makeFile("contract"),
      makeFile("proposal")
    ]);
    expect(files.map((f) => f.slot)).toEqual(["proposal", "specs"]);
    expect(missingSlots).toEqual(["drawings"]);
  });

  it("reports all slots missing when the job has no files", () => {
    const { files, missingSlots } = pickHandoffFiles([]);
    expect(files).toEqual([]);
    expect(missingSlots).toEqual([...HANDOFF_SLOTS]);
  });
});

describe("findPmEmail", () => {
  it("prefers a contact with PM role and email", () => {
    const job = makeJob({
      contacts: [
        { id: "c1", contactId: "x1", role: "GC", contact: { id: "x1", name: "Other", email: "other@gc.com", tags: [], active: true } },
        { id: "c2", contactId: "x2", role: "PM", contact: { id: "x2", name: "Geoff PM", email: "geoff@fs.com", tags: [], active: true } }
      ]
    });
    expect(findPmEmail(job)).toBe("geoff@fs.com");
  });

  it("falls back to a contact whose name matches the job PM", () => {
    const job = makeJob({
      pm: "Pat",
      contacts: [
        { id: "c1", contactId: "x1", role: "Other", contact: { id: "x1", name: "Pat Riley", email: "pat@fs.com", tags: [], active: true } }
      ]
    });
    expect(findPmEmail(job)).toBe("pat@fs.com");
  });

  it("returns empty when no contact has an email", () => {
    expect(findPmEmail(makeJob())).toBe("");
  });
});

describe("buildHandoffEmail", () => {
  it("includes job facts, document links, and missing-slot warning", () => {
    const email = buildHandoffEmail({
      job: makeJob(),
      links: [
        { slot: "proposal", name: "proposal.pdf", url: "https://signed.example/proposal" },
        { slot: "drawings", name: "drawings.pdf", url: "https://signed.example/drawings" }
      ],
      missingSlots: ["specs"],
      currentContract: 112000
    });
    expect(email.subject).toBe("Job handoff: G26-014 — Tower Lobby");
    expect(email.body).toContain("Geoff, here is the handoff package for G26-014.");
    expect(email.body).toContain("Contract: $112,000");
    expect(email.body).toContain("Install: 2026-08-10 to 2026-08-14");
    expect(email.body).toContain("- Proposal: https://signed.example/proposal");
    expect(email.body).toContain("- Drawings / Planset: https://signed.example/drawings");
    expect(email.body).toContain("Not attached yet: Specifications.");
  });

  it("omits the missing-slot warning when everything is attached", () => {
    const email = buildHandoffEmail({
      job: makeJob(),
      links: HANDOFF_SLOTS.map((slot) => ({ slot, name: `${slot}.pdf`, url: `https://x/${slot}` })),
      missingSlots: [],
      currentContract: 100000
    });
    expect(email.body).not.toContain("Not attached yet");
  });
});

describe("buildMailtoUrl", () => {
  it("encodes subject and body for a mail client draft", () => {
    const url = buildMailtoUrl({ to: "pm@fs.com", subject: "Job handoff: G26-014 — Tower Lobby", body: "line one\nline two" });
    expect(url.startsWith("mailto:pm%40fs.com?subject=")).toBe(true);
    expect(url).toContain(encodeURIComponent("Job handoff: G26-014 — Tower Lobby"));
    expect(url).toContain(encodeURIComponent("line one\nline two"));
  });
});

describe("buildHandoffActivityMessage", () => {
  it("names the PM and the documents sent", () => {
    const message = buildHandoffActivityMessage(makeJob(), [
      { slot: "proposal", name: "p.pdf", url: "u" },
      { slot: "specs", name: "s.pdf", url: "u" }
    ]);
    expect(message).toBe("Handoff sent to Geoff: Proposal, Specifications.");
  });
});

describe("HANDOFF_LINK_EXPIRY_SECONDS", () => {
  it("is 30 days", () => {
    expect(HANDOFF_LINK_EXPIRY_SECONDS).toBe(2592000);
  });
});
