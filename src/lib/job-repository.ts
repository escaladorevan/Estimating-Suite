import type {
  ActivityEvent,
  BacklogStatus,
  ChangeOrder,
  ChangeOrderStatus,
  Job,
  PMNote,
  PMNotePriority,
  PMNoteStatus,
  PurchaseOrder,
  PurchaseOrderScope,
  PurchaseOrderStatus,
  SubmittalPackage,
  SubmittalStatus,
  WorkType
} from "@/types";
import { supabase } from "./supabase-client";
import { mapProjectFileFromRow, type ProjectFileRow } from "./file-repository";
import {
  BACKLOG_STATUSES,
  CHANGE_ORDER_STATUSES,
  PURCHASE_ORDER_STATUSES,
  SUBMITTAL_STATUSES,
  WORK_TYPES
} from "./status-constants";

type FabStatus = Job["fabStatus"];
type InstallStatus = Job["installStatus"];
type InvoiceStatus = Job["invoiceStatus"];
type SubmittalType = SubmittalPackage["type"];
type ActivityOwnerType = ActivityEvent["ownerType"];

export type JobRow = {
  id: string;
  opportunity_id: string | null;
  job_number: string | null;
  work_type: WorkType | string | null;
  pm: string | null;
  client: string | null;
  project_name: string | null;
  base_contract: number | string | null;
  bid_ref: string | null;
  award_date: string | null;
  ntp_date: string | null;
  backlog_status: BacklogStatus | string | null;
  forecast_start: string | null;
  forecast_end: string | null;
  forecast_quarter: string | null;
  expected_fab_start: string | null;
  expected_completion: string | null;
  fab_status: FabStatus | string | null;
  install_start: string | null;
  install_end: string | null;
  install_status: InstallStatus | string | null;
  invoice_status: InvoiceStatus | string | null;
  crew_size: number | string | null;
  gc: string | null;
  service_scope: string | null;
  requested_date: string | null;
  scheduled_date: string | null;
  assigned_to: string | null;
  notes: string | null;
  final_cost: number | string | null;
};

export type JobUpsert = {
  id?: string;
  opportunity_id: string | null;
  job_number: string;
  work_type: WorkType;
  pm: string | null;
  client: string;
  project_name: string;
  base_contract: number;
  bid_ref: string | null;
  award_date: string | null;
  ntp_date: string | null;
  backlog_status: BacklogStatus;
  forecast_start: string | null;
  forecast_end: string | null;
  forecast_quarter: string | null;
  expected_fab_start: string | null;
  expected_completion: string | null;
  fab_status: FabStatus;
  install_start: string | null;
  install_end: string | null;
  install_status: InstallStatus;
  invoice_status: InvoiceStatus;
  crew_size: number;
  gc: string | null;
  service_scope: string | null;
  requested_date: string | null;
  scheduled_date: string | null;
  assigned_to: string | null;
  notes: string | null;
  final_cost: number | null;
};

export type ChangeOrderRow = {
  id: string;
  job_id: string | null;
  estimate_id: string | null;
  number: string | null;
  description: string | null;
  amount: number | string | null;
  status: ChangeOrderStatus | string | null;
  date_submitted: string | null;
  approved_date: string | null;
  gc_reference: string | null;
  notes: string | null;
};

export type ChangeOrderWrite = {
  id?: string;
  job_id: string | null;
  estimate_id?: string | null;
  number: string;
  description: string;
  amount: number;
  status: ChangeOrderStatus;
  date_submitted: string | null;
  approved_date: string | null;
  notes: string | null;
};

export type PurchaseOrderRow = {
  id: string;
  job_id: string | null;
  po_number: string | null;
  vendor: string | null;
  scope: PurchaseOrderScope | string | null;
  description: string | null;
  status: PurchaseOrderStatus | string | null;
  committed_amount: number | string | null;
  approved_change_amount: number | string | null;
  invoiced_amount: number | string | null;
  paid_amount: number | string | null;
  issue_date: string | null;
  needed_by: string | null;
  promised_date: string | null;
  received_date: string | null;
  owner: string | null;
  notes: string | null;
};

