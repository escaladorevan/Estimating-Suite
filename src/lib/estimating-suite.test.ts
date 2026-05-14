import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createChangeOrderEstimateFromJob, nextChangeOrderNumber, validateChangeOrderSubmission } from "./change-order-workflow";
import { calculateEstimateTotals } from "./estimate-math";
import { mapEstimateFromRow, mapEstimateSnapshotToInsert, mapEstimateToUpsert } from "./estimate-repository";
import { buildProjectFileStoragePath, mapProjectFileFromRow, mapProjectFileToInsert, pruneProjectFileSlotMetadata } from "./file-repository";
import {
  mapActivityEventFromRow,
  mapActivityEventToInsert,
  mapChangeOrderFromRow,
  mapChangeOrderToInsert,
  mapChangeOrderToUpdate,
  mapJobFromRow,
  mapJobToUpsert,
  mapPMNoteFromRow,
  mapPMNoteToInsert,
  mapPMNoteToUpdate,
  mapPurchaseOrderFromRow,
  mapPurchaseOrderToInsert,
  mapPurchaseOrderToUpdate,
  mapSubmittalFromRow,
  mapSubmittalToInsert,
  mapSubmittalToUpdate
} from "./job-repository";
import {
  currentContractValue,
  jobCostSummary,
  summarizeBacklog,
  summarizeChangeOrders,
  summarizePurchaseOrders,
  summarizeServiceWork
} from "./job-financials";
import { jobDetailTabs } from "./job-detail-tabs";
import { mapOpportunityFromRow, mapOpportunityToUpsert } from "./opportunity-repository";
import { mapEstimatingMasterRow, shouldFlagStaleFollowUp } from "./opportunity-import";
import { CHANGE_ORDER_STATUSES, OPPORTUNITY_STATUSES } from "./status-constants";
import { reconcilePersistedJobIdentity, resolvePersistedJobForPMNote } from "./job-persistence-reconciliation";
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
import type { Job } from "@/types";

const productionSchema = () => readFileSync(join(process.cwd(), "supabase", "rebuild-production-schema.sql"), "utf8");

