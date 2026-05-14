import type { Estimate, EstimateDocumentType } from "@/types";
import { calculateEstimateTotals } from "./estimate-math";
import { supabase } from "./supabase-client";

export type EstimateRow = {
  id: string;
  opportunity_id: string | null;
  job_id: string | null;
  document_type: EstimateDocumentType | string | null;
  proposal_number: string | null;
  revision: string | null;
  project_name: string | null;
  project_location: string | null;
  client: string | null;
  client_address: string | null;
  client_contact: string | null;
  architect: string | null;
  estimator: string | null;
  bid_date: string | null;
  due_date: string | null;
  delivery_date: string | null;
  ship_via: string | null;
  po_number: string | null;
  project_identifier: string | null;
  bid_documents: string | null;
  drawings_dated: string | null;
  addenda: string | null;
  scope_summary: string | null;
  valid_days: number | string | null;
  payment_terms: string | null;
  lead_time: string | null;
  pricing_mode: Estimate["pricingMode"] | string | null;
  overhead_pct: number | string | null;
  delivery_pct: number | string | null;
  install_pct: number | string | null;
  exclusions: unknown;
  clarifications: unknown;
  terms: unknown;
  change_order_context: Estimate["changeOrderContext"] | null;
};

export type EstimateUpsert = {
  id?: string;
  opportunity_id: string | null;
  job_id: string | null;
  document_type: EstimateDocumentType;
  proposal_number: string | null;
  revision: string | null;
  project_name: string;
  project_location: string | null;
  client: string;
  client_address: string | null;
  client_contact: string | null;
  architect: string | null;
  estimator: string | null;
  bid_date: string | null;
  due_date: string | null;
  delivery_date: string | null;
  ship_via: string | null;
  po_number: string | null;
  project_identifier: string | null;
  bid_documents: string | null;
  drawings_dated: string | null;
  addenda: string | null;
  scope_summary: string | null;
  valid_days: number | null;
  payment_terms: string | null;
  lead_time: string | null;
  pricing_mode: Estimate["pricingMode"];
  overhead_pct: number;
  delivery_pct: number;
  install_pct: number;
  exclusions: string[];
  clarifications: string[];
  terms: Record<string, never>;
  change_order_context: Estimate["changeOrderContext"] | null;
};

export type EstimateSnapshotInsert = {
  estimate_id: string;
  opportunity_id: string | null;
  job_id: string | null;
  snapshot: Estimate;
  material_total: number;
  bid_total: number;
};

type SupabaseEstimateClient = {
  from: (table: "estimates" | "estimate_snapshots") => any;
};

export function mapEstimateFromRow(row: EstimateRow): Estimate {
  return {
    id: row.id,
    opportunityId: row.opportunity_id ?? undefined,
    jobId: row.job_id ?? undefined,
    documentType: normalizeDocumentType(row.document_type),
    proposalNumber: row.proposal_number ?? "",
    revision: row.revision ?? "",
    projectName: row.project_name ?? "",
    projectLocation: row.project_location ?? "",
    client: row.client ?? "",
    clientAddress: row.client_address ?? "",
    clientContact: row.client_contact ?? "",
    architect: row.architect ?? "",
    estimator: row.estimator ?? "",
    bidDate: row.bid_date ?? "",
    dueDate: row.due_date ?? "",
    deliveryDate: row.delivery_date ?? "",
    shipVia: row.ship_via ?? "",
    poNumber: row.po_number ?? "",
    projectId: row.project_identifier ?? "",
    bidDocuments: row.bid_documents ?? "",
    drawingsDated: row.drawings_dated ?? "",
    addenda: row.addenda ?? "",
    scopeSummary: row.scope_summary ?? "",
    validDays: toNullableNumber(row.valid_days) ?? undefined,
    paymentTerms: row.payment_terms ?? "",
    leadTime: row.lead_time ?? "",
    pricingMode: normalizePricingMode(row.pricing_mode),
    ohPct: toNumber(row.overhead_pct),
    delPct: toNumber(row.delivery_pct),
    insPct: toNumber(row.install_pct),
    changeOrderContext: row.change_order_context ?? undefined,
    areas: [],
    subItems: [],
    alternates: [],
    exclusions: toStringArray(row.exclusions),
    clarifications: toStringArray(row.clarifications)
  };
}