export type PurchaseOrderWrite = {
  id?: string;
  job_id: string | null;
  po_number: string;
  vendor: string;
  scope: PurchaseOrderScope;
  description: string | null;
  status: PurchaseOrderStatus;
  committed_amount: number;
  approved_change_amount: number;
  invoiced_amount: number;
  paid_amount: number;
  issue_date: string | null;
  needed_by: string | null;
  promised_date: string | null;
  received_date: string | null;
  owner: string | null;
  notes: string | null;
};

export type SubmittalRow = {
  id: string;
  job_id: string | null;
  name: string | null;
  type: SubmittalType | string | null;
  status: SubmittalStatus | string | null;
  revision: number | string | null;
  due_date: string | null;
  submitted_date: string | null;
  returned_date: string | null;
  owner: string | null;
  release_blocker: boolean | null;
  notes: string | null;
};

export type SubmittalWrite = {
  id?: string;
  job_id: string | null;
  name: string;
  type: SubmittalType;
  status: SubmittalStatus;
  revision: number;
  due_date: string | null;
  submitted_date: string | null;
  returned_date: string | null;
  owner: string | null;
  release_blocker: boolean;
  notes: string | null;
};

export type PMNoteRow = {
  id: string;
  text: string | null;
  status: PMNoteStatus | string | null;
  priority: PMNotePriority | string | null;
  job_id: string | null;
  due_date: string | null;
  created_at: string | null;
  completed_at: string | null;
};

export type PMNoteWrite = {
  id?: string;
  text: string;
  status: PMNoteStatus;
  priority: PMNotePriority;
  job_id: string | null;
  due_date: string | null;
  completed_at: string | null;
};

export type PMNoteInsert = PMNoteWrite & {
  created_at?: string;
};

export type ActivityEventRow = {
  id: string;
  owner_type: ActivityOwnerType | string;
  owner_id: string | null;
  author: string | null;
  message: string | null;
  created_at: string | null;
};

export type ActivityEventInsert = {
  id?: string;
  owner_type: ActivityOwnerType;
  owner_id: string;
  author: string | null;
  message: string;
  created_at?: string;
};

type SupabaseJobClient = {
  from: (table: "jobs" | "change_orders" | "purchase_orders" | "submittals" | "files" | "pm_notes" | "activity_events") => any;
};

export function mapJobFromRow(
  row: JobRow,
  children: Partial<Pick<Job, "changeOrders" | "purchaseOrders" | "submittals" | "files" | "activity">> = {}
): Job {
  return {
    id: row.id,
    opportunityId: row.opportunity_id ?? undefined,
    jobNumber: row.job_number ?? "",
    workType: normalizeWorkType(row.work_type),
    pm: row.pm ?? "",
    client: row.client ?? "",
    projectName: row.project_name ?? "",
    baseContract: toNumber(row.base_contract),
    bidRef: row.bid_ref ?? "",
    awardDate: row.award_date ?? "",
    ntpDate: row.ntp_date ?? "",
    backlogStatus: normalizeBacklogStatus(row.backlog_status),
    forecastStart: row.forecast_start ?? "",
    forecastEnd: row.forecast_end ?? "",
    forecastQuarter: row.forecast_quarter ?? "",
    expectedFabStart: row.expected_fab_start ?? "",
    expectedCompletion: row.expected_completion ?? "",
    fabStatus: normalizeFabStatus(row.fab_status),
    installStart: row.install_start ?? "",
    installEnd: row.install_end ?? "",
    installStatus: normalizeInstallStatus(row.install_status),
    invoiceStatus: normalizeInvoiceStatus(row.invoice_status),
    crewSize: toNumber(row.crew_size),
    gc: row.gc ?? "",
    serviceScope: row.service_scope ?? "",
    requestedDate: row.requested_date ?? "",
    scheduledDate: row.scheduled_date ?? "",
    assignedTo: row.assigned_to ?? "",
    notes: row.notes ?? "",
    finalCost: toNullableNumber(row.final_cost) ?? undefined,
    changeOrders: children.changeOrders ?? [],
    purchaseOrders: children.purchaseOrders ?? [],
    submittals: children.submittals ?? [],
    files: children.files ?? [],
    activity: children.activity ?? []
  };
}

