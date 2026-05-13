import { describe, expect, it } from "vitest";
import { createChangeOrderEstimateFromJob, nextChangeOrderNumber, validateChangeOrderSubmission } from "./change-order-workflow";
import { calculateEstimateTotals } from "./estimate-math";
import {
  currentContractValue,
  jobCostSummary,
  summarizeBacklog,
  summarizeChangeOrders,
  summarizePurchaseOrders,
  summarizeServiceWork
} from "./job-financials";
import { jobDetailTabs } from "./job-detail-tabs";
import { mapEstimatingMasterRow, shouldFlagStaleFollowUp } from "./opportunity-import";
import { filterOpportunitiesForView, suggestJobNumber } from "./opportunity-workflow";
import { buildPmActionItems, parseJobReferenceFromNote } from "./pm-actions";
import { addMonthsToCalendarMonth, buildCapacityWeeks, buildInstallCalendarMonth } from "./schedule-capacity";
import { suggestServiceJobNumber } from "./service-workflow";
import {
  applySubmittalAction,
  createSubmittalPackage,
  setSubmittalChecklistState,
  summarizeSubmittals,
  updateSubmittalPackage
} from "./submittals";
import { estimateItemsToClipboardText, parseClipboardLineItems } from "./workbook-clipboard";
import { cloneArea, cloneItems, cloneSection } from "./workbook-copy";

describe("estimate math", () => {
  it("calculates area, material, burden, and bid totals from FS Estimator V2 structure", () => {
    const totals = calculateEstimateTotals({
      ohPct: 10,
      delPct: 3,
      insPct: 7,
      subItems: [{ cost: 1200, markupPct: 15 }],
      areas: [
        {
          qty: 2,
          sections: [
            {
              items: [
                { qty: 12, unitCost: 45 },
                { qty: 2, unitCost: 150, ignored: true }
              ]
            }
          ]
        },
        {
          qty: 1,
          sections: [{ items: [{ qty: 5, unitCost: 80 }] }]
        }
      ]
    });

    expect(totals.material).toBe(1480);
    expect(totals.overhead).toBe(148);
    expect(totals.delivery).toBe(48.84);
    expect(totals.install).toBe(113.96);
    expect(totals.subcontractorSell).toBe(1380);
    expect(totals.bidTotal).toBe(3170.8);
  });

  it("excludes ignored areas and sections from estimate totals", () => {
    const totals = calculateEstimateTotals({
      ohPct: 0,
      delPct: 0,
      insPct: 0,
      areas: [
        {
          qty: 2,
          sections: [{ items: [{ qty: 10, unitCost: 5 }] }]
        },
        {
          qty: 1,
          ignored: true,
          sections: [{ items: [{ qty: 100, unitCost: 100 }] }]
        },
        {
          qty: 1,
          sections: [
            { ignored: true, items: [{ qty: 100, unitCost: 100 }] },
            { items: [{ qty: 3, unitCost: 20 }] }
          ]
        }
      ]
    });

    expect(totals.material).toBe(160);
    expect(totals.bidTotal).toBe(160);
  });
});

