import { supabase } from "../supabase-client";
import { JOB_STATUSES, type ActivityEvent, type ChangeOrder, type ChangeOrderStatus, type Job, type JobStatus } from "../types";
import { isUuid } from "./opportunities";

export type JobRow = {
  id: string;
  job_number: string;
  pm: string;
  client: string;
  project_name: string;
  status: string;
  contract_value: number | string;
  bid_ref: string;
  opportunity_id: string | null;
  estimate_id: string | null;
  install_start: string | null;
  install_end: string | null;
  crew_size: number;
  gc: string;
  fab_status: string;
  invoice_status: string;
  notes: string;
};

export type ChangeOrderRow = {
  id: string;
  job_id: string;
  description: string;
  amount: number | string;
  status: string;
  submitted_date: string | null;
  approved_date: string | null;
  created_by: string;
  notes: string;
};

export type ActivityRow = {
  id: string;
  job_id: string;
  author: string;
  note: string;
  created_at: string;
};

export function mapJobFromRow(row: JobRow): Job {
  return {
    id: row.id,
    jobNumber: row.job_number,
    pm: row.pm,
    client: row.client,
    projectName: row.project_name,
    status: (JOB_STATUSES.includes(row.status as JobStatus) ? row.status : "ready") as JobStatus,
    contractValue: Number(row.contract_value) || 0,
    bidRef: row.bid_ref,
    opportunityId: row.opportunity_id,
    estimateId: row.estimate_id,
    installStart: row.install_start ?? "",
    installEnd: row.install_end ?? "",
    crewSize: row.crew_size,
    gc: row.gc,
    fabStatus: row.fab_status,
    invoiceStatus: row.invoice_status,
    notes: row.notes
  };
}

export function mapJobToRow(job: Job): Omit<JobRow, "id"> & { id?: string } {
  return {
    ...(isUuid(job.id) ? { id: job.id } : {}),
    job_number: job.jobNumber,
    pm: job.pm,
    client: job.client,
    project_name: job.projectName,
    status: job.status,
    contract_value: job.contractValue,
    bid_ref: job.bidRef,
    opportunity_id: job.opportunityId,
    estimate_id: job.estimateId,
    install_start: job.installStart || null,
    install_end: job.installEnd || null,
    crew_size: job.crewSize,
    gc: job.gc,
    fab_status: job.fabStatus,
    invoice_status: job.invoiceStatus,
    notes: job.notes
  };
}

export function mapChangeOrderFromRow(row: ChangeOrderRow): ChangeOrder {
  return {
    id: row.id,
    jobId: row.job_id,
    description: row.description,
    amount: Number(row.amount) || 0,
    status: (row.status === "approved" ? "approved" : "submitted") as ChangeOrderStatus,
    submittedDate: row.submitted_date ?? "",
    approvedDate: row.approved_date ?? "",
    createdBy: row.created_by,
    notes: row.notes
  };
}

export function mapActivityFromRow(row: ActivityRow): ActivityEvent {
  return { id: row.id, jobId: row.job_id, author: row.author, note: row.note, createdAt: row.created_at };
}

export async function listJobs(): Promise<Job[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("jobs").select("*").order("job_number");
  if (error) throw error;
  return ((data ?? []) as JobRow[]).map(mapJobFromRow);
}

export async function listChangeOrders(): Promise<ChangeOrder[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("change_orders").select("*").order("created_at");
  if (error) throw error;
  return ((data ?? []) as ChangeOrderRow[]).map(mapChangeOrderFromRow);
}

export async function saveJob(job: Job): Promise<Job> {
  if (!supabase) return job;
  const { data, error } = await supabase
    .from("jobs")
    .upsert(mapJobToRow(job), { onConflict: "job_number" })
    .select("*")
    .single();
  if (error) throw error;
  return mapJobFromRow(data as JobRow);
}

export async function saveChangeOrder(co: ChangeOrder): Promise<ChangeOrder> {
  if (!supabase) return co;
  const row = {
    ...(isUuid(co.id) ? { id: co.id } : {}),
    job_id: co.jobId,
    description: co.description,
    amount: co.amount,
    status: co.status,
    submitted_date: co.submittedDate || null,
    approved_date: co.approvedDate || null,
    created_by: co.createdBy,
    notes: co.notes
  };
  const { data, error } = await supabase.from("change_orders").upsert(row).select("*").single();
  if (error) throw error;
  return mapChangeOrderFromRow(data as ChangeOrderRow);
}

export async function deleteChangeOrder(id: string): Promise<void> {
  if (!supabase || !isUuid(id)) return;
  const { error } = await supabase.from("change_orders").delete().eq("id", id);
  if (error) throw error;
}

export async function listActivity(jobId: string): Promise<ActivityEvent[]> {
  if (!supabase || !isUuid(jobId)) return [];
  const { data, error } = await supabase
    .from("activity_events")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ActivityRow[]).map(mapActivityFromRow);
}

export async function addActivity(jobId: string, author: string, note: string): Promise<ActivityEvent | null> {
  if (!supabase || !isUuid(jobId)) return null;
  const { data, error } = await supabase
    .from("activity_events")
    .insert({ job_id: jobId, author, note })
    .select("*")
    .single();
  if (error) throw error;
  return mapActivityFromRow(data as ActivityRow);
}