export function mapJobToUpsert(job: Job): JobUpsert {
  return {
    id: isUuid(job.id) ? job.id : undefined,
    opportunity_id: nullableUuid(job.opportunityId),
    job_number: job.jobNumber,
    work_type: job.workType ?? "Bid / ITB",
    pm: nullableText(job.pm),
    client: job.client,
    project_name: job.projectName,
    base_contract: job.baseContract,
    bid_ref: nullableText(job.bidRef),
    award_date: nullableText(job.awardDate),
    ntp_date: nullableText(job.ntpDate),
    backlog_status: job.backlogStatus,
    forecast_start: nullableText(job.forecastStart),
    forecast_end: nullableText(job.forecastEnd),
    forecast_quarter: nullableText(job.forecastQuarter),
    expected_fab_start: nullableText(job.expectedFabStart),
    expected_completion: nullableText(job.expectedCompletion),
    fab_status: job.fabStatus,
    install_start: nullableText(job.installStart),
    install_end: nullableText(job.installEnd),
    install_status: job.installStatus,
    invoice_status: job.invoiceStatus,
    crew_size: job.crewSize,
    gc: nullableText(job.gc),
    service_scope: nullableText(job.serviceScope),
    requested_date: nullableText(job.requestedDate),
    scheduled_date: nullableText(job.scheduledDate),
    assigned_to: nullableText(job.assignedTo),
    notes: nullableText(job.notes),
    final_cost: toNullableNumber(job.finalCost)
  };
}

export function mapChangeOrderFromRow(row: ChangeOrderRow): ChangeOrder {
  return {
    id: row.id,
    jobId: row.job_id ?? "",
    number: row.number ?? "",
    description: row.description ?? "",
    amount: toNumber(row.amount),
    status: normalizeChangeOrderStatus(row.status),
    dateSubmitted: row.date_submitted ?? "",
    approvedDate: row.approved_date ?? "",
    notes: row.notes ?? ""
  };
}

export function mapChangeOrderToInsert(changeOrder: ChangeOrder & { estimateId?: string }): ChangeOrderWrite {
  return mapChangeOrderToWrite(changeOrder);
}

export function mapChangeOrderToUpdate(changeOrder: ChangeOrder & { estimateId?: string }): ChangeOrderWrite {
  return mapChangeOrderToWrite(changeOrder);
}

export function mapPurchaseOrderFromRow(row: PurchaseOrderRow): PurchaseOrder {
  return {
    id: row.id,
    jobId: row.job_id ?? "",
    poNumber: row.po_number ?? "",
    vendor: row.vendor ?? "",
    scope: normalizePurchaseOrderScope(row.scope),
    description: row.description ?? "",
    status: normalizePurchaseOrderStatus(row.status),
    committedAmount: toNumber(row.committed_amount),
    approvedChangeAmount: toNumber(row.approved_change_amount),
    invoicedAmount: toNumber(row.invoiced_amount),
    paidAmount: toNumber(row.paid_amount),
    issueDate: row.issue_date ?? "",
    neededBy: row.needed_by ?? "",
    promisedDate: row.promised_date ?? "",
    receivedDate: row.received_date ?? "",
    owner: row.owner ?? "",
    notes: row.notes ?? ""
  };
}

export function mapPurchaseOrderToInsert(purchaseOrder: PurchaseOrder): PurchaseOrderWrite {
  return mapPurchaseOrderToWrite(purchaseOrder);
}

export function mapPurchaseOrderToUpdate(purchaseOrder: PurchaseOrder): PurchaseOrderWrite {
  return mapPurchaseOrderToWrite(purchaseOrder);
}

