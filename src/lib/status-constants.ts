export const OPPORTUNITY_STATUSES = [
  "Lead / ITB",
  "Pricing",
  "Review / Send",
  "New",
  "Estimating",
  "Submitted",
  "Follow Up",
  "Cold",
  "Won",
  "Lost",
  "Archived"
] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const WIN_LOSS_VALUES = ["", "Won", "Lost"] as const;
export type WinLoss = (typeof WIN_LOSS_VALUES)[number];

export const WORK_TYPES = ["Bid / ITB", "Negotiated", "Service"] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export const CHANGE_ORDER_STATUSES = [
  "draft",
  "priced",
  "sent",
  "submitted",
  "pending",
  "approved",
  "rejected",
  "void"
] as const;

export type ChangeOrderStatus = (typeof CHANGE_ORDER_STATUSES)[number];

export const PURCHASE_ORDER_STATUSES = ["Draft", "Issued", "Acknowledged", "In Progress", "Complete", "Closed", "Void"] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const PURCHASE_ORDER_CLOSED_STATUSES = ["Complete", "Closed"] as const satisfies readonly PurchaseOrderStatus[];
export const PURCHASE_ORDER_INACTIVE_STATUSES = ["Complete", "Closed", "Void"] as const satisfies readonly PurchaseOrderStatus[];

export const SUBMITTAL_STATUSES = [
  "Not Started",
  "In Progress",
  "Submitted",
  "Approved",
  "Approved as Noted",
  "Rejected / Revise and Resubmit",
  "Resubmitted",
  "Void / Not Required"
] as const;

export type SubmittalStatus = (typeof SUBMITTAL_STATUSES)[number];

export const SUBMITTAL_READY_STATUSES = ["Approved", "Approved as Noted", "Void / Not Required"] as const satisfies readonly SubmittalStatus[];
export const SUBMITTAL_WAITING_STATUSES = ["Submitted", "Resubmitted"] as const satisfies readonly SubmittalStatus[];

export const BACKLOG_STATUSES = [
  "Awarded / Waiting",
  "Submittals",
  "Release Pending",
  "In Fabrication",
  "Ready to Install",
  "Installing",
  "Installed",
  "Closeout",
  "Complete",
  "Void"
] as const;

export type BacklogStatus = (typeof BACKLOG_STATUSES)[number];

export const BACKLOG_COMPLETE_STATUSES = ["Installed", "Complete", "Void"] as const satisfies readonly BacklogStatus[];
export const BACKLOG_NOT_STARTED_STATUSES = ["Awarded / Waiting", "Submittals", "Release Pending"] as const satisfies readonly BacklogStatus[];
