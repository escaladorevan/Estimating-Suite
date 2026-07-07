import { supabase } from "../supabase-client";
import type { EstimateRecord } from "../types";
import { isUuid } from "./opportunities";

export type EstimateRow = {
  id: string;
  opportunity_id: string | null;
  name: string;
  client: string;
  doc_type: string;
  base_bid: number | string;
  document: unknown;
  updated_at: string;
};

export function mapEstimateFromRow(row: EstimateRow): EstimateRecord {
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    name: row.name,
    client: row.client,
    docType: row.doc_type,
    baseBid: Number(row.base_bid) || 0,
    document: row.document,
    updatedAt: row.updated_at
  };
}

export async function listEstimates(): Promise<EstimateRecord[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("estimates").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as EstimateRow[]).map(mapEstimateFromRow);
}

/**
 * One atomic write: the whole estimator document plus denormalized header
 * columns. There is no partial-save state by construction.
 */
export async function saveEstimate(estimate: EstimateRecord): Promise<EstimateRecord> {
  if (!supabase) return estimate;
  const row = {
    ...(isUuid(estimate.id) ? { id: estimate.id } : {}),
    opportunity_id: estimate.opportunityId,
    name: estimate.name,
    client: estimate.client,
    doc_type: estimate.docType,
    base_bid: estimate.baseBid,
    document: estimate.document
  };
  const { data, error } = await supabase.from("estimates").upsert(row).select("*").single();
  if (error) throw error;
  return mapEstimateFromRow(data as EstimateRow);
}