export function mapSubmittalFromRow(row: SubmittalRow): SubmittalPackage {
  return {
    id: row.id,
    jobId: row.job_id ?? "",
    name: row.name ?? "",
    type: normalizeSubmittalType(row.type),
    status: normalizeSubmittalStatus(row.status),
    revision: toNumber(row.revision),
    dueDate: row.due_date ?? "",
    submittedDate: row.submitted_date ?? "",
    returnedDate: row.returned_date ?? "",
    owner: row.owner ?? "",
    releaseBlocker: Boolean(row.release_blocker),
    notes: row.notes ?? ""
  };
}

export function mapSubmittalToInsert(submittal: SubmittalPackage): SubmittalWrite {
  return mapSubmittalToWrite(submittal);
}

export function mapSubmittalToUpdate(submittal: SubmittalPackage): SubmittalWrite {
  return mapSubmittalToWrite(submittal);
}

export function mapPMNoteFromRow(row: PMNoteRow): PMNote {
  return {
    id: row.id,
    text: row.text ?? "",
    status: normalizePMNoteStatus(row.status),
    priority: normalizePMNotePriority(row.priority),
    jobId: row.job_id ?? undefined,
    dueDate: row.due_date ?? "",
    createdAt: row.created_at ?? "",
    completedAt: row.completed_at ?? ""
  };
}

export function mapPMNoteToInsert(note: PMNote): PMNoteInsert {
  return {
    ...mapPMNoteToWrite(note),
    created_at: nullableText(note.createdAt) ?? undefined
  };
}

export function mapPMNoteToUpdate(note: PMNote): PMNoteWrite {
  return mapPMNoteToWrite(note);
}

export function mapActivityEventFromRow(row: ActivityEventRow): ActivityEvent {
  return {
    id: row.id,
    ownerType: normalizeActivityOwnerType(row.owner_type),
    ownerId: row.owner_id ?? "",
    author: row.author ?? "",
    message: row.message ?? "",
    createdAt: row.created_at ?? ""
  };
}

export function mapActivityEventToInsert(event: ActivityEvent): ActivityEventInsert {
  const ownerId = requiredUuid(event.ownerId, "Activity event metadata requires a persisted UUID owner id.");
  return {
    id: isUuid(event.id) ? event.id : undefined,
    owner_type: event.ownerType,
    owner_id: ownerId,
    author: nullableText(event.author),
    message: event.message,
    created_at: nullableText(event.createdAt) ?? undefined
  };
}

export async function listJobs(client: SupabaseJobClient | null = supabase) {
  if (!client) return [];

  const { data: jobRows, error: jobsError } = await client.from("jobs").select("*").order("job_number", { ascending: true });
  if (jobsError) throw jobsError;

  const jobs = (jobRows ?? []) as JobRow[];
  const jobIds = jobs.map((job) => job.id).filter(isUuid);
  if (!jobIds.length) return jobs.map((job) => mapJobFromRow(job));

  const [{ data: coRows, error: coError }, { data: poRows, error: poError }, { data: subRows, error: subError }] =
    await Promise.all([
      client.from("change_orders").select("*").in("job_id", jobIds).order("number", { ascending: true }),
      client.from("purchase_orders").select("*").in("job_id", jobIds).order("po_number", { ascending: true }),
      client.from("submittals").select("*").in("job_id", jobIds).order("due_date", { ascending: true })
    ]);

  for (const error of [coError, poError, subError]) {
    if (error) throw error;
  }

  const changeOrders = (coRows ?? []) as ChangeOrderRow[];
  const purchaseOrders = (poRows ?? []) as PurchaseOrderRow[];
  const submittals = (subRows ?? []) as SubmittalRow[];
  const relatedOwnerIds = uniqueIds([
    ...jobIds,
    ...changeOrders.map((row) => row.id),
    ...purchaseOrders.map((row) => row.id),
    ...submittals.map((row) => row.id)
  ]);

  const [{ data: fileRows, error: fileError }, { data: activityRows, error: activityError }] = await Promise.all([
    client.from("files").select("*").in("owner_id", relatedOwnerIds).order("uploaded_at", { ascending: false }),
    client.from("activity_events").select("*").in("owner_id", relatedOwnerIds).order("created_at", { ascending: false })
  ]);

  for (const error of [fileError, activityError]) {
    if (error) throw error;
  }

  return jobs.map((job) =>
    {
      const jobChangeOrders = changeOrders.filter((row) => row.job_id === job.id);
      const jobPurchaseOrders = purchaseOrders.filter((row) => row.job_id === job.id);
      const jobSubmittals = submittals.filter((row) => row.job_id === job.id);
      const jobOwnerIds = new Set([
        job.id,
        ...jobChangeOrders.map((row) => row.id),
        ...jobPurchaseOrders.map((row) => row.id),
        ...jobSubmittals.map((row) => row.id)
      ]);

      return mapJobFromRow(job, {
        changeOrders: jobChangeOrders.map(mapChangeOrderFromRow),
        purchaseOrders: jobPurchaseOrders.map(mapPurchaseOrderFromRow),
        submittals: jobSubmittals.map(mapSubmittalFromRow),
        files: ((fileRows ?? []) as ProjectFileRow[]).filter((row) => jobOwnerIds.has(row.owner_id)).map(mapProjectFileFromRow),
        activity: ((activityRows ?? []) as ActivityEventRow[]).filter((row) => row.owner_id && jobOwnerIds.has(row.owner_id)).map(mapActivityEventFromRow)
      });
    }
  );
}

