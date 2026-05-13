import type { ChangeOrder, ChangeOrderStatus, PurchaseOrder, PurchaseOrderScope } from "../types";

export type ChangeOrderSummary = Record<ChangeOrderStatus, number> & {
  count: number;
};

type CoLike = Pick<ChangeOrder, "amount" | "status">;
type PurchaseOrderLike = Pick<
  PurchaseOrder,
  "committedAmount" | "status" | "scope"
> & Partial<Pick<PurchaseOrder, "approvedChangeAmount" | "invoicedAmount" | "paidAmount" | "promisedDate">>;
type BacklogJobLike = {
  workType?: string;
  baseContract: number;
  changeOrders: CoLike[];
  installStatus?: string;
  backlogStatus?: string;
  forecastStart?: string;
  installStart?: string;
  invoiceStatus?: string;
};
type CostJobLike = {
  baseContract: number;
  finalCost?: number | null;
  changeOrders: CoLike[];
  purchaseOrders?: PurchaseOrderLike[];
};

export type BacklogSummary = {
  totalBacklog: number;
  wonNotStarted: number;
  activeProduction: number;
  completed: number;
  byQuarter: Record<string, number>;
};

export type ServiceWorkSummary = {
  openCount: number;
  openValue: number;
  completedValue: number;
  averageTicket: number;
  unpaidValue: number;
};

export type PurchaseOrderSummary = {
  count: number;
  committed: number;
  invoiced: number;
  paid: number;
  openCommitment: number;
  lateCount: number;
  byScope: Partial<Record<PurchaseOrderScope, number>>;
};

export type JobCostSummary = {
  revenue: number;
  finalCost: number | null;
  committedCost: number;
  projectedCost: number;
  projectedMarginPct: number | null;
};

export function summarizeChangeOrders(changeOrders: CoLike[]): ChangeOrderSummary {
  return changeOrders.reduce<ChangeOrderSummary>(
    (summary, changeOrder) => {
      summary[changeOrder.status] += changeOrder.amount;
      summary.count += 1;
      return summary;
    },
    { approved: 0, submitted: 0, rejected: 0, count: 0 }
  );
}

export function currentContractValue(baseContract: number, changeOrders: CoLike[]): number {
  return (
    baseContract +
    changeOrders
      .filter((changeOrder) => changeOrder.status === "approved")
      .reduce((sum, changeOrder) => sum + changeOrder.amount, 0)
  );
}

export function grossMarginPercent(revenue: number, finalCost?: number | null): number | null {
  if (!finalCost || revenue <= 0) return null;
  return Math.round(((revenue - finalCost) / revenue) * 1000) / 10;
}

export function summarizePurchaseOrders(purchaseOrders: PurchaseOrderLike[] = [], today?: string): PurchaseOrderSummary {
  return purchaseOrders.reduce<PurchaseOrderSummary>(
    (summary, po) => {
      if (po.status === "Void") return summary;

      const committed = po.committedAmount + (po.approvedChangeAmount ?? 0);
      const invoiced = po.invoicedAmount ?? 0;
      const paid = po.paidAmount ?? 0;

      summary.count += 1;
      summary.committed += committed;
      summary.invoiced += invoiced;
      summary.paid += paid;
      summary.openCommitment += Math.max(committed - invoiced, 0);
      summary.byScope[po.scope] = (summary.byScope[po.scope] ?? 0) + committed;

      if (today && po.promisedDate && po.promisedDate < today && !["Complete", "Closed"].includes(po.status)) {
        summary.lateCount += 1;
      }

      return summary;
    },
    { count: 0, committed: 0, invoiced: 0, paid: 0, openCommitment: 0, lateCount: 0, byScope: {} }
  );
}

export function jobCostSummary(job: CostJobLike, today?: string): JobCostSummary {
  const revenue = currentContractValue(job.baseContract, job.changeOrders);
  const poSummary = summarizePurchaseOrders(job.purchaseOrders ?? [], today);
  const finalCost = job.finalCost ?? null;
  const projectedCost = Math.max(finalCost ?? 0, poSummary.committed);

  return {
    revenue,
    finalCost,
    committedCost: poSummary.committed,
    projectedCost,
    projectedMarginPct: grossMarginPercent(revenue, projectedCost)
  };
}

export function summarizeBacklog(jobs: BacklogJobLike[]): BacklogSummary {
  return jobs.reduce<BacklogSummary>(
    (summary, job) => {
      if (job.workType === "Service") {
        return summary;
      }

      const value = currentContractValue(job.baseContract, job.changeOrders);
      const status = job.backlogStatus ?? job.installStatus ?? "";

      if (isCompleteStatus(status)) {
        summary.completed += value;
        return summary;
      }

      summary.totalBacklog += value;
      if (isNotStartedStatus(status)) {
        summary.wonNotStarted += value;
      } else {
        summary.activeProduction += value;
      }

      const quarter = quarterLabel(job.forecastStart || job.installStart);
      if (quarter) {
        summary.byQuarter[quarter] = (summary.byQuarter[quarter] ?? 0) + value;
      }

      return summary;
    },
    { totalBacklog: 0, wonNotStarted: 0, activeProduction: 0, completed: 0, byQuarter: {} }
  );
}

export function summarizeServiceWork(jobs: BacklogJobLike[]): ServiceWorkSummary {
  const serviceJobs = jobs.filter((job) => job.workType === "Service");

  return serviceJobs.reduce<ServiceWorkSummary>(
    (summary, job, _index, all) => {
      const value = currentContractValue(job.baseContract, job.changeOrders);
      const status = job.backlogStatus ?? job.installStatus ?? "";

      if (isCompleteStatus(status)) {
        summary.completedValue += value;
      } else {
        summary.openCount += 1;
        summary.openValue += value;
      }

      if (job.invoiceStatus !== "Paid") {
        summary.unpaidValue += value;
      }

      summary.averageTicket = all.length
        ? Math.round(all.reduce((sum, item) => sum + currentContractValue(item.baseContract, item.changeOrders), 0) / all.length)
        : 0;

      return summary;
    },
    { openCount: 0, openValue: 0, completedValue: 0, averageTicket: 0, unpaidValue: 0 }
  );
}

export function quarterLabel(value?: string) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.valueOf())) return "";
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `Q${quarter} ${date.getFullYear()}`;
}

function isCompleteStatus(status: string) {
  return ["Installed", "Complete", "Void"].includes(status);
}

function isNotStartedStatus(status: string) {
  return ["Awarded / Waiting", "Submittals", "Release Pending"].includes(status);
}
