import { supabase } from "../supabase-client";
import type { Opportunity, WinLoss } from "../types";

export type OpportunityRow = {
  id: string;
  opportunity_number: string;
  month: string;
  year: number | null;
  client: string;
  project_name: string;
  bid_due_date: string | null;
  drawing_stage: string;
  bid_type: string;
  sent_date: string | null;
  submission_method: string;
  status: string;
  win_loss: string;
  job_type: string;
  est_value: number | string;
  link_drawings: string;
  link_specs: string;
  link_schedule: string;
  notes: string;
  bid_feedback: string;
  ntp_received: boolean;
  final_cost: number | string | null;
};

export function mapOpportunityFromRow(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    opportunityNumber: row.opportunity_number,
    month: row.month,
    year: row.year,
    client: row.client,
    projectName: row.project_name,
    bidDueDate: row.bid_due_date ?? "",
    drawingStage: row.drawing_stage,
    bidType: row.bid_type,
    sentDate: row.sent_date ?? "",
    submissionMethod: row.submission_method,
    status: row.status,
    winLoss: (["Won", "Lost"].includes(row.win_loss) ? row.win_loss : "") as WinLoss,
    jobType: row.job_type,
    estValue: Number(row.est_value) || 0,
    linkDrawings: row.link_drawings,
    linkSpecs: row.link_specs,
    linkSchedule: row.link_schedule,
    notes: row.notes,
    bidFeedback: row.bid_feedback,
    ntpReceived: row.ntp_received,
    finalCost: row.final_cost == null ? null : Number(row.final_cost)
  };
}

export function mapOpportunityToRow(opp: Opportunity): Omit<OpportunityRow, "id"> & { id?: string } {
  return {
    ...(isUuid(opp.id) ? { id: opp.id } : {}),
    opportunity_number: opp.opportunityNumber,
    month: opp.month,
    year: opp.year,
    client: opp.client,
    project_name: opp.projectName,
    bid_due_date: opp.bidDueDate || null,
    drawing_stage: opp.drawingStage,
    bid_type: opp.bidType,
    sent_date: opp.sentDate || null,
    submission_method: opp.submissionMethod,
    status: opp.status,
    win_loss: opp.winLoss,
    job_type: opp.jobType,
    est_value: opp.estValue,
    link_drawings: opp.linkDrawings,
    link_specs: opp.linkSpecs,
    link_schedule: opp.linkSchedule,
    notes: opp.notes,
    bid_feedback: opp.bidFeedback,
    ntp_received: opp.ntpReceived,
    final_cost: opp.finalCost
  };
}

export async function listOpportunities(): Promise<Opportunity[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("opportunities")
    .select("*")
    .order("bid_due_date", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return ((data ?? []) as OpportunityRow[]).map(mapOpportunityFromRow);
}

/** Upserts on opportunity_number — importing or re-saving never duplicates. */
export async function saveOpportunity(opp: Opportunity): Promise<Opportunity> {
  if (!supabase) return opp;
  const { data, error } = await supabase
    .from("opportunities")
    .upsert(mapOpportunityToRow(opp), { onConflict: "opportunity_number" })
    .select("*")
    .single();
  if (error) throw error;
  return mapOpportunityFromRow(data as OpportunityRow);
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