export async function listJobDetail(jobId: string, client: SupabaseJobClient | null = supabase) {
  if (!client || !isUuid(jobId)) return null;
  const jobs = await listJobs(client);
  return jobs.find((job) => job.id === jobId) ?? null;
}

export async function saveJobHeader(job: Job, client: SupabaseJobClient | null = supabase) {
  if (!client) return job;
  const { data, error } = await client.from("jobs").upsert(mapJobToUpsert(job), { onConflict: "job_number" }).select("*").single();

  if (error) throw error;
  return data ? mapJobFromRow(data) : job;
}

export async function saveChangeOrder(co: ChangeOrder, client: SupabaseJobClient | null = supabase): Promise<ChangeOrder> {
  if (!client) return co;
  const write = mapChangeOrderToWrite(co);
  const { data, error } = write.id
    ? await client.from("change_orders").upsert(write, { onConflict: "id" }).select("*").single()
    : await client.from("change_orders").insert(write).select("*").single();
  if (error) throw error;
  return data ? mapChangeOrderFromRow(data as ChangeOrderRow) : co;
}

export async function savePurchaseOrder(po: PurchaseOrder, client: SupabaseJobClient | null = supabase): Promise<PurchaseOrder> {
  if (!client) return po;
  const write = mapPurchaseOrderToWrite(po);
  const { data, error } = write.id
    ? await client.from("purchase_orders").upsert(write, { onConflict: "id" }).select("*").single()
    : await client.from("purchase_orders").insert(write).select("*").single();
  if (error) throw error;
  return data ? mapPurchaseOrderFromRow(data as PurchaseOrderRow) : po;
}

export async function saveSubmittal(submittal: SubmittalPackage, client: SupabaseJobClient | null = supabase): Promise<SubmittalPackage> {
  if (!client) return submittal;
  const write = mapSubmittalToWrite(submittal);
  const { data, error } = write.id
    ? await client.from("submittals").upsert(write, { onConflict: "id" }).select("*").single()
    : await client.from("submittals").insert(write).select("*").single();
  if (error) throw error;
  return data ? mapSubmittalFromRow(data as SubmittalRow) : submittal;
}

export async function listPMNotes(client: SupabaseJobClient | null = supabase): Promise<PMNote[]> {
  if (!client) return [];
  const { data, error } = await client.from("pm_notes").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as PMNoteRow[]).map(mapPMNoteFromRow);
}