describe("job financials", () => {
  it("rolls only approved change orders into current contract value", () => {
    const changeOrders = [
      { amount: 1000, status: "approved" as const },
      { amount: 500, status: "submitted" as const },
      { amount: -250, status: "approved" as const },
      { amount: 750, status: "rejected" as const }
    ];

    expect(currentContractValue(10000, changeOrders)).toBe(10750);
    expect(summarizeChangeOrders(changeOrders)).toEqual({
      approved: 750,
      submitted: 500,
      rejected: 750,
      count: 4
    });
  });

  it("summarizes awarded backlog separately from completed installed work", () => {
    const jobs = [
      {
        baseContract: 600000,
        installStatus: "Ready",
        backlogStatus: "Awarded / Waiting",
        forecastStart: "2026-11-01",
        changeOrders: []
      },
      {
        baseContract: 326000,
        installStatus: "Installed",
        backlogStatus: "Complete",
        forecastStart: "2026-06-17",
        changeOrders: [{ amount: 12400, status: "approved" as const }]
      },
      {
        baseContract: 175000,
        installStatus: "Active",
        backlogStatus: "In Fabrication",
        forecastStart: "2027-01-15",
        changeOrders: [{ amount: 25000, status: "approved" as const }]
      }
    ];

    expect(summarizeBacklog(jobs)).toEqual({
      totalBacklog: 800000,
      wonNotStarted: 600000,
      activeProduction: 200000,
      completed: 338400,
      byQuarter: {
        "Q4 2026": 600000,
        "Q1 2027": 200000
      }
    });
  });

  it("separates service work from bid and negotiated backlog", () => {
    const jobs = [
      {
        workType: "Service",
        baseContract: 1200,
        changeOrders: [],
        backlogStatus: "Ready to Install",
        invoiceStatus: "Not Billed"
      },
      {
        workType: "Service",
        baseContract: 650,
        changeOrders: [],
        backlogStatus: "Complete",
        invoiceStatus: "Paid"
      },
      {
        workType: "Bid / ITB",
        baseContract: 600000,
        changeOrders: [],
        backlogStatus: "Awarded / Waiting",
        invoiceStatus: "Not Billed"
      }
    ];

    expect(summarizeServiceWork(jobs)).toEqual({
      openCount: 1,
      openValue: 1200,
      completedValue: 650,
      averageTicket: 925,
      unpaidValue: 1200
    });
  });

  it("tracks purchase orders as committed cost without changing contract revenue", () => {
    const changeOrders = [{ amount: 12000, status: "approved" as const }];
    const purchaseOrders = [
      {
        committedAmount: 18000,
        approvedChangeAmount: 2500,
        invoicedAmount: 7000,
        paidAmount: 4000,
        status: "Issued" as const,
        scope: "Stone / Quartz" as const,
        promisedDate: "2026-05-01"
      },
      {
        committedAmount: 9000,
        invoicedAmount: 9000,
        paidAmount: 9000,
        status: "Void" as const,
        scope: "Cambria" as const,
        promisedDate: "2026-04-20"
      }
    ];

    expect(currentContractValue(100000, changeOrders)).toBe(112000);
    expect(summarizePurchaseOrders(purchaseOrders, "2026-05-09")).toEqual({
      count: 1,
      committed: 20500,
      invoiced: 7000,
      paid: 4000,
      openCommitment: 13500,
      lateCount: 1,
      byScope: { "Stone / Quartz": 20500 }
    });
  });

  it("projects job margin using committed subcontract cost when final cost is not available", () => {
    const summary = jobCostSummary(
      {
        baseContract: 100000,
        finalCost: undefined,
        changeOrders: [{ amount: 10000, status: "approved" as const }],
        purchaseOrders: [{ committedAmount: 22000, status: "Issued" as const, scope: "Cambria" as const }]
      },
      "2026-05-09"
    );

    expect(summary).toMatchObject({
      revenue: 110000,
      committedCost: 22000,
      projectedCost: 22000,
      projectedMarginPct: 80
    });
  });
});

describe("job detail tabs", () => {
  it("keeps the PM job workspace organized into stable tabs", () => {
    expect(jobDetailTabs.map((tab) => tab.id)).toEqual(["actions", "submittals", "financials", "files", "activity"]);
  });
});