function sqlCheckValues(sql: string, tableName: string, columnName: string): string[] {
  const tableStart = sql.indexOf(`create table public.${tableName} (`);
  expect(tableStart).toBeGreaterThanOrEqual(0);

  const tableEnd = sql.indexOf("\n);", tableStart);
  expect(tableEnd).toBeGreaterThan(tableStart);

  const tableSql = sql.slice(tableStart, tableEnd);
  const columnStart = tableSql.indexOf(`${columnName} text`);
  expect(columnStart).toBeGreaterThanOrEqual(0);

  const checkMatch = tableSql.slice(columnStart).match(/check \([^)]* in \(([^)]*)\)\)/);
  expect(checkMatch).not.toBeNull();

  return [...checkMatch![1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe("status contract constants", () => {
  it("keeps opportunity statuses aligned with the production SQL check", () => {
    expect(OPPORTUNITY_STATUSES).toEqual(sqlCheckValues(productionSchema(), "opportunities", "status"));
  });

  it("keeps change order statuses aligned with the production SQL check", () => {
    expect(CHANGE_ORDER_STATUSES).toEqual(sqlCheckValues(productionSchema(), "change_orders", "status"));
  });
});

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
      draft: 0,
      priced: 0,
      sent: 0,
      approved: 750,
      submitted: 500,
      pending: 0,
      rejected: 750,
      void: 0,
      count: 4
    });
  });

  it("keeps database change order statuses in explicit financial buckets", () => {
    expect(
      summarizeChangeOrders([
        { amount: 100, status: "draft" as const },
        { amount: 200, status: "priced" as const },
        { amount: 300, status: "sent" as const },
        { amount: 400, status: "pending" as const },
        { amount: 500, status: "void" as const }
      ])
    ).toMatchObject({
      draft: 100,
      priced: 200,
      sent: 300,
      pending: 400,
      void: 500,
      count: 5
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

  it("projects job cost from actual cost plus remaining open commitments", () => {
    const summary = jobCostSummary(
      {
        baseContract: 100000,
        finalCost: 25000,
        changeOrders: [],
        purchaseOrders: [
          {
            committedAmount: 20000,
            invoicedAmount: 5000,
            status: "Issued" as const,
            scope: "Stone / Quartz" as const
          }
        ]
      },
      "2026-05-09"
    );

    expect(summary).toMatchObject({
      revenue: 100000,
      finalCost: 25000,
      committedCost: 20000,
      projectedCost: 40000,
      projectedMarginPct: 60
    });
  });
});

describe("opportunity repository mapping", () => {
  it("maps production Supabase opportunity rows into UI opportunities", () => {
    const opportunity = mapOpportunityFromRow({
      id: "2dd51464-96d7-4ed1-ae7e-35ab2e92f865",
      opportunity_number: "Q-26-014",
      work_type: "Negotiated",
      month: "May",
      client: "Andersen",
      project_name: "Northwest Clinic",
      bid_due_date: "2026-06-01",
      drawing_stage: "DD",
      bid_type: "Budget",
      sent_date: null,
      submission_method: "Email",
      status: "Pricing",
      win_loss: "",
      job_type: "Medical",
      estimated_value: 145000,
      drawing_link: "drawings-url",
      specs_link: null,
      schedule_link: "schedule-url",
      notes: "Follow up with Manny",
      bid_feedback: null,
      ntp_received: false,
      initial_contract_value: null,
      final_cost: null
    });

    expect(opportunity).toMatchObject({
      id: "2dd51464-96d7-4ed1-ae7e-35ab2e92f865",
      jobId: "Q-26-014",
      workType: "Negotiated",
      client: "Andersen",
      projectName: "Northwest Clinic",
      bidDueDate: "2026-06-01",
      sentDate: "",
      links: { drawings: "drawings-url", specs: "", schedule: "schedule-url" },
      bidFeedback: "",
      initialContractValue: null
    });
  });

  it("maps UI opportunities into production Supabase upsert payloads", () => {
    const payload = mapOpportunityToUpsert({
      id: "2dd51464-96d7-4ed1-ae7e-35ab2e92f865",
      jobId: "Q-26-014",
      workType: "Negotiated",
      month: "May",
      client: "Andersen",
      projectName: "Northwest Clinic",
      bidDueDate: "2026-06-01",
      drawingStage: "DD",
      bidType: "Budget",
      sentDate: "",
      submissionMethod: "Email",
      status: "Pricing",
      winLoss: "",
      jobType: "Medical",
      estimatedValue: 145000,
      links: { drawings: "drawings-url", specs: "", schedule: "schedule-url" },
      notes: "Follow up with Manny",
      bidFeedback: "",
      ntpReceived: false,
      initialContractValue: null,
      finalCost: null,
      files: []
    });

    expect(payload).toMatchObject({
      id: "2dd51464-96d7-4ed1-ae7e-35ab2e92f865",
      opportunity_number: "Q-26-014",
      work_type: "Negotiated",
      project_name: "Northwest Clinic",
      bid_due_date: "2026-06-01",
      sent_date: null,
      specs_link: null,
      estimated_value: 145000
    });
  });
});

describe("estimate repository mapping", () => {
  const estimate = {
    id: "2dd51464-96d7-4ed1-ae7e-35ab2e92f865",
    opportunityId: "1b6f59f2-c04c-4b10-bb2b-35a53d61516c",
    jobId: "50f42d9f-b53f-4a97-b711-dc8b1cd13384",
    documentType: "Proposal" as const,
    proposalNumber: "Q-26-014",
    revision: "",
    projectName: "Northwest Clinic",
    projectLocation: "Phoenix, AZ",
    client: "Andersen",
    clientAddress: "",
    clientContact: "Manny",
    architect: "SmithGroup",
    estimator: "Evan",
    bidDate: "2026-06-01",
    dueDate: "",
    deliveryDate: "TBD",
    shipVia: "",
    poNumber: "",
    projectId: "Q-26-014",
    bidDocuments: "IFC drawings",
    drawingsDated: "",
    addenda: "",
    scopeSummary: "Base casework",
    validDays: 30,
    paymentTerms: "Net 30",
    leadTime: "",
    pricingMode: "byarea" as const,
    ohPct: 12,
    delPct: 3,
    insPct: 8,
    areas: [{ id: "area-1", name: "Base Bid", qty: 1, sections: [{ id: "sec-1", name: "Lab", items: [{ id: "item-1", name: "Base cabinets", qty: 10, unitCost: 50 }] }] }],
    subItems: [],
    alternates: [],
    exclusions: ["Electrical by others."],
    clarifications: ["Based on IFC drawings."]
  };

  it("maps UI estimates into production Supabase header upserts", () => {
    expect(mapEstimateToUpsert(estimate)).toMatchObject({
      id: "2dd51464-96d7-4ed1-ae7e-35ab2e92f865",
      opportunity_id: "1b6f59f2-c04c-4b10-bb2b-35a53d61516c",
      job_id: "50f42d9f-b53f-4a97-b711-dc8b1cd13384",
      document_type: "Proposal",
      proposal_number: "Q-26-014",
      revision: null,
      project_name: "Northwest Clinic",
      client_address: null,
      bid_date: "2026-06-01",
      due_date: null,
      project_identifier: "Q-26-014",
      overhead_pct: 12,
      delivery_pct: 3,
      install_pct: 8,
      exclusions: ["Electrical by others."],
      clarifications: ["Based on IFC drawings."]
    });
  });

  it("maps production Supabase estimate rows back into sample-mode workbook estimates", () => {
    const mapped = mapEstimateFromRow({
      id: "2dd51464-96d7-4ed1-ae7e-35ab2e92f865",
      opportunity_id: null,
      job_id: "50f42d9f-b53f-4a97-b711-dc8b1cd13384",
      document_type: "Budget",
      proposal_number: null,
      revision: null,
      project_name: "Northwest Clinic",
      project_location: null,
      client: "Andersen",
      client_address: null,
      client_contact: "Manny",
      architect: null,
      estimator: null,
      bid_date: null,
      due_date: "2026-06-03",
      delivery_date: null,
      ship_via: null,
      po_number: null,
      project_identifier: "Q-26-014",
      bid_documents: null,
      drawings_dated: null,
      addenda: null,
      scope_summary: null,
      valid_days: null,
      payment_terms: null,
      lead_time: null,
      pricing_mode: "lumpsum",
      overhead_pct: "10.5",
      delivery_pct: 2,
      install_pct: null,
      exclusions: ["Electrical by others."],
      clarifications: null,
      terms: {},
      change_order_context: null
    });

    expect(mapped).toMatchObject({
      id: "2dd51464-96d7-4ed1-ae7e-35ab2e92f865",
      opportunityId: undefined,
      jobId: "50f42d9f-b53f-4a97-b711-dc8b1cd13384",
      documentType: "Budget",
      proposalNumber: "",
      bidDate: "",
      dueDate: "2026-06-03",
      projectId: "Q-26-014",
      pricingMode: "lumpsum",
      ohPct: 10.5,
      delPct: 2,
      insPct: 0,
      areas: [],
      exclusions: ["Electrical by others."],
      clarifications: []
    });
  });

  it("serializes estimate snapshots with stable owner links and totals", () => {
    expect(mapEstimateSnapshotToInsert(estimate)).toMatchObject({
      estimate_id: "2dd51464-96d7-4ed1-ae7e-35ab2e92f865",
      opportunity_id: "1b6f59f2-c04c-4b10-bb2b-35a53d61516c",
      job_id: "50f42d9f-b53f-4a97-b711-dc8b1cd13384",
      material_total: 500,
      bid_total: 621.6,
      snapshot: estimate
    });
  });
});

describe("file repository mapping", () => {
  it("maps project file rows into UI file metadata without losing owner links", () => {
    expect(
      mapProjectFileFromRow({
        id: "file-1",
        owner_type: "estimate",
        owner_id: "2dd51464-96d7-4ed1-ae7e-35ab2e92f865",
        slot: "proposal",
        name: "Proposal.pdf",
        storage_bucket: "project-files",
        storage_path: "estimate/2dd51464-96d7-4ed1-ae7e-35ab2e92f865/proposal/Proposal.pdf",
        mime_type: "application/pdf",
        size_bytes: 15000,
        uploaded_at: "2026-06-01T12:00:00Z"
      })
    ).toEqual({
      id: "file-1",
      ownerType: "estimate",
      ownerId: "2dd51464-96d7-4ed1-ae7e-35ab2e92f865",
      slot: "proposal",
      name: "Proposal.pdf",
      url: "project-files/estimate/2dd51464-96d7-4ed1-ae7e-35ab2e92f865/proposal/Proposal.pdf",
      uploadedAt: "2026-06-01T12:00:00Z"
    });
  });

  it("maps UI file metadata into database inserts and generated storage paths", () => {
    const storagePath = buildProjectFileStoragePath({
      ownerType: "estimate",
      ownerId: "2dd51464-96d7-4ed1-ae7e-35ab2e92f865",
      slot: "signed proposal",
      fileName: "Proposal Rev 1.pdf",
      uniqueId: "upload-001"
    });

    expect(storagePath).toBe("estimate/2dd51464-96d7-4ed1-ae7e-35ab2e92f865/signed-proposal/upload-001-proposal-rev-1.pdf");
    expect(
      mapProjectFileToInsert({
        ownerType: "estimate",
        ownerId: "2dd51464-96d7-4ed1-ae7e-35ab2e92f865",
        slot: "signed proposal",
        name: "Proposal Rev 1.pdf",
        storagePath,
        mimeType: "application/pdf",
        sizeBytes: 15000
      })
    ).toMatchObject({
      owner_type: "estimate",
      owner_id: "2dd51464-96d7-4ed1-ae7e-35ab2e92f865",
      slot: "signed proposal",
      name: "Proposal Rev 1.pdf",
      storage_bucket: "project-files",
      storage_path: "estimate/2dd51464-96d7-4ed1-ae7e-35ab2e92f865/signed-proposal/upload-001-proposal-rev-1.pdf",
      mime_type: "application/pdf",
      size_bytes: 15000
    });
  });

  it("rejects database file metadata inserts for local sample owner ids", () => {
    expect(() =>
      mapProjectFileToInsert({
        ownerType: "job",
        ownerId: "job-g060",
        slot: "contract",
        name: "Contract.pdf"
      })
    ).toThrow("persisted UUID owner id");
  });

  it("prunes replaced file-slot metadata while keeping the newest file row", async () => {
    const calls: Array<[string, string]> = [];
    const client = {
      from: () => ({
        delete: () => ({
          eq: (column: string, value: string) => {
            calls.push([column, value]);
            return {
              eq: (column2: string, value2: string) => {
                calls.push([column2, value2]);
                return {
                  eq: (column3: string, value3: string) => {
                    calls.push([column3, value3]);
                    return {
                      neq: (column4: string, value4: string) => {
                        calls.push([column4, value4]);
                        return { error: null };
                      }
                    };
                  }
                };
              }
            };
          }
        })
      })
    };

    await pruneProjectFileSlotMetadata(
      {
        ownerType: "job",
        ownerId: "50f42d9f-b53f-4a97-b711-dc8b1cd13384",
        slot: "contract",
        keepId: "8f861063-22d2-4db4-8a0f-b5f8b8f70a1b"
      },
      client as any
    );

    expect(calls).toEqual([
      ["owner_type", "job"],
      ["owner_id", "50f42d9f-b53f-4a97-b711-dc8b1cd13384"],
      ["slot", "contract"],
      ["id", "8f861063-22d2-4db4-8a0f-b5f8b8f70a1b"]
    ]);
  });
});

describe("job repository mapping", () => {
  const jobUuid = "50f42d9f-b53f-4a97-b711-dc8b1cd13384";

  it("maps production job rows into UI jobs with nullable contract and date fields", () => {
    const job = mapJobFromRow({
      id: jobUuid,
      opportunity_id: null,
      job_number: "G26-060",
      work_type: "Negotiated",
      pm: null,
      client: "DPR",
      project_name: "Tempe Student Union",
      base_contract: "125000.50",
      bid_ref: null,
      award_date: "2026-05-01",
      ntp_date: null,
      backlog_status: "Submittals",
      forecast_start: null,
      forecast_end: "2026-08-21",
      forecast_quarter: null,
      expected_fab_start: null,
      expected_completion: null,
      fab_status: null,
      install_start: null,
      install_end: "2026-08-28",
      install_status: null,
      invoice_status: null,
      crew_size: null,
      gc: null,
      service_scope: null,
      requested_date: null,
      scheduled_date: null,
      assigned_to: null,
      notes: null,
      final_cost: null
    });

    expect(job).toMatchObject({
      id: jobUuid,
      jobNumber: "G26-060",
      workType: "Negotiated",
      pm: "",
      client: "DPR",
      projectName: "Tempe Student Union",
      baseContract: 125000.5,
      bidRef: "",
      awardDate: "2026-05-01",
      ntpDate: "",
      backlogStatus: "Submittals",
      forecastStart: "",
      forecastEnd: "2026-08-21",
      fabStatus: "Not Started",
      installStart: "",
      installEnd: "2026-08-28",
      installStatus: "Ready",
      invoiceStatus: "Not Billed",
      crewSize: 0,
      gc: "",
      notes: "",
      finalCost: undefined,
      changeOrders: [],
      purchaseOrders: [],
      submittals: [],
      files: [],
      activity: []
    });
  });

  it("maps UI job headers into upserts without sending local sample ids as UUIDs", () => {
    const payload = mapJobToUpsert({
      id: "job-g060",
      jobNumber: "G26-060",
      workType: "Bid / ITB",
      pm: "Geoff",
      client: "DPR",
      projectName: "Tempe Student Union",
      baseContract: 125000,
      bidRef: "",
      awardDate: "",
      ntpDate: "2026-05-04",
      backlogStatus: "Awarded / Waiting",
      forecastStart: "",
      forecastEnd: "2026-08-21",
      forecastQuarter: "",
      expectedFabStart: "",
      expectedCompletion: "",
      fabStatus: "Not Started",
      installStart: "",
      installEnd: "",
      installStatus: "Ready",
      invoiceStatus: "Not Billed",
      crewSize: 3,
      gc: "",
      notes: "",
      finalCost: undefined,
      changeOrders: [],
      purchaseOrders: [],
      submittals: [],
      files: [],
      activity: []
    });

    expect(payload).toMatchObject({
      job_number: "G26-060",
      pm: "Geoff",
      bid_ref: null,
      award_date: null,
      ntp_date: "2026-05-04",
      forecast_start: null,
      forecast_end: "2026-08-21",
      final_cost: null
    });
    expect(payload.id).toBeUndefined();
  });

  it("maps every allowed database change order status", () => {
    expect(
      CHANGE_ORDER_STATUSES.map((status) =>
        mapChangeOrderFromRow({
          id: `${status}-id`,
          job_id: jobUuid,
          estimate_id: null,
          number: `CO-${status}`,
          description: status,
          amount: "100",
          status,
          date_submitted: null,
          approved_date: null,
          gc_reference: null,
          notes: null
        }).status
      )
    ).toEqual(CHANGE_ORDER_STATUSES);

    expect(
      mapChangeOrderToInsert({
        id: "co-local",
        jobId: "job-g060",
        number: "CO-001",
        description: "Local draft",
        amount: 100,
        status: "submitted",
        dateSubmitted: ""
      })
    ).toMatchObject({ job_id: null, date_submitted: null });
  });

  it("maps purchase order committed and invoiced fields", () => {
    const po = mapPurchaseOrderFromRow({
      id: "8f861063-22d2-4db4-8a0f-b5f8b8f70a1b",
      job_id: jobUuid,
      po_number: "PO-G26-060-001",
      vendor: "Cambria",
      scope: "Cambria",
      description: null,
      status: "Issued",
      committed_amount: "15000.25",
      approved_change_amount: "1200",
      invoiced_amount: "7000.75",
      paid_amount: null,
      issue_date: "2026-05-10",
      needed_by: null,
      promised_date: "2026-06-01",
      received_date: null,
      owner: null,
      notes: null
    });

    expect(po).toMatchObject({
      committedAmount: 15000.25,
      approvedChangeAmount: 1200,
      invoicedAmount: 7000.75,
      paidAmount: 0,
      issueDate: "2026-05-10",
      neededBy: "",
      promisedDate: "2026-06-01"
    });

    expect(mapPurchaseOrderToUpdate(po)).toMatchObject({
      committed_amount: 15000.25,
      approved_change_amount: 1200,
      invoiced_amount: 7000.75,
      paid_amount: 0
    });
  });

  it("maps submittal status and date fields", () => {
    const submittal = mapSubmittalFromRow({
      id: "2fa5c026-dd39-4211-a609-997d193c9800",
      job_id: jobUuid,
      name: "Shop Drawings",
      type: "Shop Drawings",
      status: "Approved as Noted",
      revision: 2,
      due_date: "2026-05-20",
      submitted_date: "2026-05-12",
      returned_date: "2026-05-18",
      owner: "Pat",
      release_blocker: true,
      notes: null
    });

    expect(submittal).toMatchObject({
      status: "Approved as Noted",
      revision: 2,
      dueDate: "2026-05-20",
      submittedDate: "2026-05-12",
      returnedDate: "2026-05-18",
      releaseBlocker: true
    });

    expect(mapSubmittalToUpdate(submittal)).toMatchObject({
      status: "Approved as Noted",
      due_date: "2026-05-20",
      submitted_date: "2026-05-12",
      returned_date: "2026-05-18"
    });
  });

  it("maps PM note job linkage and rejects local job ids for database inserts", () => {
    expect(
      mapPMNoteFromRow({
        id: "a603d881-b3c0-4ffb-bb1f-a27f1584770d",
        text: "Call Manny",
        status: "Waiting",
        priority: "Pinned",
        job_id: jobUuid,
        due_date: "2026-05-30",
        created_at: "2026-05-14T12:00:00Z",
        completed_at: null
      })
    ).toMatchObject({ jobId: jobUuid, dueDate: "2026-05-30", createdAt: "2026-05-14T12:00:00Z" });

    expect(() =>
      mapPMNoteToInsert({
        id: "note-local",
        text: "Needs persisted job",
        status: "Open",
        priority: "Normal",
        jobId: "job-g060",
        createdAt: "2026-05-14"
      })
    ).toThrow("persisted UUID job id");
  });

  it("maps child inserts and activity events with persisted owner ids", () => {
    expect(
      mapChangeOrderToUpdate({
        id: "co-local",
        jobId: jobUuid,
        number: "CO-002",
        description: "Added panels",
        amount: 2500,
        status: "approved",
        dateSubmitted: "2026-05-10",
        approvedDate: "2026-05-12"
      })
    ).toMatchObject({ id: undefined, job_id: jobUuid, approved_date: "2026-05-12" });

    expect(
      mapPurchaseOrderToInsert({
        id: "po-local",
        jobId: jobUuid,
        poNumber: "PO-G26-060-001",
        vendor: "Cambria",
        scope: "Cambria",
        description: "",
        status: "Draft",
        committedAmount: 9000
      })
    ).toMatchObject({ id: undefined, job_id: jobUuid, description: null, committed_amount: 9000 });

    expect(
      mapSubmittalToInsert({
        id: "sub-local",
        jobId: jobUuid,
        name: "Finish Samples",
        type: "Finish Samples",
        status: "Submitted",
        revision: 1,
        submittedDate: "2026-05-11",
        releaseBlocker: false
      })
    ).toMatchObject({ id: undefined, job_id: jobUuid, submitted_date: "2026-05-11" });

    const activity = mapActivityEventFromRow({
      id: "9f3fd299-c04f-443b-b833-eed49724505d",
      owner_type: "job",
      owner_id: jobUuid,
      author: null,
      message: "Job created",
      created_at: "2026-05-14T12:00:00Z"
    });

    expect(activity).toMatchObject({ ownerType: "job", ownerId: jobUuid, author: "", message: "Job created" });
    expect(mapActivityEventToInsert(activity)).toMatchObject({ owner_type: "job", owner_id: jobUuid });
    expect(mapActivityEventToInsert({ ...activity, ownerType: "change_order" })).toMatchObject({ owner_type: "change_order" });
    expect(() => mapActivityEventToInsert({ ...activity, ownerId: "job-g060" })).toThrow("persisted UUID owner id");
  });

  it("maps PM note updates without resending immutable created timestamps", () => {
    expect(
      mapPMNoteToUpdate({
        id: "note-local",
        text: "Done",
        status: "Done",
        priority: "Normal",
        createdAt: "2026-05-14T12:00:00Z",
        completedAt: "2026-05-15T12:00:00Z"
      })
    ).toMatchObject({
      id: undefined,
      text: "Done",
      status: "Done",
      priority: "Normal",
      job_id: null,
      completed_at: "2026-05-15T12:00:00Z"
    });
  });
});

describe("job persistence reconciliation", () => {
  it("replaces local job ids with persisted UUIDs across selected records and child references", () => {
    const persistedJobId = "50f42d9f-b53f-4a97-b711-dc8b1cd13384";
    const result = reconcilePersistedJobIdentity({
      currentJobs: [
        {
          id: "job-g061",
          jobNumber: "G26-061",
          workType: "Bid / ITB",
          pm: "Geoff",
          client: "Smoke GC",
          projectName: "Smoke Test",
          baseContract: 100000,
          bidRef: "",
          awardDate: "",
          ntpDate: "",
          backlogStatus: "Awarded / Waiting",
          forecastStart: "",
          forecastEnd: "",
          forecastQuarter: "",
          expectedFabStart: "",
          expectedCompletion: "",
          fabStatus: "Not Started",
          installStart: "",
          installEnd: "",
          installStatus: "Ready",
          invoiceStatus: "Not Billed",
          crewSize: 2,
          gc: "",
          notes: "",
          changeOrders: [
            {
              id: "co-local",
              jobId: "job-g061",
              number: "CO-001",
              description: "Priced smoke",
              amount: 2500,
              status: "submitted",
              dateSubmitted: "2026-05-14"
            }
          ],
          purchaseOrders: [],
          submittals: [
            {
              id: "sub-local",
              jobId: "job-g061",
              name: "Smoke Shop Drawings",
              type: "Shop Drawings",
              status: "Submitted",
              revision: 1,
              releaseBlocker: true
            }
          ],
          files: [
            {
              id: "file-contract-local",
              ownerType: "job",
              ownerId: "job-g061",
              slot: "contract",
              name: "contract-smoke.txt",
              uploadedAt: "2026-05-14"
            }
          ],
          activity: [
            {
              id: "act-local",
              ownerType: "job",
              ownerId: "job-g061",
              author: "System",
              message: "Created smoke job.",
              createdAt: "2026-05-14"
            }
          ]
        }
      ],
      persistedJobs: [
        {
          id: persistedJobId,
          jobNumber: "G26-061",
          workType: "Bid / ITB",
          pm: "Geoff",
          client: "Smoke GC",
          projectName: "Smoke Test",
          baseContract: 100000,
          bidRef: "",
          awardDate: "",
          ntpDate: "",
          backlogStatus: "Awarded / Waiting",
          forecastStart: "",
          forecastEnd: "",
          forecastQuarter: "",
          expectedFabStart: "",
          expectedCompletion: "",
          fabStatus: "Not Started",
          installStart: "",
          installEnd: "",
          installStatus: "Ready",
          invoiceStatus: "Not Billed",
          crewSize: 2,
          gc: "",
          notes: "",
          changeOrders: [],
          purchaseOrders: [],
          submittals: [],
          files: [],
          activity: []
        }
      ],
      estimates: [
        {
          id: "estimate-local",
          jobId: "job-g061",
          projectName: "Smoke Test",
          client: "Smoke GC",
          pricingMode: "itemized",
          ohPct: 0,
          delPct: 0,
          insPct: 0,
          areas: [],
          subItems: [],
          alternates: [],
          exclusions: [],
          clarifications: []
        }
      ],
      pmNotes: [
        {
          id: "note-local",
          text: "Call Manny Job G26-061",
          status: "Open",
          priority: "Normal",
          jobId: "job-g061",
          createdAt: "2026-05-14"
        }
      ],
      selectedJobId: "job-g061",
      detailJobId: "job-g061"
    });

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].id).toBe(persistedJobId);
    expect(result.jobs[0].changeOrders[0].jobId).toBe(persistedJobId);
    expect(result.jobs[0].submittals[0].jobId).toBe(persistedJobId);
    expect(result.jobs[0].files[0].ownerId).toBe(persistedJobId);
    expect(result.jobs[0].activity[0].ownerId).toBe(persistedJobId);
    expect(result.estimates[0].jobId).toBe(persistedJobId);
    expect(result.pmNotes[0].jobId).toBe(persistedJobId);
    expect(result.selectedJobId).toBe(persistedJobId);
    expect(result.detailJobId).toBe(persistedJobId);
    expect(result.localToPersistedJobIds.get("job-g061")).toBe(persistedJobId);
  });

  it("prefers a persisted UUID job when a local job with the same number is requested", () => {
    const persistedJobId = "50f42d9f-b53f-4a97-b711-dc8b1cd13384";
    const jobs = [
      {
        id: "job-g061",
        jobNumber: "G26-061",
        projectName: "Smoke Test"
      },
      {
        id: persistedJobId,
        jobNumber: "G26-061",
        projectName: "Smoke Test"
      }
    ] as Job[];

    const result = resolvePersistedJobForPMNote({
      jobs,
      requestedJobId: "job-g061",
      parsedJobNumber: null
    });

    expect(result.linkedJob?.id).toBe(persistedJobId);
    expect(result.persistedJob?.id).toBe(persistedJobId);
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

  it("accepts a descriptive priced change order even when the header still has the generated scope", () => {
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
        areas: [
          {
            id: "area-co",
            name: "Phase 2 Nurse Station",
            qty: 1,
            sections: [
              {
                id: "section-co",
                name: "Casework add",
                items: [
                  {
                    id: "item-co",
                    description: "Add 18 LF of PLAM uppers and solid surface countertop",
                    qty: 18,
                    unit: "LF",
                    unitCost: 325
                  }
                ]
              }
            ]
          }
        ],
        subItems: [],
        alternates: [],
        exclusions: [],
        clarifications: []
      },
      amount: 5850,
      existingChangeOrders: []
    });

    expect(warnings).toEqual([]);
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
