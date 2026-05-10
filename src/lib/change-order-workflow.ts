import type { ChangeOrder, Estimate, Job } from "../types";
import { currentContractValue, summarizeChangeOrders } from "./job-financials";

export function nextChangeOrderNumber(changeOrders: Pick<ChangeOrder, "number">[]) {
  const highest = changeOrders.reduce((max, co) => {
    const match = co.number.match(/(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `CO-${String(highest + 1).padStart(3, "0")}`;
}

export function validateChangeOrderSubmission({
  amount,
  estimate,
  existingChangeOrders
}: {
  amount: number;
  estimate: Estimate;
  existingChangeOrders: Pick<ChangeOrder, "number">[];
}) {
  const warnings: string[] = [];
  const number = estimate.proposalNumber?.trim();
  const scope = estimate.scopeSummary?.trim().toLowerCase() ?? "";
  const genericScope = estimate.changeOrderContext
    ? `${number?.toLowerCase()} additional scope for ${estimate.changeOrderContext.projectName.toLowerCase()}`
    : `${number?.toLowerCase()} additional scope for ${estimate.projectName.toLowerCase()}`;

  if (amount <= 0) warnings.push("This change order total is $0.");
  if (!scope || scope === genericScope || scope === "additional scope") warnings.push("The scope summary is still generic.");
  if (number && existingChangeOrders.some((co) => co.number.toLowerCase() === number.toLowerCase())) {
    warnings.push(`${number} already exists on this job.`);
  }

  return warnings;
}

export function createChangeOrderEstimateFromJob(job: Job, date: string): Estimate {
  const coSummary = summarizeChangeOrders(job.changeOrders);
  const coNumber = nextChangeOrderNumber(job.changeOrders);

  return {
    id: `est-${job.jobNumber.toLowerCase()}-${coNumber.toLowerCase()}-${Date.now()}`,
    jobId: job.id,
    documentType: "Change Order",
    proposalNumber: coNumber,
    revision: "0",
    projectName: job.projectName,
    client: job.gc || job.client,
    estimator: job.pm,
    bidDate: date,
    projectId: job.jobNumber,
    scopeSummary: `${coNumber} additional scope for ${job.projectName}`,
    pricingMode: "byarea",
    ohPct: 12,
    delPct: 3,
    insPct: 8,
    changeOrderContext: {
      sourceJobId: job.id,
      jobNumber: job.jobNumber,
      projectName: job.projectName,
      baseContract: job.baseContract,
      approvedCoTotal: coSummary.approved,
      pendingCoTotal: coSummary.submitted,
      currentContract: currentContractValue(job.baseContract, job.changeOrders)
    },
    areas: [
      {
        id: `area-${Date.now()}`,
        name: "Change Order Scope",
        qty: 1,
        sections: [
          {
            id: `section-${Date.now()}`,
            name: "Added scope",
            items: []
          }
        ]
      }
    ],
    subItems: [],
    alternates: [],
    exclusions: ["Work not specifically listed above is excluded."],
    clarifications: ["This change order is priced as an additive change to the current contract value."]
  };
}
