import type {
  BacklogStatus,
  ChangeOrderStatus,
  OpportunityStatus,
  PurchaseOrderStatus,
  SubmittalStatus,
  WinLoss,
  WorkType
} from "./lib/status-constants";

export type { BacklogStatus, ChangeOrderStatus, OpportunityStatus, PurchaseOrderStatus, SubmittalStatus, WinLoss, WorkType };

export type EstimateDocumentType = "Proposal" | "Quote" | "Budget" | "Change Order" | "Service Quote" | "Revision";

export type Opportunity = {
  id: string;
  jobId: string;
  month: string;
  client: string;
  projectName: string;
  bidDueDate: string;
  drawingStage: string;
  bidType: string;
  sentDate: string;
  submissionMethod: string;
  status: OpportunityStatus;
  winLoss: WinLoss;
  jobType: string;
  workType?: WorkType;
  estimatedValue: number;
  links: {
    drawings?: string;
    specs?: string;
    schedule?: string;
  };
  notes: string;
  bidFeedback: string;
  ntpReceived: boolean;
  initialContractValue: number | null;
  finalCost: number | null;
  files?: ProjectFile[];
};

export type EstimateItem = {
  id?: string;
  name?: string;
  description?: string;
  drawingRef?: string;
  category?: string;
  materialType?: string;
  qty: number;
  unit?: string;
  unitCost: number;
  ignored?: boolean;
  noPrint?: boolean;
};

export type EstimateSection = {
  id?: string;
  name?: string;
  ignored?: boolean;
  noPrint?: boolean;
  items: EstimateItem[];
};

export type EstimateArea = {
  id?: string;
  name?: string;
  qty: number;
  ignored?: boolean;
  noPrint?: boolean;
  sections: EstimateSection[];
};

export type SubcontractorItem = {
  description?: string;
  cost: number;
  markupPct: number;
};

export type Estimate = {
  id: string;
  opportunityId?: string;
  jobId?: string;
  documentType?: EstimateDocumentType;
  changeOrderContext?: {
    sourceJobId: string;
    jobNumber: string;
    projectName: string;
    baseContract: number;
    approvedCoTotal: number;
    pendingCoTotal: number;
    currentContract: number;
  };
  proposalNumber?: string;
  revision?: string;
  projectName: string;
  projectLocation?: string;
  client: string;
  clientAddress?: string;
  clientContact?: string;
  architect?: string;
  estimator?: string;
  bidDate?: string;
  dueDate?: string;
  deliveryDate?: string;
  shipVia?: string;
  poNumber?: string;
  projectId?: string;
  bidDocuments?: string;
  drawingsDated?: string;
  addenda?: string;
  scopeSummary?: string;
  validDays?: number;
  paymentTerms?: string;
  leadTime?: string;
  pricingMode: "lumpsum" | "byarea" | "itemized";
  ohPct: number;
  delPct: number;
  insPct: number;
  areas: EstimateArea[];
  subItems: SubcontractorItem[];
  alternates: { description: string; amount: number }[];
  exclusions: string[];
  clarifications: string[];
};

export type EstimateTotals = {
  material: number;
  overhead: number;
  delivery: number;
  install: number;
  subcontractorCost: number;
  subcontractorMarkup: number;
  subcontractorSell: number;
  bidTotal: number;
};

export type PurchaseOrderScope =
  | "Stone / Quartz"
  | "Cambria"
  | "Solid Surface"
  | "Glass"
  | "Metal"
  | "Install Labor"
  | "Other";

export type ChangeOrder = {
  id: string;
  jobId: string;
  number: string;
  description: string;
  amount: number;
  status: ChangeOrderStatus;
  dateSubmitted: string;
  approvedDate?: string;
  notes?: string;
};

export type PurchaseOrder = {
  id: string;
  jobId: string;
  poNumber: string;
  vendor: string;
  scope: PurchaseOrderScope;
  description: string;
  status: PurchaseOrderStatus;
  committedAmount: number;
  approvedChangeAmount?: number;
  invoicedAmount?: number;
  paidAmount?: number;
  issueDate?: string;
  neededBy?: string;
  promisedDate?: string;
  receivedDate?: string;
  owner?: string;
  notes?: string;
};

export type SubmittalPackage = {
  id: string;
  jobId: string;
  name: string;
  type: "Shop Drawings" | "Finish Samples" | "Hardware" | "Engineering" | "Other";
  status: SubmittalStatus;
  revision: number;
  dueDate?: string;
  submittedDate?: string;
  returnedDate?: string;
  owner?: string;
  releaseBlocker: boolean;
  notes?: string;
};

export type ProjectFile = {
  id: string;
  ownerType: "opportunity" | "estimate" | "job" | "change_order" | "submittal" | "purchase_order";
  ownerId: string;
  slot: string;
  name: string;
  url?: string;
  uploadedAt: string;
};

export type PMNoteStatus = "Open" | "Waiting" | "Done";
export type PMNotePriority = "Normal" | "Pinned";

export type PMNote = {
  id: string;
  text: string;
  status: PMNoteStatus;
  priority: PMNotePriority;
  jobId?: string;
  dueDate?: string;
  createdAt: string;
  completedAt?: string;
};

export type Job = {
  id: string;
  jobNumber: string;
  workType?: WorkType;
  pm: string;
  client: string;
  projectName: string;
  baseContract: number;
  bidRef?: string;
  awardDate?: string;
  ntpDate?: string;
  backlogStatus: BacklogStatus;
  forecastStart?: string;
  forecastEnd?: string;
  forecastQuarter?: string;
  expectedFabStart?: string;
  expectedCompletion?: string;
  fabStatus: "Not Started" | "In Fabrication" | "Ready" | "Complete";
  installStart: string;
  installEnd: string;
  installStatus: "Ready" | "Active" | "Completed" | "Installed" | "Void";
  invoiceStatus: "Not Billed" | "Partial" | "Billed" | "Paid";
  crewSize: number;
  gc: string;
  serviceScope?: string;
  requestedDate?: string;
  scheduledDate?: string;
  assignedTo?: string;
  notes: string;
  finalCost?: number;
  changeOrders: ChangeOrder[];
  purchaseOrders: PurchaseOrder[];
  submittals: SubmittalPackage[];
  files: ProjectFile[];
  activity: ActivityEvent[];
};

export type ActivityEvent = {
  id: string;
  ownerType: "opportunity" | "estimate" | "job" | "submittal" | "purchase_order";
  ownerId: string;
  author: string;
  message: string;
  createdAt: string;
};