describe("change order workflow", () => {
  it("suggests the next CO number from an existing job log", () => {
    expect(nextChangeOrderNumber([{ number: "CO-001" }, { number: "CO-009" }, { number: "COR draft" }])).toBe("CO-010");
  });

  it("warns before submitting an incomplete or duplicate workbook change order", () => {
    const warnings = validateChangeOrderSubmission({
      estimate: {
        id: "est-co",
        jobId: "job-g042",
        documentType: "Change Order",
        proposalNumber: "CO-002",
        projectName: "Tempe Student Union",
        client: "DPR",
        scopeSummary: "CO-002 additional scope for Tempe Student Union",
        pricingMode: "byarea",
        ohPct: 12,
        delPct: 3,
        insPct: 8,
        areas: [],
        subItems: [],
        alternates: [],
        exclusions: [],
        clarifications: []
      },
      amount: 0,
      existingChangeOrders: [{ number: "CO-002" }]
    });

    expect(warnings).toEqual([
      "This change order total is $0.",
      "The scope summary is still generic.",
      "CO-002 already exists on this job."
    ]);
  });

  it("creates a workbook-backed change order with contract context", () => {
    const estimate = createChangeOrderEstimateFromJob(
      {
        id: "job-g042",
        jobNumber: "G26-042",
        pm: "Geoff",
        client: "DPR",
        projectName: "Tempe Student Union",
        baseContract: 100000,
        backlogStatus: "In Fabrication",
        fabStatus: "In Fabrication",
        installStart: "2026-06-01",
        installEnd: "2026-06-05",
        installStatus: "Ready",
        invoiceStatus: "Not Billed",
        crewSize: 3,
        gc: "DPR",
        notes: "",
        changeOrders: [
          { id: "co-1", jobId: "job-g042", number: "CO-001", description: "Approved", amount: 5000, status: "approved", dateSubmitted: "2026-05-01" },
          { id: "co-2", jobId: "job-g042", number: "CO-002", description: "Pending", amount: 2500, status: "submitted", dateSubmitted: "2026-05-02" }
        ],
        purchaseOrders: [],
        submittals: [],
        files: [],
        activity: []
      },
      "2026-05-09"
    );

    expect(estimate.documentType).toBe("Change Order");
    expect(estimate.proposalNumber).toBe("CO-003");
    expect(estimate.projectId).toBe("G26-042");
    expect(estimate.changeOrderContext).toMatchObject({
      baseContract: 100000,
      approvedCoTotal: 5000,
      pendingCoTotal: 2500,
      currentContract: 105000
    });
  });
});

describe("PM action board", () => {
  it("mixes manual notes with auto-generated job alerts", () => {
    const items = buildPmActionItems({
      today: "2026-05-09",
      notes: [
        {
          id: "note-1",
          text: "Call Manny about install access",
          status: "Open",
          priority: "Pinned",
          jobId: "job-g042",
          createdAt: "2026-05-09"
        }
      ],
      jobs: [
        {
          id: "job-g042",
          jobNumber: "G26-042",
          projectName: "Student Union",
          backlogStatus: "Submittals",
          installStatus: "Ready",
          installStart: "2026-06-17",
          changeOrders: [{ amount: 5800, status: "submitted" as const }],
          purchaseOrders: [
            {
              poNumber: "PO-G26-042-001",
              scope: "Stone / Quartz" as const,
              status: "Draft" as const,
              committedAmount: 12000,
              promisedDate: "2026-05-07"
            }
          ],
          submittals: [
            {
              name: "Shop Drawings",
              status: "In Progress" as const,
              dueDate: "2026-05-08",
              releaseBlocker: true
            }
          ],
          files: []
        }
      ]
    });

    expect(items.map((item) => item.title)).toEqual([
      "Call Manny about install access",
      "Shop Drawings is overdue",
      "PO-G26-042-001 needs to be issued",
      "PO-G26-042-001 promised date has slipped",
      "Submitted COs need follow-up",
      "Contract file missing"
    ]);
  });

  it("finds common job number references inside a PM note", () => {
    expect(parseJobReferenceFromNote("Call Manny Job #G 26-042")).toBe("G26-042");
    expect(parseJobReferenceFromNote("stone PO needs to be issued Job G26-051")).toBe("G26-051");
  });
});

