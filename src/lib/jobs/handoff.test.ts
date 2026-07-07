import { describe, expect, it } from "vitest";
import { buildHandoffEmail, buildJobFromAward, buildMailtoUrl, suggestJobNumber } from "./handoff";
import type { ChangeOrder, Job, Opportunity } from "../types";

const job = {
  id: "j1", jobNumber: "G048", pm: "Geoff", client: "SUNDT", projectName: "Tower Lobby",
  status: "ready", contractValue: 100000, bidRef: "Q-26-119", opportunityId: null, estimateId: null,
  installStart: "2026-08-10", installEnd: "2026-08-14", crewSize: 3, gc: "Sundt Corp",
  fabStatus: "", invoiceStatus: "", notes: "Union site."
} as Job;

describe("buildHandoffEmail", () => {
  it("includes job facts, CO-adjusted contract, links, and missing slots", () => {
    const cos = [{ status: "approved", amount: 2500 } as ChangeOrder];
    const email = buildHandoffEmail({
      job,
      changeOrders: cos,
      links: [{ slot: "proposal", url: "https://x/p" }, { slot: "drawings", url: "https://x/d" }],
      missingSlots: ["specs", "contract"]
    });
    expect(email.subject).toBe("Job handoff: G048 — Tower Lobby");
    expect(email.body).toContain("Contract: $102,500");
    expect(email.body).toContain("(GC: Sundt Corp)");
    expect(email.body).toContain("- Proposal: https://x/p");
    expect(email.body).toContain("Not attached yet: Specifications, PO / Contract.");
    expect(email.body).toContain("Notes: Union site.");
    expect(buildMailtoUrl(email)).toContain("mailto:?subject=Job%20handoff");
  });
});

describe("award helpers", () => {
  it("suggests PM-initialed sequential job numbers", () => {
    const existing = [{ jobNumber: "G001" }, { jobNumber: "P047" }, { jobNumber: "J012" }];
    expect(suggestJobNumber("Geoff", existing)).toBe("G048");
    expect(suggestJobNumber("Pat", [])).toBe("P001");
  });

  it("builds a job from an awarded opportunity", () => {
    const opportunity = {
      id: "9f8b7c6d-1234-4abc-9def-0123456789ab", opportunityNumber: "Q-26-119",
      client: "SUNDT", projectName: "Tower Lobby", notes: "note", estValue: 90000
    } as Opportunity;
    const built = buildJobFromAward({ opportunity, pm: "Geoff", jobNumber: "G048", contractValue: 95000 });
    expect(built).toMatchObject({
      jobNumber: "G048", pm: "Geoff", client: "SUNDT", projectName: "Tower Lobby",
      bidRef: "Q-26-119", opportunityId: opportunity.id, contractValue: 95000, status: "ready"
    });
  });
});
