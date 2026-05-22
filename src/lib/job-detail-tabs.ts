export type JobDetailTabId =
  | "overview"
  | "schedule"
  | "submittals"
  | "change-orders"
  | "purchase-orders"
  | "files"
  | "notes"
  | "activity";

export type JobDetailTab = {
  id: JobDetailTabId;
  code: string;
  label: string;
};

export const jobDetailTabs: JobDetailTab[] = [
  { id: "overview", code: "00", label: "Overview" },
  { id: "schedule", code: "10", label: "Schedule" },
  { id: "submittals", code: "20", label: "Submittals" },
  { id: "change-orders", code: "30", label: "COs" },
  { id: "purchase-orders", code: "40", label: "POs" },
  { id: "files", code: "50", label: "Files" },
  { id: "notes", code: "60", label: "Notes" },
  { id: "activity", code: "70", label: "Activity" }
];