describe("schedule capacity", () => {
  it("builds a real month calendar with install jobs shaded across their date range", () => {
    const month = buildInstallCalendarMonth({
      month: "2026-08",
      jobs: [
        {
          id: "job-1",
          jobNumber: "G26-051",
          projectName: "Hospital Phase 1",
          installStart: "2026-08-03",
          installEnd: "2026-08-07",
          crewSize: 4
        },
        {
          id: "job-2",
          jobNumber: "P26-043",
          projectName: "Lab Renovation",
          installStart: "2026-08-04",
          installEnd: "2026-08-06",
          crewSize: 3
        }
      ]
    });

    const augustFourth = month.days.find((day) => day.date === "2026-08-04");
    expect(month.label).toBe("August 2026");
    expect(month.days[0].date).toBe("2026-07-27");
    expect(augustFourth?.jobs.map((job) => job.jobNumber)).toEqual(["G26-051", "P26-043"]);
    expect(augustFourth?.crewTotal).toBe(7);
    expect(augustFourth?.isOverloaded).toBe(true);
  });

  it("moves calendar months backward and forward", () => {
    expect(addMonthsToCalendarMonth("2026-08", -1)).toBe("2026-07");
    expect(addMonthsToCalendarMonth("2026-12", 1)).toBe("2027-01");
  });

  it("flags weeks where multiple installs land at the same time", () => {
    const weeks = buildCapacityWeeks({
      startDate: "2026-08-03",
      weekCount: 2,
      installCrewCapacity: 5,
      shopJobCapacity: 2,
      jobs: [
        {
          id: "job-1",
          jobNumber: "G26-051",
          projectName: "Hospital Phase 1",
          installStart: "2026-08-03",
          installEnd: "2026-08-07",
          expectedFabStart: "2026-07-13",
          expectedCompletion: "2026-08-07",
          crewSize: 4,
          backlogStatus: "Ready to Install"
        },
        {
          id: "job-2",
          jobNumber: "P26-043",
          projectName: "Lab Renovation",
          installStart: "2026-08-04",
          installEnd: "2026-08-06",
          expectedFabStart: "2026-07-20",
          expectedCompletion: "2026-08-06",
          crewSize: 3,
          backlogStatus: "Ready to Install"
        }
      ]
    });

    expect(weeks[0]).toMatchObject({
      weekStart: "2026-08-03",
      installJobCount: 2,
      installCrewPeak: 7,
      installStatus: "overloaded"
    });
    expect(weeks[0].warnings).toContain("2 installs overlap this week");
    expect(weeks[0].warnings).toContain("Peak install crew need is 7 / 5");
  });
});

describe("service workflow", () => {
  it("suggests the next service ticket number for the current year", () => {
    expect(
      suggestServiceJobNumber({
        date: "2026-05-09",
        existingJobs: [{ jobNumber: "S26-001" }, { jobNumber: "G26-060" }, { jobNumber: "S26-002" }]
      })
    ).toBe("S26-003");

    expect(suggestServiceJobNumber({ date: "2027-01-02", existingJobs: [{ jobNumber: "S26-099" }] })).toBe("S27-001");
  });
});