export async function savePMNote(note: PMNote, client: SupabaseJobClient | null = supabase): Promise<PMNote> {
  if (!client) return note;
  const write = mapPMNoteToWrite(note);
  const { data, error } = write.id
    ? await client.from("pm_notes").upsert(write, { onConflict: "id" }).select("*").single()
    : await client.from("pm_notes").insert(mapPMNoteToInsert(note)).select("*").single();
  if (error) throw error;
  return data ? mapPMNoteFromRow(data as PMNoteRow) : note;
}

export async function deletePMNote(noteId: string, client: SupabaseJobClient | null = supabase) {
  if (!client || !isUuid(noteId)) return false;
  const { error } = await client.from("pm_notes").delete().eq("id", noteId);
  if (error) throw error;
  return true;
}

export async function saveActivityEvent(event: ActivityEvent, client: SupabaseJobClient | null = supabase): Promise<ActivityEvent> {
  if (!client) return event;
  const write = mapActivityEventToInsert(event);
  const { data, error } = write.id
    ? await client.from("activity_events").upsert(write, { onConflict: "id" }).select("*").single()
    : await client.from("activity_events").insert(write).select("*").single();
  if (error) throw error;
  return data ? mapActivityEventFromRow(data as ActivityEventRow) : event;
}

function mapChangeOrderToWrite(changeOrder: ChangeOrder & { estimateId?: string }): ChangeOrderWrite {
  return {
    id: isUuid(changeOrder.id) ? changeOrder.id : undefined,
    job_id: nullableUuid(changeOrder.jobId),
    estimate_id: nullableUuid(changeOrder.estimateId),
    number: changeOrder.number,
    description: changeOrder.description,
    amount: changeOrder.amount,
    status: changeOrder.status,
    date_submitted: nullableText(changeOrder.dateSubmitted),
    approved_date: nullableText(changeOrder.approvedDate),
    notes: nullableText(changeOrder.notes)
  };
}

function mapPurchaseOrderToWrite(purchaseOrder: PurchaseOrder): PurchaseOrderWrite {
  return {
    id: isUuid(purchaseOrder.id) ? purchaseOrder.id : undefined,
    job_id: nullableUuid(purchaseOrder.jobId),
    po_number: purchaseOrder.poNumber,
    vendor: purchaseOrder.vendor,
    scope: purchaseOrder.scope,
    description: nullableText(purchaseOrder.description),
    status: purchaseOrder.status,
    committed_amount: purchaseOrder.committedAmount,
    approved_change_amount: purchaseOrder.approvedChangeAmount ?? 0,
    invoiced_amount: purchaseOrder.invoicedAmount ?? 0,
    paid_amount: purchaseOrder.paidAmount ?? 0,
    issue_date: nullableText(purchaseOrder.issueDate),
    needed_by: nullableText(purchaseOrder.neededBy),
    promised_date: nullableText(purchaseOrder.promisedDate),
    received_date: nullableText(purchaseOrder.receivedDate),
    owner: nullableText(purchaseOrder.owner),
    notes: nullableText(purchaseOrder.notes)
  };
}

function mapSubmittalToWrite(submittal: SubmittalPackage): SubmittalWrite {
  return {
    id: isUuid(submittal.id) ? submittal.id : undefined,
    job_id: nullableUuid(submittal.jobId),
    name: submittal.name,
    type: submittal.type,
    status: submittal.status,
    revision: submittal.revision,
    due_date: nullableText(submittal.dueDate),
    submitted_date: nullableText(submittal.submittedDate),
    returned_date: nullableText(submittal.returnedDate),
    owner: nullableText(submittal.owner),
    release_blocker: submittal.releaseBlocker,
    notes: nullableText(submittal.notes)
  };
}

function mapPMNoteToWrite(note: PMNote): PMNoteWrite {
  return {
    id: isUuid(note.id) ? note.id : undefined,
    text: note.text,
    status: normalizePMNoteStatus(note.status),
    priority: normalizePMNotePriority(note.priority),
    job_id: note.jobId ? requiredUuid(note.jobId, "PM note metadata requires a persisted UUID job id.") : null,
    due_date: nullableText(note.dueDate),
    completed_at: nullableText(note.completedAt)
  };
}

