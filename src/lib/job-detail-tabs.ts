export type JobDetailTabId = "actions" | "submittals" | "financials" | "files" | "activity";

export const jobDetailTabs: Array<{ id: JobDetailTabId; label: string }> = [
  { id: "actions", label: "Actions / Notes" },
  { id: "submittals", label: "Submittals" },
  { id: "financials", label: "Financials" },
  { id: "files", label: "Files" },
  { id: "activity", label: "Activity" }
];