describe("submittal tracking", () => {
  it("marks release-blocking rejected shop drawings as blocked", () => {
    const summary = summarizeSubmittals(
      [
        {
          id: "sub-1",
          jobId: "job-1",
          name: "Shop Drawings",
          type: "Shop Drawings",
          status: "Rejected / Revise and Resubmit",
          revision: 1,
          dueDate: "2026-05-01",
          returnedDate: "2026-05-07",
          releaseBlocker: true
        }
      ],
      "2026-05-09"
    );

    expect(summary).toMatchObject({
      label: "R&R Rev 1",
      releaseState: "Blocked",
      severity: "bad",
      blockingCount: 1
    });
  });

  it("treats submitted release blockers as waiting on GC response", () => {
    const summary = summarizeSubmittals(
      [
        {
          id: "sub-1",
          jobId: "job-1",
          name: "Shop Drawings",
          type: "Shop Drawings",
          status: "Submitted",
          revision: 0,
          dueDate: "2026-05-01",
          submittedDate: "2026-05-03",
          releaseBlocker: true
        }
      ],
      "2026-05-09"
    );

    expect(summary).toMatchObject({
      label: "Submitted",
      releaseState: "Waiting",
      severity: "warn",
      waitingCount: 1
    });
  });

  it("reports release ready when all blocking packages are approved or not required", () => {
    const summary = summarizeSubmittals(
      [
        {
          id: "sub-1",
          jobId: "job-1",
          name: "Shop Drawings",
          type: "Shop Drawings",
          status: "Approved",
          revision: 0,
          releaseBlocker: true
        },
        {
          id: "sub-2",
          jobId: "job-1",
          name: "Finish Samples",
          type: "Finish Samples",
          status: "Void / Not Required",
          revision: 0,
          releaseBlocker: true
        }
      ],
      "2026-05-09"
    );

    expect(summary).toMatchObject({
      label: "Ready",
      releaseState: "Ready",
      severity: "good"
    });
  });

  it("advances a rejected package to the next resubmittal revision", () => {
    const updated = applySubmittalAction(
      {
        id: "sub-1",
        jobId: "job-1",
        name: "Shop Drawings",
        type: "Shop Drawings",
        status: "Rejected / Revise and Resubmit",
        revision: 1,
        releaseBlocker: true
      },
      "resubmit",
      "2026-05-10"
    );

    expect(updated).toMatchObject({
      status: "Resubmitted",
      revision: 2,
      submittedDate: "2026-05-10"
    });
  });

  it("creates a consistent release-blocking package from job detail input", () => {
    const item = createSubmittalPackage({
      id: "sub-new",
      jobId: "job-1",
      name: "Lab Casework Shop Drawings",
      type: "Shop Drawings",
      dueDate: "2026-06-01",
      owner: "Pat",
      releaseBlocker: true,
      notes: "Coordinate with architect comments."
    });

    expect(item).toEqual({
      id: "sub-new",
      jobId: "job-1",
      name: "Lab Casework Shop Drawings",
      type: "Shop Drawings",
      status: "Not Started",
      revision: 0,
      dueDate: "2026-06-01",
      owner: "Pat",
      releaseBlocker: true,
      notes: "Coordinate with architect comments."
    });
  });

  it("allows an accidental not-required package to be restored as release blocking", () => {
    const notRequired = applySubmittalAction(
      {
        id: "sub-1",
        jobId: "job-1",
        name: "Shop Drawings",
        type: "Shop Drawings",
        status: "In Progress",
        revision: 0,
        releaseBlocker: true
      },
      "notRequired",
      "2026-05-09"
    );

    const restored = updateSubmittalPackage(notRequired, {
      status: "Not Started",
      releaseBlocker: true,
      dueDate: "2026-05-20"
    });

    expect(restored).toMatchObject({
      status: "Not Started",
      releaseBlocker: true,
      dueDate: "2026-05-20"
    });
  });

  it("supports simplified submitted approved and revision checkboxes", () => {
    const base = {
      id: "sub-1",
      jobId: "job-1",
      name: "Shop Drawings",
      type: "Shop Drawings" as const,
      status: "Not Started" as const,
      revision: 0,
      dueDate: "2026-05-20",
      releaseBlocker: true
    };

    const submitted = setSubmittalChecklistState(base, { submitted: true }, "2026-05-09");
    const rejected = setSubmittalChecklistState(submitted, { revise: true }, "2026-05-10");
    const resubmitted = setSubmittalChecklistState(rejected, { resubmittedDate: "2026-05-12" }, "2026-05-12");
    const approved = setSubmittalChecklistState(resubmitted, { approved: true }, "2026-05-15");

    expect(submitted).toMatchObject({ status: "Submitted", submittedDate: "2026-05-09" });
    expect(rejected).toMatchObject({ status: "Rejected / Revise and Resubmit", returnedDate: "2026-05-10" });
    expect(resubmitted).toMatchObject({ status: "Resubmitted", revision: 1, submittedDate: "2026-05-12" });
    expect(approved).toMatchObject({ status: "Approved", returnedDate: "2026-05-15" });
  });
});