function normalizeWorkType(value: WorkType | string | null): WorkType {
  return WORK_TYPES.includes(value as WorkType) ? (value as WorkType) : "Bid / ITB";
}

function normalizeBacklogStatus(value: BacklogStatus | string | null): BacklogStatus {
  return BACKLOG_STATUSES.includes(value as BacklogStatus) ? (value as BacklogStatus) : "Awarded / Waiting";
}

function normalizeChangeOrderStatus(value: ChangeOrderStatus | string | null): ChangeOrderStatus {
  return CHANGE_ORDER_STATUSES.includes(value as ChangeOrderStatus) ? (value as ChangeOrderStatus) : "submitted";
}

function normalizePurchaseOrderStatus(value: PurchaseOrderStatus | string | null): PurchaseOrderStatus {
  return PURCHASE_ORDER_STATUSES.includes(value as PurchaseOrderStatus) ? (value as PurchaseOrderStatus) : "Draft";
}

function normalizeSubmittalStatus(value: SubmittalStatus | string | null): SubmittalStatus {
  return SUBMITTAL_STATUSES.includes(value as SubmittalStatus) ? (value as SubmittalStatus) : "Not Started";
}

function normalizeFabStatus(value: FabStatus | string | null): FabStatus {
  const statuses: FabStatus[] = ["Not Started", "In Fabrication", "Ready", "Complete"];
  return statuses.includes(value as FabStatus) ? (value as FabStatus) : "Not Started";
}

function normalizeInstallStatus(value: InstallStatus | string | null): InstallStatus {
  const statuses: InstallStatus[] = ["Ready", "Active", "Completed", "Installed", "Void"];
  return statuses.includes(value as InstallStatus) ? (value as InstallStatus) : "Ready";
}

function normalizeInvoiceStatus(value: InvoiceStatus | string | null): InvoiceStatus {
  const statuses: InvoiceStatus[] = ["Not Billed", "Partial", "Billed", "Paid"];
  return statuses.includes(value as InvoiceStatus) ? (value as InvoiceStatus) : "Not Billed";
}

function normalizePurchaseOrderScope(value: PurchaseOrderScope | string | null): PurchaseOrderScope {
  const scopes: PurchaseOrderScope[] = ["Stone / Quartz", "Cambria", "Solid Surface", "Glass", "Metal", "Install Labor", "Other"];
  return scopes.includes(value as PurchaseOrderScope) ? (value as PurchaseOrderScope) : "Other";
}

function normalizeSubmittalType(value: SubmittalType | string | null): SubmittalType {
  const types: SubmittalType[] = ["Shop Drawings", "Finish Samples", "Hardware", "Engineering", "Other"];
  return types.includes(value as SubmittalType) ? (value as SubmittalType) : "Other";
}

function normalizePMNoteStatus(value: PMNoteStatus | string | null): PMNoteStatus {
  const statuses: PMNoteStatus[] = ["Open", "Waiting", "Done"];
  return statuses.includes(value as PMNoteStatus) ? (value as PMNoteStatus) : "Open";
}

function normalizePMNotePriority(value: PMNotePriority | string | null): PMNotePriority {
  const priorities: PMNotePriority[] = ["Normal", "Pinned"];
  return priorities.includes(value as PMNotePriority) ? (value as PMNotePriority) : "Normal";
}

function normalizeActivityOwnerType(value: ActivityOwnerType | string): ActivityOwnerType {
  const ownerTypes: ActivityOwnerType[] = ["opportunity", "estimate", "job", "change_order", "submittal", "purchase_order"];
  return ownerTypes.includes(value as ActivityOwnerType) ? (value as ActivityOwnerType) : "job";
}

function toNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function toNullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function uniqueIds(values: string[]) {
  return [...new Set(values.filter(isUuid))];
}

function nullableText(value?: string) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function nullableUuid(value?: string) {
  return value && isUuid(value) ? value : null;
}

function requiredUuid(value: string, message: string) {
  if (!isUuid(value)) throw new Error(message);
  return value;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
