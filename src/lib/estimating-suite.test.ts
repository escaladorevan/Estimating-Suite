import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createChangeOrderEstimateFromJob, nextChangeOrderNumber, validateChangeOrderSubmission } from "./change-order-workflow";
import {
  addJobContact,
  addOpportunityContact,
  listCompanies,
  listContacts,
  loadContactsForJobs,
  loadContactsForOpportunities,
  mapCompanyFromRow,
  mapCompanyToUpsert,
  mapContactFromRow,
  mapContactToUpsert,
  mapJobContactFromRow,
  mapOpportunityContactFromRow,
  persistCarriedJobContacts,
  removeJobContact,
  removeOpportunityContact
} from "./contact-repository";
import { calculateEstimateTotals } from "./estimate-math";
import {
  loadLineItemsForEstimates,
  mapEstimateFromRow,
  mapEstimateSnapshotToInsert,
  mapEstimateToUpsert,
  saveEstimateAlternates,
  saveEstimateAreas,
  saveEstimateSubItems
} from "./estimate-repository";
import {
  buildProjectFileStoragePath,
  mapProjectFileFromRow,
  mapProjectFileToInsert,
  pruneProjectFileSlotMetadata,
  signProjectFileUrl
} from "./file-repository";
import {
  deletePMNote,
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
  applyChangeOrderStatusToJobDetail,
  applyChangeOrderToJobDetail,
  applyFileToJobDetail,
  remapCoActivityOwner,
  applyPurchaseOrderToJobDetail,
  applySubmittalToJobDetail,
  getJobDetailData,
  replaceJobDetail
} from "./job-detail-data";
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
import { reconcilePersistedEstimateIdentity } from "./estimate-persistence-reconciliation";
import { remapJobOwnedActivityForPersistence, reconcilePersistedJobIdentity, resolvePersistedJobForPMNote } from "./job-persistence-reconciliation";
import { bomComponentsToCsv } from "./takeoff-csv";
import { expandTakeoff } from "./takeoff-engine";
import { findTakeoffRule } from "./takeoff-rules";
import { pricingLibrary } from "./pricing-library";
import {
  buildAwardedOpportunityJob,
  buildOpportunityEstimate,
  buildNewOpportunity,
  filterOpportunitiesForView,
  nextOpportunityId,
  suggestJobNumber
} from "./opportunity-workflow";
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
import type { ChangeOrder, Job, ProjectFile, PurchaseOrder } from "@/types";

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

  it("loads opportunity files without losing contact joins", async () => {
    const opportunityId = "2dd51464-96d7-4ed1-ae7e-35ab2e92f865";
    const contactId = "11111111-1111-4111-8111-111111111111";
    const fileId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const mockClient = {
      from: (table: string) => ({
        select: () => ({
          eq: () =>
            table === "contacts"
              ? {
                  order: () => Promise.resolve({
                    data: [{
                      id: contactId,
                      company_id: null,
                      name: "Manny Ramirez",
                      title: "GC PM",
                      email: null,
                      phone: null,
                      mobile: null,
                      notes: null,
                      tags: [],
                      active: true
                    }],
                    error: null
                  })
                }
              : {
                  in: () => ({
                    order: () =>
                      table === "files"
                        ? Promise.resolve({
                            data: [{
                              id: fileId,
                              owner_type: "opportunity",
                              owner_id: opportunityId,
                              slot: "proposal",
                              name: "proposal.pdf",
                              storage_bucket: "project-files",
                              storage_path: "opportunity/2dd51464-96d7-4ed1-ae7e-35ab2e92f865/proposal/proposal.pdf",
                              mime_type: "application/pdf",
                              size_bytes: 2048,
                              uploaded_at: "2026-06-01T12:00:00Z"
                            }],
                            error: null
                          })
                        : Promise.resolve({ data: [], error: null })
                  })
                },
          order: () =>
            table === "opportunities"
              ? Promise.resolve({
                  data: [{
                    id: opportunityId,
                    opportunity_number: "Q-26-014",
                    work_type: "Bid / ITB",
                    month: "May",
                    client: "Andersen",
                    company_id: null,
                    project_name: "Northwest Clinic",
                    bid_due_date: "2026-06-01",
                    drawing_stage: "DD",
                    bid_type: "Budget",
                    sent_date: null,
                    submission_method: null,
                    status: "Submitted",
                    win_loss: "",
                    job_type: null,
                    estimated_value: 145000,
                    drawing_link: null,
                    specs_link: null,
                    schedule_link: null,
                    notes: null,
                    bid_feedback: null,
                    ntp_received: false,
                    initial_contract_value: null,
                    final_cost: null
                  }],
                  error: null
                })
              : Promise.resolve({ data: [], error: null }),
          in: () => ({
            order: () =>
              table === "opportunity_contacts"
                ? Promise.resolve({
                    data: [{ id: "join-1", opportunity_id: opportunityId, contact_id: contactId, role: "GC PM" }],
                    error: null
                  })
                : Promise.resolve({ data: [], error: null })
          })
        }),
        storage: undefined
      }),
      storage: {
        from: (bucket: string) => ({
          createSignedUrl: async (path: string) => ({
            data: { signedUrl: `https://example.test/${bucket}/${path}` },
            error: null
          })
        })
      }
    } as any;

    const { listOpportunities } = await import("./opportunity-repository");
    const result = await listOpportunities(mockClient);

    expect(result[0].files?.[0]).toMatchObject({
      id: fileId,
      slot: "proposal",
      name: "proposal.pdf",
      url: "https://example.test/project-files/opportunity/2dd51464-96d7-4ed1-ae7e-35ab2e92f865/proposal/proposal.pdf"
    });
    expect(result[0].contacts?.[0]).toMatchObject({
      id: "join-1",
      role: "GC PM",
      contact: { id: contactId, name: "Manny Ramirez" }
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

  it("assembles persisted area, section, item, sub item, and alternate rows into a workbook estimate tree", async () => {
    const estimateId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const areaId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const sectionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const itemId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const subItemId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const alternateId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

    const mockClient = {
      from: (table: string) => ({
        select: () => ({
          in: () => ({
            order: () =>
              Promise.resolve({
                data:
                  table === "estimate_areas"
                    ? [{ id: areaId, estimate_id: estimateId, name: "Floor 2", qty: "2", ignored: false, no_print: false, sort_order: 0 }]
                    : table === "estimate_sections"
                      ? [{ id: sectionId, area_id: areaId, name: "Uppers", ignored: true, no_print: false, sort_order: 0 }]
                      : table === "estimate_items"
                        ? [{
                            id: itemId,
                            section_id: sectionId,
                            name: "Uppers w/Doors",
                            description: "24 inch deep uppers",
                            drawing_ref: "A8.12",
                            category: "Cabs Uppers w/Doors",
                            material_type: "PLAM",
                            qty: "44.5",
                            unit: "LF",
                            unit_cost: "310.25",
                            ignored: false,
                            no_print: true,
                            sort_order: 0
                          }]
                        : table === "estimate_subcontractor_items"
                          ? [{ id: subItemId, estimate_id: estimateId, description: "Quartz install", cost: "1800", markup_pct: "12", sort_order: 0 }]
                          : table === "estimate_alternates"
                            ? [{ id: alternateId, estimate_id: estimateId, description: "Add reception feature wall", amount: "7250", sort_order: 0 }]
                            : [],
                error: null
              })
          })
        })
      })
    } as any;

    const result = await loadLineItemsForEstimates([estimateId], mockClient);
    const persisted = result.get(estimateId);

    expect(persisted?.areas[0]).toMatchObject({ id: areaId, name: "Floor 2", qty: 2 });
    expect(persisted?.areas[0].sections[0]).toMatchObject({ id: sectionId, name: "Uppers", ignored: true });
    expect(persisted?.areas[0].sections[0].items[0]).toMatchObject({
      id: itemId,
      name: "Uppers w/Doors",
      drawingRef: "A8.12",
      category: "Cabs Uppers w/Doors",
      materialType: "PLAM",
      qty: 44.5,
      unit: "LF",
      unitCost: 310.25,
      noPrint: true
    });
    expect(persisted?.subItems[0]).toMatchObject({ id: subItemId, description: "Quartz install", cost: 1800, markupPct: 12 });
    expect(persisted?.alternates[0]).toMatchObject({ id: alternateId, description: "Add reception feature wall", amount: 7250 });
  });

  it("estimate line-item write helpers are safe no-ops without Supabase", async () => {
    await expect(saveEstimateAreas("estimate-id", [], null)).resolves.toBeUndefined();
    await expect(saveEstimateSubItems("estimate-id", [], null)).resolves.toBeUndefined();
    await expect(saveEstimateAlternates("estimate-id", [], null)).resolves.toBeUndefined();
  });

  it("reconciles local workbook ids to persisted estimate ids without losing unsaved line items", () => {
    const localEstimate = {
      ...estimate,
      id: "local-estimate",
      areas: [{ id: "local-area", name: "Local area", qty: 1, sections: [] }],
      subItems: [{ description: "Local sub", cost: 100, markupPct: 10 }],
      alternates: [{ description: "Local alternate", amount: 250 }]
    };
    const persistedEstimate = {
      ...estimate,
      id: "99999999-9999-4999-8999-999999999999",
      areas: [],
      subItems: [],
      alternates: []
    };

    const result = reconcilePersistedEstimateIdentity({
      currentEstimates: [localEstimate],
      persistedEstimates: [persistedEstimate],
      activeEstimateId: "local-estimate"
    });

    expect(result.activeEstimateId).toBe("99999999-9999-4999-8999-999999999999");
    expect(result.localToPersistedEstimateIds.get("local-estimate")).toBe("99999999-9999-4999-8999-999999999999");
    expect(result.estimates[0].areas[0].name).toBe("Local area");
    expect(result.estimates[0].subItems[0].description).toBe("Local sub");
    expect(result.estimates[0].alternates[0].description).toBe("Local alternate");
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
      storageBucket: "project-files",
      storagePath: "estimate/2dd51464-96d7-4ed1-ae7e-35ab2e92f865/proposal/Proposal.pdf",
      url: undefined,
      uploadedAt: "2026-06-01T12:00:00Z"
    });
  });

  it("signs private project file URLs when storage metadata is available", async () => {
    const file = mapProjectFileFromRow({
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
    });
    const client = {
      storage: {
        from: (bucket: string) => ({
          createSignedUrl: async (path: string, expiresIn: number) => ({
            data: {
              signedUrl: `https://tapnbdorfxfdjmcwifzj.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=signed-${expiresIn}`
            },
            error: null
          })
        })
      }
    };

    await expect(signProjectFileUrl(file, client as any)).resolves.toMatchObject({
      url: "https://tapnbdorfxfdjmcwifzj.supabase.co/storage/v1/object/sign/project-files/estimate/2dd51464-96d7-4ed1-ae7e-35ab2e92f865/proposal/Proposal.pdf?token=signed-3600"
    });
  });

  it("does not invent file URLs when storage metadata is missing or signing fails", async () => {
    const withoutPath = mapProjectFileFromRow({
      id: "file-1",
      owner_type: "job",
      owner_id: "50f42d9f-b53f-4a97-b711-dc8b1cd13384",
      slot: "contract",
      name: "Contract.pdf",
      storage_bucket: "project-files",
      storage_path: null,
      mime_type: "application/pdf",
      size_bytes: 15000,
      uploaded_at: "2026-06-01T12:00:00Z"
    });
    const failingClient = {
      storage: {
        from: () => ({
          createSignedUrl: async () => ({
            data: null,
            error: new Error("private object not available")
          })
        })
      }
    };

    await expect(signProjectFileUrl(withoutPath, failingClient as any)).resolves.toMatchObject({
      name: "Contract.pdf",
      storageBucket: "project-files",
      storagePath: undefined,
      url: undefined
    });
    await expect(signProjectFileUrl({ ...withoutPath, storagePath: "job/contract.pdf" }, failingClient as any)).resolves.toMatchObject({
      name: "Contract.pdf",
      storageBucket: "project-files",
      storagePath: "job/contract.pdf",
      url: undefined
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

  it("deletes persisted PM notes and skips local-only note ids", async () => {
    const calls: unknown[] = [];
    const client = {
      from(table: string) {
        calls.push(["from", table]);
        return {
          delete() {
            calls.push(["delete"]);
            return {
              eq(column: string, value: string) {
                calls.push(["eq", column, value]);
                return Promise.resolve({ error: null });
              }
            };
          }
        };
      }
    };

    await expect(deletePMNote("note-local", client as never)).resolves.toBe(false);
    await expect(deletePMNote("a603d881-b3c0-4ffb-bb1f-a27f1584770d", client as never)).resolves.toBe(true);
    expect(calls).toEqual([
      ["from", "pm_notes"],
      ["delete"],
      ["eq", "id", "a603d881-b3c0-4ffb-bb1f-a27f1584770d"]
    ]);
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

  it("returns job-owned activity events remapped to the persisted job UUID for persistence", () => {
    const persistedJobId = "50f42d9f-b53f-4a97-b711-dc8b1cd13384";
    const events = remapJobOwnedActivityForPersistence(
      [
        {
          id: "act-job",
          ownerType: "job",
          ownerId: "job-local",
          author: "System",
          message: "Created from won opportunity Q-26-014.",
          createdAt: "2026-06-01"
        },
        {
          id: "act-submittal",
          ownerType: "submittal",
          ownerId: "sub-local",
          author: "System",
          message: "Submittal created.",
          createdAt: "2026-06-01"
        }
      ],
      "job-local",
      persistedJobId
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: "act-job", ownerType: "job", ownerId: persistedJobId });
  });
});

describe("job detail tabs", () => {
  it("keeps the PM job workspace organized into stable tabs", () => {
    expect(jobDetailTabs.map((tab) => tab.id)).toEqual(["actions", "submittals", "financials", "files", "activity"]);
  });
});

describe("job detail data boundary", () => {
  it("returns a focused job detail record with only notes for that job", () => {
    const job = {
      id: "50f42d9f-b53f-4a97-b711-dc8b1cd13384",
      jobNumber: "G26-061",
      workType: "Bid / ITB",
      pm: "Geoff",
      client: "Smoke GC",
      projectName: "Smoke Test",
      baseContract: 100000,
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
    } satisfies Job;

    const detail = getJobDetailData({
      jobs: [job],
      jobId: job.id,
      pmNotes: [
        { id: "note-one", text: "Call Manny", status: "Open", priority: "Pinned", jobId: job.id, createdAt: "2026-05-14" },
        { id: "note-two", text: "Other job", status: "Open", priority: "Normal", jobId: "job-g060", createdAt: "2026-05-14" }
      ]
    });

    expect(detail?.isPersisted).toBe(true);
    expect(detail?.notes.map((note) => note.id)).toEqual(["note-one"]);
  });

  it("replaces matching local job detail with the persisted detail payload", () => {
    const localJob = {
      id: "job-g061",
      jobNumber: "G26-061",
      workType: "Bid / ITB",
      pm: "Geoff",
      client: "Smoke GC",
      projectName: "Smoke Test",
      baseContract: 100000,
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
    } satisfies Job;
    const persistedJob = {
      ...localJob,
      id: "50f42d9f-b53f-4a97-b711-dc8b1cd13384",
      files: [{ id: "file-1", ownerType: "job", ownerId: "50f42d9f-b53f-4a97-b711-dc8b1cd13384", slot: "contract", name: "Contract.pdf", uploadedAt: "2026-05-14" }]
    } satisfies Job;

    const result = replaceJobDetail([localJob], persistedJob);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(persistedJob.id);
    expect(result[0].files).toHaveLength(1);
  });

  it("updates submittals, activity, and release backlog status through one detail helper", () => {
    const job = {
      id: "50f42d9f-b53f-4a97-b711-dc8b1cd13384",
      jobNumber: "G26-061",
      workType: "Bid / ITB",
      pm: "Geoff",
      client: "Smoke GC",
      projectName: "Smoke Test",
      baseContract: 100000,
      backlogStatus: "Submittals",
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
      submittals: [
        {
          id: "sub-shops",
          jobId: "50f42d9f-b53f-4a97-b711-dc8b1cd13384",
          name: "Shop Drawings",
          type: "Shop Drawings",
          status: "Submitted",
          revision: 1,
          dueDate: "2026-05-10",
          releaseBlocker: true
        }
      ],
      files: [],
      activity: []
    } satisfies Job;
    const updated = applySubmittalToJobDetail({
      job,
      submittal: { ...job.submittals[0], status: "Approved" },
      activity: {
        id: "act-submittal",
        ownerType: "submittal",
        ownerId: "sub-shops",
        author: "System",
        message: "Shop Drawings checklist updated.",
        createdAt: "2026-05-14"
      },
      today: "2026-05-14"
    });

    expect(updated.backlogStatus).toBe("Release Pending");
    expect(updated.submittals[0].status).toBe("Approved");
    expect(updated.activity[0]).toMatchObject({ id: "act-submittal", ownerType: "submittal" });
  });

  it("upserts purchase orders and activity through one detail helper", () => {
    const job = {
      id: "50f42d9f-b53f-4a97-b711-dc8b1cd13384",
      jobNumber: "G26-061",
      workType: "Bid / ITB",
      pm: "Geoff",
      client: "Smoke GC",
      projectName: "Smoke Test",
      baseContract: 100000,
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
    } satisfies Job;
    const purchaseOrder = {
      id: "po-local",
      jobId: job.id,
      poNumber: "PO-G26-061-001",
      vendor: "Cambria",
      scope: "Stone / Quartz",
      description: "Quartz tops",
      status: "Issued",
      committedAmount: 18000
    } satisfies PurchaseOrder;

    const created = applyPurchaseOrderToJobDetail({
      job,
      purchaseOrder,
      activity: {
        id: "act-po",
        ownerType: "purchase_order",
        ownerId: "po-local",
        author: "System",
        message: "PO-G26-061-001 added for Cambria.",
        createdAt: "2026-05-14"
      }
    });
    const updated = applyPurchaseOrderToJobDetail({
      job: created,
      purchaseOrder: { ...purchaseOrder, status: "Acknowledged", promisedDate: "2026-06-01" },
      activity: {
        id: "act-po-update",
        ownerType: "purchase_order",
        ownerId: "po-local",
        author: "System",
        message: "PO-G26-061-001 updated.",
        createdAt: "2026-05-14"
      }
    });

    expect(created.purchaseOrders).toHaveLength(1);
    expect(updated.purchaseOrders).toHaveLength(1);
    expect(updated.purchaseOrders[0]).toMatchObject({ status: "Acknowledged", promisedDate: "2026-06-01" });
    expect(updated.activity.map((event) => event.id)).toEqual(["act-po-update", "act-po"]);
  });

  it("attaches files and activity through one detail helper", () => {
    const job = {
      id: "50f42d9f-b53f-4a97-b711-dc8b1cd13384",
      jobNumber: "G26-061",
      workType: "Bid / ITB",
      pm: "Geoff",
      client: "Smoke GC",
      projectName: "Smoke Test",
      baseContract: 100000,
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
    } satisfies Job;
    const file = {
      id: "file-contract",
      ownerType: "job",
      ownerId: job.id,
      slot: "contract",
      name: "Contract.pdf",
      uploadedAt: "2026-05-14"
    } satisfies ProjectFile;
    const updated = applyFileToJobDetail({
      job,
      file,
      activity: {
        id: "act-file",
        ownerType: "job",
        ownerId: job.id,
        author: "System",
        message: "Contract.pdf attached to contract.",
        createdAt: "2026-05-14"
      }
    });

    expect(updated.files).toEqual([file]);
    expect(updated.activity[0]).toMatchObject({ id: "act-file", ownerType: "job", ownerId: job.id });
  });

  it("replaces one file slot without removing files from other owners", () => {
    const job = {
      id: "50f42d9f-b53f-4a97-b711-dc8b1cd13384",
      jobNumber: "G26-061",
      workType: "Bid / ITB",
      pm: "Geoff",
      client: "Smoke GC",
      projectName: "Smoke Test",
      baseContract: 100000,
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
      files: [
        { id: "old-contract", ownerType: "job", ownerId: "50f42d9f-b53f-4a97-b711-dc8b1cd13384", slot: "contract", name: "Old Contract.pdf", uploadedAt: "2026-05-13" },
        { id: "drawing", ownerType: "job", ownerId: "50f42d9f-b53f-4a97-b711-dc8b1cd13384", slot: "drawings", name: "Drawings.pdf", uploadedAt: "2026-05-13" },
        { id: "po-file", ownerType: "purchase_order", ownerId: "po-local", slot: "contract", name: "PO.pdf", uploadedAt: "2026-05-13" }
      ],
      activity: []
    } satisfies Job;
    const updated = applyFileToJobDetail({
      job,
      file: {
        id: "new-contract",
        ownerType: "job",
        ownerId: job.id,
        slot: "contract",
        name: "New Contract.pdf",
        uploadedAt: "2026-05-14"
      },
      activity: {
        id: "act-replace",
        ownerType: "job",
        ownerId: job.id,
        author: "System",
        message: "New Contract.pdf attached to contract.",
        createdAt: "2026-05-14"
      },
      replaceSlot: true
    });

    expect(updated.files.map((file) => file.id)).toEqual(["drawing", "po-file", "new-contract"]);
    expect(updated.activity.map((event) => event.id)).toEqual(["act-replace"]);
  });

  const baseJob: Job = {
    id: "50f42d9f-b53f-4a97-b711-dc8b1cd13384",
    jobNumber: "G26-061",
    workType: "Bid / ITB",
    pm: "Geoff",
    client: "DPR",
    projectName: "Smoke Test",
    baseContract: 100000,
    backlogStatus: "In Fabrication",
    forecastStart: "",
    forecastEnd: "",
    forecastQuarter: "",
    expectedFabStart: "",
    expectedCompletion: "",
    fabStatus: "In Fabrication",
    installStart: "",
    installEnd: "",
    installStatus: "Ready",
    invoiceStatus: "Not Billed",
    crewSize: 3,
    gc: "DPR",
    notes: "",
    changeOrders: [],
    purchaseOrders: [],
    submittals: [],
    files: [],
    activity: []
  };

  const submittedCo: ChangeOrder = {
    id: "co-local-001",
    jobId: "50f42d9f-b53f-4a97-b711-dc8b1cd13384",
    number: "CO-001",
    description: "Additional nurse station scope",
    amount: 8500,
    status: "submitted",
    dateSubmitted: "2026-05-15"
  };

  it("appends a new change order and prepends activity through the detail helper", () => {
    const activity = { id: "act-co-add", ownerType: "job" as const, ownerId: baseJob.id, author: "System", message: "CO-001 submitted from Bid Workbook for $8,500.", createdAt: "2026-05-15" };
    const updated = applyChangeOrderToJobDetail({ job: baseJob, changeOrder: submittedCo, activity });
    expect(updated.changeOrders).toHaveLength(1);
    expect(updated.changeOrders[0].number).toBe("CO-001");
    expect(updated.activity[0].id).toBe("act-co-add");
    expect(baseJob.changeOrders).toHaveLength(0);
  });

  it("approves one submitted CO, sets approvedDate, and leaves other submitted COs untouched", () => {
    const secondCo: ChangeOrder = { ...submittedCo, id: "co-local-002", number: "CO-002", amount: 3200 };
    const job = { ...baseJob, changeOrders: [submittedCo, secondCo] };
    const activity = { id: "act-co-approve", ownerType: "change_order" as const, ownerId: "co-local-001", author: "System", message: "CO-001 approved and added to current contract.", createdAt: "2026-05-15" };

    const updated = applyChangeOrderStatusToJobDetail({ job, changeOrderId: "co-local-001", status: "approved", approvedDate: "2026-05-15", activity });

    expect(updated.changeOrders.find((c) => c.id === "co-local-001")).toMatchObject({ status: "approved", approvedDate: "2026-05-15" });
    expect(updated.changeOrders.find((c) => c.id === "co-local-002")).toMatchObject({ status: "submitted" });
    expect(updated.activity[0]).toMatchObject({ ownerType: "change_order", ownerId: "co-local-001" });
  });

  it("rejecting a CO does not set approvedDate", () => {
    const job = { ...baseJob, changeOrders: [submittedCo] };
    const activity = { id: "act-co-reject", ownerType: "change_order" as const, ownerId: "co-local-001", author: "System", message: "CO-001 rejected.", createdAt: "2026-05-15" };

    const updated = applyChangeOrderStatusToJobDetail({ job, changeOrderId: "co-local-001", status: "rejected", approvedDate: undefined, activity });
    expect(updated.changeOrders[0].status).toBe("rejected");
    expect(updated.changeOrders[0].approvedDate).toBeUndefined();
  });

  it("voiding a CO does not set approvedDate", () => {
    const job = { ...baseJob, changeOrders: [submittedCo] };
    const activity = { id: "act-co-void", ownerType: "change_order" as const, ownerId: "co-local-001", author: "System", message: "CO-001 voided.", createdAt: "2026-05-15" };

    const updated = applyChangeOrderStatusToJobDetail({ job, changeOrderId: "co-local-001", status: "void", approvedDate: undefined, activity });
    expect(updated.changeOrders[0].status).toBe("void");
    expect(updated.changeOrders[0].approvedDate).toBeUndefined();
  });

  it("current contract value increases only after a CO is approved", () => {
    const job = { ...baseJob, changeOrders: [submittedCo] };
    const activity = { id: "act-co-approve2", ownerType: "change_order" as const, ownerId: "co-local-001", author: "System", message: "CO-001 approved.", createdAt: "2026-05-15" };

    expect(currentContractValue(job.baseContract, job.changeOrders)).toBe(100000);
    const approved = applyChangeOrderStatusToJobDetail({ job, changeOrderId: "co-local-001", status: "approved", approvedDate: "2026-05-15", activity });
    expect(currentContractValue(approved.baseContract, approved.changeOrders)).toBe(108500);
  });

  it("does not prepend activity when the changeOrderId is not found", () => {
    const job = { ...baseJob, changeOrders: [submittedCo] };
    const activity = { id: "act-noop", ownerType: "change_order" as const, ownerId: "co-not-here", author: "System", message: "ignored", createdAt: "2026-05-15" };
    const updated = applyChangeOrderStatusToJobDetail({ job, changeOrderId: "co-not-here", status: "approved", approvedDate: "2026-05-15", activity });
    expect(updated.activity).toHaveLength(0);
    expect(updated.changeOrders[0].status).toBe("submitted");
  });

  it("remaps CO-owned activity ownerId from local id to saved UUID", () => {
    const local = { id: "act-remap", ownerType: "change_order" as const, ownerId: "co-local-001", author: "System", message: "CO-001 approved.", createdAt: "2026-05-15" };
    const remapped = remapCoActivityOwner(local, "co-local-001", "550e8400-e29b-41d4-a716-446655440000");
    expect(remapped.ownerId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(remapped.id).toBe("act-remap");
  });

  it("does not remap job-owned activity from a workbook CO submission", () => {
    const jobActivity = { id: "act-job", ownerType: "job" as const, ownerId: "job-uuid-abc", author: "System", message: "CO-001 submitted.", createdAt: "2026-05-15" };
    const result = remapCoActivityOwner(jobActivity, "co-local-001", "550e8400-e29b-41d4-a716-446655440000");
    expect(result.ownerId).toBe("job-uuid-abc");
  });

  it("does not remap when activity ownerId does not match the local CO id", () => {
    const activity = { id: "act-other", ownerType: "change_order" as const, ownerId: "co-other-002", author: "System", message: "CO-002 rejected.", createdAt: "2026-05-15" };
    const result = remapCoActivityOwner(activity, "co-local-001", "550e8400-e29b-41d4-a716-446655440000");
    expect(result.ownerId).toBe("co-other-002");
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

describe("takeoff BOM library", () => {
  it("matches only true upper cabinet run items for the upper cabinet BOM rule", () => {
    const upperRun = pricingLibrary.find((item) => item.name === "Uppers w/Doors, 32\"-38\"h");
    const lightValence = pricingLibrary.find((item) => item.name === "Light Valence");
    const finishedEnd = pricingLibrary.find((item) => item.name === "Finished End @ Upper Cabinet");

    expect(upperRun).toBeDefined();
    expect(findTakeoffRule(upperRun!)).toMatchObject({ id: "upper-cab-plam" });
    expect(lightValence).toBeDefined();
    expect(findTakeoffRule(lightValence!)).toBeNull();
    expect(finishedEnd).toBeDefined();
    expect(findTakeoffRule(finishedEnd!)).toBeNull();
  });

  it("keeps imported pricing library ids unique even when descriptions repeat", () => {
    const ids = new Set(pricingLibrary.map((item) => item.id));
    expect(ids.size).toBe(pricingLibrary.length);

    const duplicates = pricingLibrary.filter((item) => item.name === "Angled Plam Panels w/Painted Reveals @ DW");
    expect(duplicates.length).toBeGreaterThan(1);
    expect(new Set(duplicates.map((item) => item.id)).size).toBe(duplicates.length);
    expect(new Set(duplicates.map((item) => `${item.category}:${item.unitCost}`)).size).toBeGreaterThan(1);
  });

  it("escapes quotes when exporting BOM components as CSV", () => {
    const csv = bomComponentsToCsv([
      {
        label: "MDF 3/4\" - Door Substrate",
        qty: 12.5,
        unit: "SF",
        unitCost: 0,
        totalCost: 0,
        category: "material"
      }
    ]);

    expect(csv.split("\n")[1]).toBe("\"MDF 3/4\"\" - Door Substrate\",\"12.5\",\"SF\",\"0\",\"0\",\"material\"");
  });

  it("expands an upper cabinet takeoff into a purchase BOM", () => {
    const upperRun = pricingLibrary.find((item) => item.name === "Uppers w/Doors, 32\"-38\"h");
    const rule = upperRun ? findTakeoffRule(upperRun) : null;

    expect(rule).not.toBeNull();
    const components = expandTakeoff(rule!, { heightIn: 32, depthIn: 12, bayWidthIn: 18, exposedEnds: 1 }, 10);

    expect(components.some((component) => component.label === "Blum Hinges (cups)" && component.qty > 0)).toBe(true);
    expect(components.some((component) => component.label === "PLAM - Door Faces" && component.qty > 0)).toBe(true);
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
    expect(month.days[0]).toMatchObject({ date: "2026-07-27", dayNumber: 27, inMonth: false, weekdayIndex: 1 });
    expect(month.days).toHaveLength(42);
    expect(augustFourth?.jobs.map((job) => job.jobNumber)).toEqual(["G26-051", "P26-043"]);
    expect(augustFourth?.crewTotal).toBe(7);
    expect(augustFourth?.isOverloaded).toBe(true);
  });

  it("includes adjacent-month dates only as needed to complete calendar rows", () => {
    const month = buildInstallCalendarMonth({
      month: "2026-07",
      jobs: [
        {
          id: "job-august",
          jobNumber: "G26-061",
          projectName: "August Install",
          installStart: "2026-08-03",
          installEnd: "2026-08-09",
          crewSize: 4
        }
      ]
    });

    const augustFirst = month.days.find((day) => day.date === "2026-08-01");
    expect(month.days).toHaveLength(35);
    expect(month.days[0]).toMatchObject({ date: "2026-06-29", weekdayIndex: 1, monthTag: "JUN" });
    expect(augustFirst).toMatchObject({ dayNumber: 1, inMonth: false, monthTag: "AUG" });
    expect(month.days.some((day) => day.date === "2026-08-09")).toBe(false);
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
  it("creates the next Q-year opportunity id from opportunities and bid references", () => {
    expect(
      nextOpportunityId({
        date: "2026-05-07",
        jobs: [{ bidRef: "Q-26-041" }],
        opportunities: [{ jobId: "Q-26-002" }, { jobId: "Q-25-099" }]
      })
    ).toBe("Q-26-042");
  });

  it("builds a new ITB opportunity for the register", () => {
    const opportunity = buildNewOpportunity({
      date: "2026-05-07",
      jobs: [],
      opportunities: [{ jobId: "Q-26-001" }],
      id: "local-opp"
    });

    expect(opportunity).toMatchObject({
      id: "local-opp",
      jobId: "Q-26-002",
      month: "May",
      projectName: "New ITB",
      status: "Lead / ITB",
      workType: "Bid / ITB"
    });
  });

  it("builds a linked proposal estimate from an opportunity", () => {
    const estimate = buildOpportunityEstimate({
      id: "estimate-1",
      opportunity: {
        id: "opp-1",
        jobId: "Q-26-010",
        month: "May",
        client: "Layton",
        projectName: "Hospital Lab",
        bidDueDate: "2026-05-14",
        drawingStage: "CD",
        bidType: "Invited",
        sentDate: "",
        submissionMethod: "Email",
        status: "Pricing",
        winLoss: "",
        jobType: "Healthcare",
        workType: "Bid / ITB",
        estimatedValue: 250000,
        links: {},
        notes: "",
        bidFeedback: "",
        ntpReceived: false,
        initialContractValue: null,
        finalCost: null
      }
    });

    expect(estimate).toMatchObject({
      id: "estimate-1",
      opportunityId: "opp-1",
      proposalNumber: "Q-26-010",
      projectId: "Q-26-010",
      dueDate: "2026-05-14",
      documentType: "Proposal",
      projectName: "Hospital Lab",
      client: "Layton",
      pricingMode: "byarea"
    });
    expect(estimate.clarifications).toContain("Proposal initialized from Q-26-010.");
    expect(estimate.areas[0].sections[0].items[0]).toMatchObject({ name: "Add takeoff item", unit: "LS" });
  });

  it("builds an awarded opportunity, linked job, and handoff activity", () => {
    const { awardedOpportunity, job, activity } = buildAwardedOpportunityJob({
      opportunity: {
        id: "11111111-1111-4111-8111-111111111111",
        jobId: "Q-26-010",
        month: "May",
        client: "Layton",
        projectName: "Hospital Lab",
        bidDueDate: "2026-05-14",
        drawingStage: "CD",
        bidType: "Invited",
        sentDate: "",
        submissionMethod: "Email",
        status: "Submitted",
        winLoss: "",
        jobType: "Healthcare",
        workType: "Bid / ITB",
        estimatedValue: 250000,
        links: {},
        notes: "Carry this into job notes",
        bidFeedback: "",
        ntpReceived: false,
        initialContractValue: null,
        finalCost: null,
        files: [
          {
            id: "opp-file-1",
            ownerType: "opportunity",
            ownerId: "11111111-1111-4111-8111-111111111111",
            slot: "drawings",
            name: "Drawings.pdf",
            storageBucket: "project-files",
            storagePath: "opportunity/11111111-1111-4111-8111-111111111111/drawings/Drawings.pdf",
            uploadedAt: "2026-05-20"
          }
        ],
        contacts: [{ id: "opp-contact-1", contactId: "contact-1", role: "GC PM" }]
      },
      award: {
        pm: "Geoff",
        jobNumber: "G26-044",
        contractValue: 260000,
        ntpDate: "2026-05-21"
      },
      today: "2026-05-21",
      jobId: "job-local",
      activityId: "activity-local",
      makeContactId: () => "job-contact-local"
    });

    expect(awardedOpportunity).toMatchObject({
      status: "Won",
      winLoss: "Won",
      ntpReceived: true,
      initialContractValue: 260000
    });
    expect(job).toMatchObject({
      id: "job-local",
      opportunityId: "11111111-1111-4111-8111-111111111111",
      jobNumber: "G26-044",
      bidRef: "Q-26-010",
      baseContract: 260000,
      ntpDate: "2026-05-21",
      notes: "Carry this into job notes"
    });
    expect(job.contacts?.[0]).toMatchObject({ id: "job-contact-local", contactId: "contact-1", role: "GC PM" });
    expect(job.files[0]).toMatchObject({
      id: "job-file-opp-file-1",
      ownerType: "job",
      ownerId: "job-local",
      slot: "drawings",
      name: "Drawings.pdf",
      storageBucket: "project-files",
      storagePath: "opportunity/11111111-1111-4111-8111-111111111111/drawings/Drawings.pdf"
    });
    expect(activity).toMatchObject({
      id: "activity-local",
      ownerType: "job",
      ownerId: "job-local",
      message: "Created from won opportunity Q-26-010. NTP 2026-05-21."
    });
    expect(job.activity[0]).toEqual(activity);
  });

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

describe("contact repository", () => {
  const companyRow = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Hensel Phelps",
    company_type: "GC",
    main_address: "123 Builder Way",
    billing_address: null,
    website: "https://example.com",
    phone: "555-1000",
    notes: "Healthcare work",
    tags: ["GC"],
    active: true
  };

  const contactRow = {
    id: "22222222-2222-4222-8222-222222222222",
    company_id: companyRow.id,
    name: "Pat Manager",
    title: "Project Manager",
    email: "pat@example.com",
    phone: null,
    mobile: "555-2222",
    notes: null,
    tags: ["Portland"],
    active: true
  };

  it("maps company and contact rows into the shared directory domain model", () => {
    const company = mapCompanyFromRow(companyRow);
    const contact = mapContactFromRow(contactRow, company);

    expect(company).toMatchObject({
      id: companyRow.id,
      name: "Hensel Phelps",
      companyType: "GC",
      mainAddress: "123 Builder Way",
      active: true
    });
    expect(contact).toMatchObject({
      id: contactRow.id,
      companyId: companyRow.id,
      company,
      name: "Pat Manager",
      title: "Project Manager",
      email: "pat@example.com",
      mobile: "555-2222",
      active: true
    });
    expect(contact.phone).toBeUndefined();
  });

  it("maps directory records into Supabase upserts without sending local ids", () => {
    expect(mapCompanyToUpsert({ id: "local-co", name: "Lease Crutcher Lewis", companyType: "GC", tags: [], active: true })).toMatchObject({
      id: undefined,
      name: "Lease Crutcher Lewis",
      company_type: "GC"
    });
    expect(mapContactToUpsert({ id: "local-contact", companyId: "local-company", name: "Sam Super", tags: [], active: true })).toMatchObject({
      id: undefined,
      company_id: null,
      name: "Sam Super"
    });
    expect(mapContactToUpsert({ id: contactRow.id, companyId: companyRow.id, name: "Pat Manager", tags: [], active: true })).toMatchObject({
      id: contactRow.id,
      company_id: companyRow.id
    });
  });

  it("maps job and opportunity contact joins with hydrated contacts", () => {
    const contact = mapContactFromRow(contactRow);
    expect(mapJobContactFromRow({ id: "33333333-3333-4333-8333-333333333333", job_id: "job-1", contact_id: contact.id, role: "GC PM" }, contact)).toMatchObject({
      contactId: contact.id,
      role: "GC PM",
      contact
    });
    expect(mapOpportunityContactFromRow({ id: "44444444-4444-4444-8444-444444444444", opportunity_id: "opp-1", contact_id: contact.id, role: "Estimator" }, contact)).toMatchObject({
      contactId: contact.id,
      role: "Estimator",
      contact
    });
  });

  it("lists companies and contacts through the repository", async () => {
    const mockClient = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            order: () =>
              table === "companies"
                ? Promise.resolve({ data: [companyRow], error: null })
                : Promise.resolve({ data: [contactRow], error: null })
          })
        })
      })
    };

    await expect(listCompanies(mockClient as any)).resolves.toMatchObject([{ name: "Hensel Phelps" }]);
    await expect(listContacts(mockClient as any)).resolves.toMatchObject([{ name: "Pat Manager" }]);
  });

  it("adds and removes contact joins through idempotent repository helpers", async () => {
    const calls: Array<{ table: string; payload?: unknown; onConflict?: string; deleted?: string }> = [];
    const mockClient = {
      from: (table: string) => ({
        upsert: (payload: unknown, options: { onConflict: string }) => {
          calls.push({ table, payload, onConflict: options.onConflict });
          return { select: () => ({ single: () => Promise.resolve({ data: { id: "join-1", job_id: "job-1", opportunity_id: "opp-1", contact_id: "contact-1", role: "PM" }, error: null }) }) };
        },
        delete: () => ({
          eq: (_column: string, value: string) => {
            calls.push({ table, deleted: value });
            return Promise.resolve({ error: null });
          }
        })
      })
    };

    await expect(addJobContact("job-1", "contact-1", "PM", mockClient as any)).resolves.toMatchObject({ id: "join-1", contactId: "contact-1", role: "PM" });
    await expect(addOpportunityContact("opp-1", "contact-1", "PM", mockClient as any)).resolves.toMatchObject({ id: "join-1", contactId: "contact-1", role: "PM" });
    await expect(removeJobContact("join-1", mockClient as any)).resolves.toBeUndefined();
    await expect(removeOpportunityContact("join-2", mockClient as any)).resolves.toBeUndefined();
    expect(calls.map((call) => call.table)).toEqual(["job_contacts", "opportunity_contacts", "job_contacts", "opportunity_contacts"]);
    expect(calls[0].onConflict).toBe("job_id,contact_id,role");
    expect(calls[1].onConflict).toBe("opportunity_id,contact_id,role");
  });

  it("hydrates contact joins for jobs and opportunities from a roster", async () => {
    const roster = [mapContactFromRow(contactRow)];
    const jobJoin = { id: "job-join", job_id: "job-1", contact_id: contactRow.id, role: "GC PM" };
    const oppJoin = { id: "opp-join", opportunity_id: "opp-1", contact_id: contactRow.id, role: "Bid PM" };
    const mockClient = {
      from: (table: string) => ({
        select: () => ({
          in: () => ({
            order: () =>
              table === "job_contacts"
                ? Promise.resolve({ data: [jobJoin], error: null })
                : Promise.resolve({ data: [oppJoin], error: null })
          })
        })
      })
    };

    const jobs = await loadContactsForJobs(["job-1"], roster, mockClient as any);
    const opportunities = await loadContactsForOpportunities(["opp-1"], roster, mockClient as any);

    expect(jobs.get("job-1")?.[0]).toMatchObject({ id: "job-join", role: "GC PM", contact: roster[0] });
    expect(opportunities.get("opp-1")?.[0]).toMatchObject({ id: "opp-join", role: "Bid PM", contact: roster[0] });
  });

  it("persists carried opportunity contacts to a newly created job and returns local join remaps", async () => {
    const carried = [
      { id: "carry-1", contactId: "22222222-2222-4222-8222-222222222222", role: "GC PM" },
      { id: "carry-local", contactId: "local-contact", role: "Estimator" }
    ];
    const calls: string[] = [];
    const remap = await persistCarriedJobContacts(
      "11111111-1111-4111-8111-111111111111",
      carried,
      async (_jobId, contactId, role) => {
        calls.push(`${contactId}:${role}`);
        return { id: "33333333-3333-4333-8333-333333333333", contactId, role };
      }
    );

    expect(calls).toEqual(["22222222-2222-4222-8222-222222222222:GC PM"]);
    expect(remap.get("carry-1")).toBe("33333333-3333-4333-8333-333333333333");
    expect(remap.has("carry-local")).toBe(false);
  });
});
