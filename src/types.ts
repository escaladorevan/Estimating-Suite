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

export type CompanyType = "GC" | "Architect" | "Owner" | "Supplier" | "Subcontractor" | "Vendor" | "Consultant" | "Other";

export type ContactRole =
  | "GC"
  | "Owner"
  | "Architect"
  | "Engineer"
  | "PM"
  | "Estimator"
  | "Superintendent"
  | "Vendor"
  | "Subcontractor"
  | "Other";

export type Company = {
  id: string;
  name: string;
  companyType: CompanyType;
  mainAddress?: string;
  billingAddress?: string;
  website?: string;
  phone?: string;
  notes?: string;
  tags: string[];
  active: boolean;
};

export type Contact = {
  id: string;
  companyId?: string;
  company?: Company;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  notes?: string;
  tags: string[];
  active: boolean;
};

export type ProjectContact = {
  id: string;
  contactId: string;
  contact?: Contact;
  role: string;
};

export type Opportunity = {
  id: string;
  jobId: string;
  companyId?: string;
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
  contacts?: ProjectContact[];
};

export type TakeoffParam = {
  key: string;
  label: string;
  inputType: "number" | "integer";
  default: number;
  min: number;
  max: number;
};

export type TakeoffComponentDef = {
  label: string;
  unit: string;
  category: "hardware" | "material" | "labor";
  formula: string;
  unitCost: number;
};

export type TakeoffRule = {
  id: string;
  name: string;
  matchCategoryFragment: string;
  matchesItem?: (item: { category: string; name: string; description: string; unit: string }) => boolean;
  params: TakeoffParam[];
  derivedVars: Record<string, string>;
  components: TakeoffComponentDef[];
};

export type BOMComponent = {
  label: string;
  unit: string;
  qty: number;
  unitCost: number;
  totalCost: number;
  category: "hardware" | "material" | "labor";
};

export type TakeoffExpansion = {
  ruleId: string;
  ruleName: string;
  paramValues: Record<string, number>;
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
  takeoffExpansion?: TakeoffExpansion;
  sortOrder?: number;
};

export type EstimateSection = {
  id?: string;
  name?: string;
  ignored?: boolean;
  noPrint?: boolean;
  items: EstimateItem[];
  sortOrder?: number;
};

export type EstimateArea = {
  id?: string;
  name?: string;
  qty: number;
  ignored?: boolean;
  noPrint?: boolean;
  sections: EstimateSection[];
  sortOrder?: number;
};

export type SubcontractorItem = {
  id?: string;
  description?: string;
  cost: number;
  markupPct: number;
  sortOrder?: number;
};

export type EstimateAlternate = {
  id?: string;
  description: string;
  amount: number;
  sortOrder?: number;
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
  alternates: EstimateAlternate[];
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
  storageBucket?: string;
  storagePath?: string;
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

export type AppRole = "admin" | "estimator" | "pm" | "viewer" | "accounting";

export type AppUserProfile = {
  id: string;
  fullName: string | null;
  role: AppRole;
  active: boolean;
};

export type Job = {
  id: string;
  opportunityId?: string;
  companyId?: string;
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
  contacts?: ProjectContact[];
  activity: ActivityEvent[];
};

export type ActivityEvent = {
  id: string;
  ownerType: "opportunity" | "estimate" | "job" | "change_order" | "submittal" | "purchase_order";
  ownerId: string;
  author: string;
  message: string;
  createdAt: string;
};