export function mapEstimateToUpsert(estimate: Estimate): EstimateUpsert {
  return {
    id: isUuid(estimate.id) ? estimate.id : undefined,
    opportunity_id: nullableUuid(estimate.opportunityId),
    job_id: nullableUuid(estimate.jobId),
    document_type: estimate.documentType ?? "Proposal",
    proposal_number: nullableText(estimate.proposalNumber),
    revision: nullableText(estimate.revision),
    project_name: estimate.projectName,
    project_location: nullableText(estimate.projectLocation),
    client: estimate.client,
    client_address: nullableText(estimate.clientAddress),
    client_contact: nullableText(estimate.clientContact),
    architect: nullableText(estimate.architect),
    estimator: nullableText(estimate.estimator),
    bid_date: nullableText(estimate.bidDate),
    due_date: nullableText(estimate.dueDate),
    delivery_date: nullableText(estimate.deliveryDate),
    ship_via: nullableText(estimate.shipVia),
    po_number: nullableText(estimate.poNumber),
    project_identifier: nullableText(estimate.projectId),
    bid_documents: nullableText(estimate.bidDocuments),
    drawings_dated: nullableText(estimate.drawingsDated),
    addenda: nullableText(estimate.addenda),
    scope_summary: nullableText(estimate.scopeSummary),
    valid_days: toNullableNumber(estimate.validDays),
    payment_terms: nullableText(estimate.paymentTerms),
    lead_time: nullableText(estimate.leadTime),
    pricing_mode: estimate.pricingMode,
    overhead_pct: estimate.ohPct,
    delivery_pct: estimate.delPct,
    install_pct: estimate.insPct,
    exclusions: estimate.exclusions,
    clarifications: estimate.clarifications,
    terms: {},
    change_order_context: estimate.changeOrderContext ?? null
  };
}

export function mapEstimateSnapshotToInsert(estimate: Estimate): EstimateSnapshotInsert {
  const totals = calculateEstimateTotals(estimate);
  return {
    estimate_id: estimate.id,
    opportunity_id: nullableUuid(estimate.opportunityId),
    job_id: nullableUuid(estimate.jobId),
    snapshot: estimate,
    material_total: totals.material,
    bid_total: totals.bidTotal
  };
}

export async function listEstimates(client: SupabaseEstimateClient | null = supabase) {
  if (!client) return [];
  const { data, error } = await client.from("estimates").select("*").order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapEstimateFromRow);
}

export async function saveEstimateHeader(estimate: Estimate, client: SupabaseEstimateClient | null = supabase) {
  if (!client) return estimate;
  const { data, error } = await client.from("estimates").upsert(mapEstimateToUpsert(estimate)).select("*").single();

  if (error) throw error;
  return data ? mapEstimateFromRow(data) : estimate;
}

export async function saveEstimateSnapshot(estimate: Estimate, client: SupabaseEstimateClient | null = supabase) {
  if (!client) return mapEstimateSnapshotToInsert(estimate);
  const { data, error } = await client.from("estimate_snapshots").insert(mapEstimateSnapshotToInsert(estimate)).select("*").single();

  if (error) throw error;
  return data;
}

function normalizeDocumentType(value: EstimateRow["document_type"]): EstimateDocumentType {
  const documentTypes: EstimateDocumentType[] = ["Proposal", "Quote", "Budget", "Change Order", "Service Quote", "Revision"];
  return documentTypes.includes(value as EstimateDocumentType) ? (value as EstimateDocumentType) : "Proposal";
}

function normalizePricingMode(value: EstimateRow["pricing_mode"]): Estimate["pricingMode"] {
  return value === "lumpsum" || value === "itemized" ? value : "byarea";
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toNumber(value: number | string | null) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function toNullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
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
