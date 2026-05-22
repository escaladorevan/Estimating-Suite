import type {
  ChangeOrderStatus,
  Contact,
  Job,
  PMNote,
  ProjectFile,
  PurchaseOrder,
  PurchaseOrderScope,
  PurchaseOrderStatus,
  SubmittalPackage
} from "@/types";
import type { SubmittalAction, UpdateSubmittalInput, setSubmittalChecklistState } from "@/lib/submittals";

export type JobDetailPageProps = {
  job: Job;
  pmNotes: PMNote[];
  contacts: Contact[];
  canEditHeader?: boolean;
  onBackToJobs: () => void;
  onApproveCos: (id: string) => void;
  onUpdateCoStatus: (jobId: string, coId: string, status: ChangeOrderStatus) => void;
  onCreatePurchaseOrder: (jobId: string, input: Omit<PurchaseOrder, "id" | "jobId">) => void;
  onCreatePmNote: (text: string, jobId?: string) => void;
  onCreateSubmittal: (jobId: string, input: Omit<SubmittalPackage, "id" | "jobId" | "status" | "revision">) => void;
  onEditPurchaseOrder: (jobId: string, poId: string, updates: Partial<PurchaseOrder>) => void;
  onEditSubmittal: (jobId: string, submittalId: string, updates: UpdateSubmittalInput) => void;
  onJobFile: (jobId: string, slot: string, file: File | undefined) => void;
  onPurchaseOrderFile: (jobId: string, poId: string, file: File | undefined) => void;
  onStartChangeOrder: (jobId: string) => void;
  onUpdateJob: (jobId: string, updates: Partial<Job>) => void;
  onDeletePmNote: (noteId: string) => void;
  onUpdatePmNoteStatus: (noteId: string, status: PMNote["status"]) => void;
  onUpdatePmNoteText: (noteId: string, text: string) => void;
  onSubmittalChecklist: (jobId: string, submittalId: string, updates: Parameters<typeof setSubmittalChecklistState>[1]) => void;
  onSubmittalFile: (jobId: string, submittalId: string, file: File | undefined) => void;
  onSubmittalAction: (jobId: string, submittalId: string, action: SubmittalAction) => void;
  onAddContact: (jobId: string, contactId: string) => void;
  onRemoveContact: (jobId: string, joinId: string) => void;
};

export type PurchaseOrderDraft = {
  poNumber: string;
  vendor: string;
  scope: PurchaseOrderScope;
  description: string;
  status: PurchaseOrderStatus;
  committedAmount: string;
  neededBy: string;
  promisedDate: string;
  owner: string;
  notes: string;
};

export type SubmittalDraft = {
  name: string;
  type: SubmittalPackage["type"];
  dueDate: string;
  owner: string;
  releaseBlocker: boolean;
  notes: string;
};