describe("opportunity import", () => {
  it("maps Estimating Master V4 bid rows into the opportunity register model", () => {
    const opportunity = mapEstimatingMasterRow({
      "Job ID": "B-2604",
      Month: "April",
      Client: "Acme GC",
      "Project Name": "Library Casework",
      "Bid Due Date": "2026-04-22",
      "Drawing Stage": "CD",
      "Bid Type": "Public",
      "Sent Date": "2026-04-20",
      "Sub. Method": "Email",
      Status: "Submitted",
      "Win?": "",
      "Job Type": "Casework",
      "Est. Bid Value": 125000,
      "Link: Drawings": "https://drawings.example",
      "Link: Specs": "https://specs.example",
      "Link: Schedule": "https://schedule.example",
      Notes: "Needs follow-up",
      "Bid Feedback": "Waiting",
      "NTP Received?": "No",
      "Final Cost": ""
    });

    expect(opportunity).toMatchObject({
      jobId: "B-2604",
      client: "Acme GC",
      projectName: "Library Casework",
      drawingStage: "CD",
      estimatedValue: 125000,
      initialContractValue: null,
      links: {
        drawings: "https://drawings.example",
        specs: "https://specs.example",
        schedule: "https://schedule.example"
      }
    });
  });

  it("flags submitted opportunities as stale after the follow-up window", () => {
    expect(
      shouldFlagStaleFollowUp({
        status: "Submitted",
        sentDate: "2026-01-01",
        winLoss: "",
        today: "2026-05-07",
        staleAfterDays: 45
      })
    ).toBe(true);
  });
});

describe("opportunity workflow", () => {
  it("suggests the next PM-based job number for the award year", () => {
    const jobs = [
      { jobNumber: "G26-002" },
      { jobNumber: "P26-043" },
      { jobNumber: "G26-042" },
      { jobNumber: "G25-099" }
    ];

    expect(suggestJobNumber({ pm: "Geoff", awardDate: "2026-05-07", existingJobs: jobs })).toBe("G26-043");
    expect(suggestJobNumber({ pm: "Pat", awardDate: "2026-05-07", existingJobs: jobs })).toBe("P26-044");
  });

  it("keeps prior-year unresolved opportunities in the carryover view", () => {
    const opportunities = [
      { jobId: "Q-26-084", status: "Submitted", winLoss: "", bidDueDate: "2026-12-15", sentDate: "2026-12-15" },
      { jobId: "Q-27-001", status: "Lead / ITB", winLoss: "", bidDueDate: "2027-01-08", sentDate: "" },
      { jobId: "Q-26-083", status: "Lost", winLoss: "Lost", bidDueDate: "2026-11-10", sentDate: "2026-11-09" }
    ];

    const carryover = filterOpportunitiesForView(opportunities, {
      view: "carryover",
      year: 2027,
      today: "2027-01-10"
    });

    expect(carryover.map((opportunity) => opportunity.jobId)).toEqual(["Q-26-084"]);
  });

  it("includes unresolved carryover in the default this-year view", () => {
    const opportunities = [
      { jobId: "Q-26-084", status: "Submitted", winLoss: "", bidDueDate: "2026-12-15", sentDate: "2026-12-15" },
      { jobId: "Q-27-001", status: "Lead / ITB", winLoss: "", bidDueDate: "2027-01-08", sentDate: "" }
    ];

    const current = filterOpportunitiesForView(opportunities, {
      view: "this-year",
      year: 2027,
      today: "2027-01-10"
    });

    expect(current.map((opportunity) => opportunity.jobId)).toEqual(["Q-26-084", "Q-27-001"]);
  });
});

