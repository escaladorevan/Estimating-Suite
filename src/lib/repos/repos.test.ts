import { describe, expect, it } from "vitest";
import { mapOpportunityFromRow, mapOpportunityToRow, isUuid, type OpportunityRow } from "./opportunities";
import { mapChangeOrderFromRow, mapJobFromRow, mapJobToRow, type ChangeOrderRow, type JobRow } from "./jobs";
import { mapFileFromRow, type FileRow } from "./files";
import { currentContractValue, type ChangeOrder, type Job } from "../types";

const oppRow: OpportunityRow = {
  id: "9f8b7c6d-1234-4abc-9def-0123456789ab",
  opportunity_number: "Q-26-119",
  month: "April",
  year: 2026,
  client: "NOR Construction",
  project_name: "Archies Playground",
  bid_due_date: "2026-04-14",
  drawing_stage: "IFC",
  bid_type: "Competitive",
  sent_date: null,
  submission_method: "Email",
  status: "Submitted",
  win_loss: "Won",
  job_type: "Commercial",
  est_value: "67984.00",
  link_drawings: "",
  link_specs: "",
  link_schedule: "",
  notes: "",
  bid_feedback: "",
  ntp_received: true,
  final_cost: null
};

describe("opportunity mapping", () => {
  it("round-trips a bid tracker row", () => {
    const opp = mapOpportunityFromRow(oppRow);
    expect(opp).toMatchObject({
      opportunityNumber: "Q-26-119",
      client: "NOR Construction",
      estValue: 67984,
      winLoss: "Won",
      sentDate: "",
      finalCost: null
    });
    const back = mapOpportunityToRow(opp);
    expect(back).toMatchObject({
      id: oppRow.id,
      opportunity_number: "Q-26-119",
      est_value: 67984,
      sent_date: null,
      win_loss: "Won"
    });
  });

  it("omits non-UUID local ids so the database assigns one", () => {
    const opp = mapOpportunityFromRow(oppRow);
    const back = mapOpportunityToRow({ ...opp, id: "local-123" });
    expect("id" in back).toBe(false);
  });

  it("clamps unknown win_loss values to empty", () => {
    expect(mapOpportunityFromRow({ ...oppRow, win_loss: "Maybe" }).winLoss).toBe("");
  });
});

const jobRow: JobRow = {
  id: "9f8b7c6d-1234-4abc-9def-0123456789ab",
  job_number: "G047",
  pm: "Geoff",
  client: "SUNDT",
  project_name: "Tower Lobby",
  status: "active",
  contract_value: "55575",
  bid_ref: "Q-26-119",
  opportunity_id: null,
  estimate_id: null,
  install_start: "2026-08-10",
  install_end: null,
  crew_size: 3,
  gc: "Sundt",
  fab_status: "In Fab",
  invoice_status: "Not Billed",
  notes: ""
};

describe("job mapping", () => {
  it("maps a job row with the dashboard status model", () => {
    const job = mapJobFromRow(jobRow);
    expect(job).toMatchObject({ jobNumber: "G047", status: "active", contractValue: 55575, installEnd: "" });
  });

  it("clamps unknown statuses to ready", () => {
    expect(mapJobFromRow({ ...jobRow, status: "wat" }).status).toBe("ready");
  });

  it("serializes empty dates as null", () => {
    const back = mapJobToRow(mapJobFromRow(jobRow));
    expect(back.install_end).toBeNull();
    expect(back.install_start).toBe("2026-08-10");
  });
});

describe("change order math (dashboard rule)", () => {
  const coRow: ChangeOrderRow = {
    id: "1",
    job_id: "j",
    description: "Added blocking per RFI-4",
    amount: "1500",
    status: "approved",
    submitted_date: "2026-07-01",
    approved_date: "2026-07-03",
    created_by: "Evan",
    notes: ""
  };

  it("maps CO rows", () => {
    expect(mapChangeOrderFromRow(coRow)).toMatchObject({ amount: 1500, status: "approved" });
  });

  it("current contract = original + approved COs only; negatives count", () => {
    const job = { contractValue: 100000 } as Job;
    const cos = [
      { status: "approved", amount: 1500 },
      { status: "submitted", amount: 99999 },
      { status: "approved", amount: -500 }
    ] as ChangeOrder[];
    expect(currentContractValue(job, cos)).toBe(101000);
  });
});

describe("file mapping", () => {
  it("maps a slot file row", () => {
    const row: FileRow = {
      id: "1",
      owner_type: "job",
      owner_id: "j",
      slot: "proposal",
      name: "NOR_Archies_Proposal.pdf",
      storage_bucket: "project-files",
      storage_path: "job/j/proposal/x.pdf",
      size_bytes: 12345,
      mime_type: "application/pdf",
      uploaded_by: "Evan",
      uploaded_at: "2026-07-06T00:00:00Z"
    };
    expect(mapFileFromRow(row)).toMatchObject({ slot: "proposal", ownerType: "job", sizeBytes: 12345 });
  });
});

describe("isUuid", () => {
  it("accepts UUIDs and rejects local ids", () => {
    expect(isUuid("9f8b7c6d-1234-4abc-9def-0123456789ab")).toBe(true);
    expect(isUuid("opp-123")).toBe(false);
  });
});
