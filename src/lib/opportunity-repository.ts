import type { Opportunity, OpportunityStatus, WinLoss, WorkType } from "@/types";
import { supabase } from "./supabase-client";
import { listContacts, loadContactsForOpportunities } from "./contact-repository";
import { mapProjectFileFromRow, signProjectFileUrl, type ProjectFileRow } from "./file-repository";
import { OPPORTUNITY_STATUSES, WIN_LOSS_VALUES, WORK_TYPES } from "./status-constants";

export type OpportunityRow = {
  id: string;
  opportunity_number: string | null;
  work_type: WorkType | string | null;
  month: string | null;
  client: string | null;
  company_id?: string | null;
  project_name: string | null;
  bid_due_date: string | null;
  drawing_stage: string | null;
  bid_type: string | null;
  sent_date: string | null;
  submission_method: string | null;
  status: OpportunityStatus | string | null;
  win_loss: WinLoss | string | null;
  job_type: string | null;
  estimated_value: number | string | null;
  drawing_link: string | null;
  specs_link: string | null;
  schedule_link: string | null;
  notes: string | null;
  bid_feedback: string | null;
  ntp_received: boolean | null;
  initial_contract_value: number | string | null;
  final_cost: number | string | null;
};

export type OpportunityUpsert = {
  id?: string;
  opportunity_number: string;
  work_type: WorkType;
  month: string | null;
  client: string;
  company_id: string | null;
  project_name: string;
  bid_due_date: string | null;
  drawing_stage: string | null;
  bid_type: string | null;
  sent_date: string | null;
  submission_method: string | null;
  status: OpportunityStatus;
  win_loss: WinLoss;
  job_type: string | null;
  estimated_value: number;
  drawing_link: string | null;
  specs_link: string | null;
  schedule_link: string | null;
  notes: string | null;
  bid_feedback: string | null;
  ntp_received: boolean;
  initial_contract_value: number | null;
  final_cost: number | null;
};

type SupabaseOpportunityClient = {
  from: (table: string) => any;
};

export function mapOpportunityFromRow(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    jobId: row.opportunity_number ?? "",
    workType: normalizeWorkType(row.work_type),
    month: row.month ?? "",
    client: row.client ?? "",
    companyId: row.company_id ?? undefined,
    projectName: row.project_name ?? "",
    bidDueDate: row.bid_due_date ?? "",
    drawingStage: row.drawing_stage ?? "",
    bidType: row.bid_type ?? "",
    sentDate: row.sent_date ?? "",
    submissionMethod: row.submission_method ?? "",
    status: normalizeStatus(row.status),
    winLoss: normalizeWinLoss(row.win_loss),
    jobType: row.job_type ?? "",
    estimatedValue: toNumber(row.estimated_value),
    links: {
      drawings: row.drawing_link ?? "",
      specs: row.specs_link ?? "",
      schedule: row.schedule_link ?? ""
    },
    notes: row.notes ?? "",
    bidFeedback: row.bid_feedback ?? "",
    ntpReceived: Boolean(row.ntp_received),
    initialContractValue: toNullableNumber(row.initial_contract_value),
    finalCost: toNullableNumber(row.final_cost),
    files: [],
    contacts: []
  };
}

export function mapOpportunityToUpsert(opportunity: Opportunity): OpportunityUpsert {
  return {
    id: isUuid(opportunity.id) ? opportunity.id : undefined,
    opportunity_number: opportunity.jobId,
    work_type: opportunity.workType ?? "Bid / ITB",
    month: nullableText(opportunity.month),
    client: opportunity.client,
    company_id: nullableUuid(opportunity.companyId),
    project_name: opportunity.projectName,
    bid_due_date: nullableText(opportunity.bidDueDate),
    drawing_stage: nullableText(opportunity.drawingStage),
    bid_type: nullableText(opportunity.bidType),
    sent_date: nullableText(opportunity.sentDate),
    submission_method: nullableText(opportunity.submissionMethod),
    status: opportunity.status,
    win_loss: opportunity.winLoss,
    job_type: nullableText(opportunity.jobType),
    estimated_value: opportunity.estimatedValue,
    drawing_link: nullableText(opportunity.links.drawings),
    specs_link: nullableText(opportunity.links.specs),
    schedule_link: nullableText(opportunity.links.schedule),
    notes: nullableText(opportunity.notes),
    bid_feedback: nullableText(opportunity.bidFeedback),
    ntp_received: opportunity.ntpReceived,
    initial_contract_value: opportunity.initialContractValue,
    final_cost: opportunity.finalCost
  };
}

export async function listOpportunities(client: SupabaseOpportunityClient | null = supabase) {
  if (!client) return [];
  const { data, error } = await client
    .from("opportunities")
    .select("*")
    .order("bid_due_date", { ascending: true });

  if (error) throw error;

  const opportunities = ((data ?? []) as OpportunityRow[]).map(mapOpportunityFromRow);
  const opportunityIds = opportunities.map((opportunity) => opportunity.id).filter(isUuid);
  if (!opportunityIds.length) return opportunities;

  const [contacts, fileRowsResult] = await Promise.all([
    listContacts(client),
    client
      .from("files")
      .select("*")
      .eq("owner_type", "opportunity")
      .in("owner_id", opportunityIds)
      .order("uploaded_at", { ascending: false })
  ]);
  if (fileRowsResult.error) throw fileRowsResult.error;

  const contactsByOpportunity = await loadContactsForOpportunities(opportunityIds, contacts, client);
  const files = await Promise.all(
    ((fileRowsResult.data ?? []) as ProjectFileRow[]).map((row) => signProjectFileUrl(mapProjectFileFromRow(row), client))
  );
  const filesByOpportunity = new Map<string, typeof files>();
  for (const file of files) {
    filesByOpportunity.set(file.ownerId, [...(filesByOpportunity.get(file.ownerId) ?? []), file]);
  }

  return opportunities.map((opportunity) => ({
    ...opportunity,
    files: filesByOpportunity.get(opportunity.id) ?? [],
    contacts: contactsByOpportunity.get(opportunity.id) ?? []
  }));
}

export async function saveOpportunity(opportunity: Opportunity, client: SupabaseOpportunityClient | null = supabase) {
  if (!client) return opportunity;
  const { data, error } = await client
    .from("opportunities")
    .upsert(mapOpportunityToUpsert(opportunity), { onConflict: "opportunity_number" })
    .select("*")
    .single();

  if (error) throw error;
  return data ? { ...mapOpportunityFromRow(data), files: opportunity.files ?? [], contacts: opportunity.contacts ?? [] } : opportunity;
}

function normalizeWorkType(value: OpportunityRow["work_type"]): WorkType {
  return WORK_TYPES.includes(value as WorkType) ? (value as WorkType) : "Bid / ITB";
}

function normalizeStatus(value: OpportunityRow["status"]): OpportunityStatus {
  return OPPORTUNITY_STATUSES.includes(value as OpportunityStatus) ? (value as OpportunityStatus) : "New";
}

function normalizeWinLoss(value: OpportunityRow["win_loss"]): WinLoss {
  return WIN_LOSS_VALUES.includes(value as WinLoss) ? (value as WinLoss) : "";
}

function toNumber(value: number | string | null) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function toNullableNumber(value: number | string | null) {
  if (value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableText(value?: string) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function nullableUuid(value?: string) {
  return value && isUuid(value) ? value : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
