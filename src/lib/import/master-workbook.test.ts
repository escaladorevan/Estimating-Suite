import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  mapBidTrackerRow,
  mapChangeOrderRow,
  mapCurrentJobsRow,
  normalizeWorkbookDate,
  parseMasterWorkbookSheets
} from "./master-workbook";

describe("normalizeWorkbookDate", () => {
  it("converts Excel serials, US dates, and passes ISO through", () => {
    expect(normalizeWorkbookDate(46041)).toBe("2026-01-19");
    expect(normalizeWorkbookDate("01/19/2026")).toBe("2026-01-19");
    expect(normalizeWorkbookDate("2026-01-19")).toBe("2026-01-19");
    expect(normalizeWorkbookDate("")).toBe("");
  });
});

describe("mapBidTrackerRow (real workbook vocabulary)", () => {
  it("maps checkmark wins and Sent status", () => {
    const opp = mapBidTrackerRow({
      "Job ID": "Q-26-004",
      Client: "Brian Kasler",
      "Project Name": "Kitchen & Bath Cabinets",
      "Bid Due Date": 46041,
      "Sent Date": "01/19/2026",
      Status: "Sent",
      "Win?": "✔",
      "Est. Bid Value": 58551
    });
    expect(opp).toMatchObject({
      opportunityNumber: "Q-26-004",
      status: "Won",
      winLoss: "Won",
      bidDueDate: "2026-01-19",
      estValue: 58551,
      year: 2026
    });
  });

  it("aliases workbook statuses into the app vocabulary", () => {
    const statusFor = (status: string) =>
      mapBidTrackerRow({ "Job ID": "Q-1", "Project Name": "P", Status: status, "Win?": "" })!;
    expect(statusFor("Sent").status).toBe("Submitted");
    expect(statusFor("Pending").status).toBe("Submitted");
    expect(statusFor("On Hold").status).toBe("Cold");
    expect(statusFor("Client Lost")).toMatchObject({ status: "Lost", winLoss: "Lost" });
    expect(statusFor("Declined").status).toBe("Archived");
    expect(statusFor("No Bid").status).toBe("Archived");
    expect(statusFor("???").status).toBe("New");
  });

  it("drops rows with no id and no project", () => {
    expect(mapBidTrackerRow({ "Job ID": "", "Project Name": "" })).toBeNull();
  });
});

describe("mapCurrentJobsRow", () => {
  it("composes the dashboard job number from PM letter + bare number", () => {
    const imported = mapCurrentJobsRow({
      "Job #": "001",
      PM: "G",
      Client: "—",
      Project: "MT. TABOR KITCHEN",
      "Contract ($)": 55575,
      "Appvd COs ($)": 2400,
      "Bid Ref": "Q-26-003",
      Notes: ""
    })!;
    expect(imported.job).toMatchObject({
      jobNumber: "G001",
      pm: "Geoff",
      client: "",
      projectName: "MT. TABOR KITCHEN",
      contractValue: 55575,
      bidRef: "Q-26-003",
      status: "active"
    });
    expect(imported.approvedCoAmount).toBe(2400);
  });

  it("keeps non-numeric job numbers as-is and drops empty rows", () => {
    expect(mapCurrentJobsRow({ "Job #": "G047", PM: "G", Project: "X" })!.job.jobNumber).toBe("G047");
    expect(mapCurrentJobsRow({ "Job #": "", Project: "" })).toBeNull();
  });
});

describe("mapChangeOrderRow", () => {
  it("maps a real CO with Pending → submitted and serial date", () => {
    const co = mapChangeOrderRow({
      "CO #": "CO-26-062-01",
      "Job ID": "Q-26-062",
      "CO Description": "ASI-01 - Add Full Height Cab",
      "Date Submitted": 46132,
      "Amount ($)": 2178,
      Status: "Pending",
      "Approved Date": "",
      Notes: ""
    })!;
    expect(co).toMatchObject({
      jobBidRef: "Q-26-062",
      amount: 2178,
      status: "submitted",
      submittedDate: "2026-04-20"
    });
  });

  it("drops the documentation row (no Job ID)", () => {
    expect(mapChangeOrderRow({ "CO #": "CO # format: ...", "Job ID": "", "CO Description": "" })).toBeNull();
  });
});

const WORKBOOK = "project/uploads/Estimating_Master_v4.xlsx";

describe.skipIf(!existsSync(WORKBOOK))("against the real Master V4 workbook", () => {
  const workbook = XLSX.read(readFileSync(WORKBOOK));
  const rows = (name: string) =>
    XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[workbook.SheetNames.find((n) => n.includes(name))!],
      { defval: "" }
    );
  const parsed = parseMasterWorkbookSheets({
    bidTracker: rows("2026 Bid Tracker"),
    currentJobs: rows("Current Jobs"),
    changeOrders: rows("Change Order")
  });

  it("maps the full pipeline with correct win/loss totals", () => {
    expect(parsed.opportunities.length).toBe(135);
    expect(parsed.opportunities.filter((o) => o.winLoss === "Won").length).toBe(25);
    expect(parsed.opportunities.filter((o) => o.winLoss === "Lost").length).toBe(4);
    const total = parsed.opportunities.reduce((sum, o) => sum + o.estValue, 0);
    expect(Math.round(total)).toBe(5616007);
  });

  it("maps current jobs with composed numbers", () => {
    expect(parsed.jobs.length).toBeGreaterThan(30);
    expect(parsed.jobs.every(({ job }) => job.jobNumber.length > 0)).toBe(true);
    expect(parsed.jobs[0].job.jobNumber).toBe("G001");
  });

  it("maps the two real change orders and drops the format note", () => {
    expect(parsed.changeOrders.length).toBe(2);
    expect(parsed.changeOrders.map((co) => co.jobBidRef)).toEqual(["Q-26-003", "Q-26-062"]);
  });
});
