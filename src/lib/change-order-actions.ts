import type { ChangeOrderStatus } from "@/types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function changeOrderNextStatuses(status: ChangeOrderStatus): ChangeOrderStatus[] {
  if (status === "draft") return ["priced", "void"];
  if (status === "priced") return ["sent", "submitted", "void"];
  if (status === "sent") return ["submitted", "pending", "void"];
  if (status === "submitted" || status === "pending") return ["approved", "rejected", "void"];
  if (status === "approved") return ["void"];
  return ["draft"];
}

export function changeOrderActionLabel(status: ChangeOrderStatus): string {
  return {
    approved: "Approve",
    draft: "Reopen",
    pending: "Mark pending",
    priced: "Mark priced",
    rejected: "Reject",
    sent: "Mark sent",
    submitted: "Submit",
    void: "Void"
  }[status];
}

export function changeOrderContractImpactLabel(co: { amount: number; status: ChangeOrderStatus }): string {
  if (co.status === "approved") return `Adds ${money.format(co.amount)} to current contract`;
  if (co.status === "submitted" || co.status === "pending" || co.status === "sent" || co.status === "priced") {
    return `${money.format(co.amount)} exposure until approved`;
  }
  return "No contract impact";
}