describe("workbook copy helpers", () => {
  it("copies an area with new ids and preserves section/item content", () => {
    const area = {
      id: "area-1",
      name: "Level 1",
      qty: 2,
      sections: [
        {
          id: "section-1",
          name: "Reception",
          items: [{ id: "item-1", name: "Desk", qty: 4, unitCost: 100 }]
        }
      ]
    };

    const copy = cloneArea(area, "area-copy");

    expect(copy.id).toBe("area-copy");
    expect(copy.name).toBe("Level 1 copy");
    expect(copy.sections[0].name).toBe("Reception");
    expect(copy.sections[0].items[0].name).toBe("Desk");
    expect(copy.sections[0].id).not.toBe("section-1");
    expect(copy.sections[0].items[0].id).not.toBe("item-1");
  });

  it("copies an area with optional quantity and flag resets", () => {
    const area = {
      id: "area-1",
      name: "Level 1",
      qty: 3,
      ignored: true,
      noPrint: true,
      sections: [
        {
          id: "section-1",
          name: "Reception",
          ignored: true,
          noPrint: true,
          items: [{ id: "item-1", name: "Desk", qty: 4, unitCost: 100, ignored: true, noPrint: true }]
        }
      ]
    };

    const copy = cloneArea(area, "area-copy", { carryFlags: false, carryQuantities: false });

    expect(copy.qty).toBe(1);
    expect(copy.ignored).toBe(false);
    expect(copy.noPrint).toBe(false);
    expect(copy.sections[0].ignored).toBe(false);
    expect(copy.sections[0].noPrint).toBe(false);
    expect(copy.sections[0].items[0].qty).toBe(1);
    expect(copy.sections[0].items[0].ignored).toBe(false);
  });

  it("copies a section with new ids and item content intact", () => {
    const section = {
      id: "section-1",
      name: "Reception",
      items: [{ id: "item-1", name: "Desk", qty: 4, unitCost: 100 }]
    };

    const copy = cloneSection(section, "section-copy");

    expect(copy.id).toBe("section-copy");
    expect(copy.name).toBe("Reception copy");
    expect(copy.items[0].name).toBe("Desk");
    expect(copy.items[0].id).not.toBe("item-1");
  });

  it("copies selected line items with optional quantity and flag resets", () => {
    const items = [
      { id: "item-1", name: "Desk", qty: 4, unitCost: 100, ignored: true, noPrint: true },
      { id: "item-2", name: "Top", qty: 8, unitCost: 50 }
    ];

    const copies = cloneItems(items, { carryFlags: false, carryQuantities: false });

    expect(copies).toHaveLength(2);
    expect(copies[0].id).not.toBe("item-1");
    expect(copies[0].name).toBe("Desk");
    expect(copies[0].qty).toBe(1);
    expect(copies[0].ignored).toBe(false);
    expect(copies[0].noPrint).toBe(false);
  });
});

describe("workbook clipboard helpers", () => {
  it("parses spreadsheet-style rows into estimate items", () => {
    const items = parseClipboardLineItems("Description\tQty\tUnit\tUnit Cost\tIG\tNP\nLab base cabinets\t24\tlin. ft\t$310\t\tX\nEpoxy top\t12\tsq. ft\t95\tTRUE\t");

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: "Lab base cabinets", qty: 24, unit: "lin. ft", unitCost: 310, noPrint: true });
    expect(items[1]).toMatchObject({ name: "Epoxy top", qty: 12, unit: "sq. ft", unitCost: 95, ignored: true });
  });

  it("serializes selected estimate items as tab-delimited clipboard rows", () => {
    expect(estimateItemsToClipboardText([{ name: "Desk", qty: 2, unit: "EA", unitCost: 450 }])).toBe("Desk\t2\tEA\t450\t\t");
  });
});
