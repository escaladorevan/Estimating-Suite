import type { Estimate, EstimateAlternate, EstimateArea, EstimateDocumentType, EstimateItem, EstimateSection, SubcontractorItem } from "@/types";
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

type EstimateAreaRow = {
  id: string;
  estimate_id: string;
  name: string | null;
  qty: number | string | null;
  ignored: boolean | null;
  no_print: boolean | null;
  sort_order: number | string | null;
};

type EstimateSectionRow = {
  id: string;
  area_id: string;
  name: string | null;
  ignored: boolean | null;
  no_print: boolean | null;
  sort_order: number | string | null;
};

type EstimateItemRow = {
  id: string;
  section_id: string;
  name: string | null;
  description: string | null;
  drawing_ref: string | null;
  category: string | null;
  material_type: string | null;
  qty: number | string | null;
  unit: string | null;
  unit_cost: number | string | null;
  ignored: boolean | null;
  no_print: boolean | null;
  sort_order: number | string | null;
};

type EstimateSubItemRow = {
  id: string;
  estimate_id: string;
  description: string | null;
  cost: number | string | null;
  markup_pct: number | string | null;
  sort_order: number | string | null;
};

type EstimateAlternateRow = {
  id: string;
  estimate_id: string;
  description: string | null;
  amount: number | string | null;
  sort_order: number | string | null;
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
  from: (table: string) => any;
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

function mapItemRow(row: EstimateItemRow): EstimateItem {
  return {
    id: row.id,
    name: row.name ?? undefined,
    description: row.description ?? undefined,
    drawingRef: row.drawing_ref ?? undefined,
    category: row.category ?? undefined,
    materialType: row.material_type ?? undefined,
    qty: toNumber(row.qty),
    unit: row.unit ?? undefined,
    unitCost: toNumber(row.unit_cost),
    ignored: row.ignored || undefined,
    noPrint: row.no_print || undefined,
    sortOrder: toNumber(row.sort_order)
  };
}

function mapSectionRow(row: EstimateSectionRow, items: EstimateItem[]): EstimateSection {
  return {
    id: row.id,
    name: row.name ?? undefined,
    ignored: row.ignored || undefined,
    noPrint: row.no_print || undefined,
    items,
    sortOrder: toNumber(row.sort_order)
  };
}

function mapAreaRow(row: EstimateAreaRow, sections: EstimateSection[]): EstimateArea {
  return {
    id: row.id,
    name: row.name ?? undefined,
    qty: toNumber(row.qty),
    ignored: row.ignored || undefined,
    noPrint: row.no_print || undefined,
    sections,
    sortOrder: toNumber(row.sort_order)
  };
}

function mapSubItemRow(row: EstimateSubItemRow): SubcontractorItem {
  return {
    id: row.id,
    description: row.description ?? undefined,
    cost: toNumber(row.cost),
    markupPct: toNumber(row.markup_pct),
    sortOrder: toNumber(row.sort_order)
  };
}

function mapAlternateRow(row: EstimateAlternateRow): EstimateAlternate {
  return {
    id: row.id,
    description: row.description ?? "",
    amount: toNumber(row.amount),
    sortOrder: toNumber(row.sort_order)
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
  const estimates: Estimate[] = ((data ?? []) as EstimateRow[]).map(mapEstimateFromRow);
  const estimateIds = estimates.map((estimate) => estimate.id).filter(isUuid);
  if (!estimateIds.length) return estimates;

  const lineItemsByEstimate = await loadLineItemsForEstimates(estimateIds, client);
  return estimates.map((estimate) => {
    const lineItems = lineItemsByEstimate.get(estimate.id);
    return lineItems ? { ...estimate, ...lineItems } : estimate;
  });
}

export async function saveEstimateHeader(estimate: Estimate, client: SupabaseEstimateClient | null = supabase) {
  if (!client) return estimate;
  const { data, error } = await client.from("estimates").upsert(mapEstimateToUpsert(estimate)).select("*").single();

  if (error) throw error;
  return data ? { ...mapEstimateFromRow(data), areas: estimate.areas, subItems: estimate.subItems, alternates: estimate.alternates } : estimate;
}

type EstimateLineItems = Pick<Estimate, "areas" | "subItems" | "alternates">;

export async function loadLineItemsForEstimates(
  estimateIds: string[],
  client: SupabaseEstimateClient | null = supabase
): Promise<Map<string, EstimateLineItems>> {
  const result = new Map<string, EstimateLineItems>(estimateIds.map((id) => [id, { areas: [], subItems: [], alternates: [] }]));
  if (!client || !estimateIds.length) return result;

  const [areasRes, subItemsRes, alternatesRes] = await Promise.all([
    client.from("estimate_areas").select("*").in("estimate_id", estimateIds).order("sort_order"),
    client.from("estimate_subcontractor_items").select("*").in("estimate_id", estimateIds).order("sort_order"),
    client.from("estimate_alternates").select("*").in("estimate_id", estimateIds).order("sort_order")
  ]);
  for (const error of [areasRes.error, subItemsRes.error, alternatesRes.error]) {
    if (error) throw error;
  }

  const areaRows = (areasRes.data ?? []) as EstimateAreaRow[];
  const areaIds = areaRows.map((area) => area.id);
  const sectionsByAreaId = new Map<string, EstimateSectionRow[]>();
  const itemsBySectionId = new Map<string, EstimateItemRow[]>();

  if (areaIds.length) {
    const sectionsRes = await client.from("estimate_sections").select("*").in("area_id", areaIds).order("sort_order");
    if (sectionsRes.error) throw sectionsRes.error;

    const sectionRows = (sectionsRes.data ?? []) as EstimateSectionRow[];
    for (const row of sectionRows) {
      sectionsByAreaId.set(row.area_id, [...(sectionsByAreaId.get(row.area_id) ?? []), row]);
    }

    const sectionIds = sectionRows.map((section) => section.id);
    if (sectionIds.length) {
      const itemsRes = await client.from("estimate_items").select("*").in("section_id", sectionIds).order("sort_order");
      if (itemsRes.error) throw itemsRes.error;
      for (const row of (itemsRes.data ?? []) as EstimateItemRow[]) {
        itemsBySectionId.set(row.section_id, [...(itemsBySectionId.get(row.section_id) ?? []), row]);
      }
    }
  }

  for (const row of areaRows) {
    const sections = (sectionsByAreaId.get(row.id) ?? []).map((section) =>
      mapSectionRow(section, (itemsBySectionId.get(section.id) ?? []).map(mapItemRow))
    );
    result.get(row.estimate_id)?.areas.push(mapAreaRow(row, sections));
  }

  for (const row of (subItemsRes.data ?? []) as EstimateSubItemRow[]) {
    result.get(row.estimate_id)?.subItems.push(mapSubItemRow(row));
  }

  for (const row of (alternatesRes.data ?? []) as EstimateAlternateRow[]) {
    result.get(row.estimate_id)?.alternates.push(mapAlternateRow(row));
  }

  return result;
}

export async function saveEstimateAreas(
  estimateId: string,
  areas: EstimateArea[],
  client: SupabaseEstimateClient | null = supabase
): Promise<void> {
  if (!client) return;

  const deleteRes = await client.from("estimate_areas").delete().eq("estimate_id", estimateId);
  if (deleteRes.error) throw deleteRes.error;
  if (!areas.length) return;

  const areaRows = areas.map((area, index) => ({
    estimate_id: estimateId,
    name: area.name ?? "",
    qty: area.qty,
    ignored: area.ignored ?? false,
    no_print: area.noPrint ?? false,
    sort_order: area.sortOrder ?? index
  }));
  const { data: savedAreas, error: areaError } = await client.from("estimate_areas").insert(areaRows).select("id");
  if (areaError) throw areaError;

  const sectionRows = areas.flatMap((area, areaIndex) =>
    area.sections.map((section, sectionIndex) => ({
      area_id: savedAreas?.[areaIndex]?.id,
      name: section.name ?? "",
      ignored: section.ignored ?? false,
      no_print: section.noPrint ?? false,
      sort_order: section.sortOrder ?? sectionIndex,
      section,
      areaIndex
    }))
  ).filter((row) => row.area_id);
  if (!sectionRows.length) return;

  const { data: savedSections, error: sectionError } = await client
    .from("estimate_sections")
    .insert(sectionRows.map(({ section: _section, areaIndex: _areaIndex, ...row }) => row))
    .select("id");
  if (sectionError) throw sectionError;

  const itemRows = sectionRows.flatMap((sectionRow, sectionRowIndex) =>
    sectionRow.section.items.map((item, itemIndex) => ({
      section_id: savedSections?.[sectionRowIndex]?.id,
      name: item.name ?? null,
      description: item.description ?? null,
      drawing_ref: item.drawingRef ?? null,
      category: item.category ?? null,
      material_type: item.materialType ?? null,
      qty: item.qty,
      unit: item.unit ?? null,
      unit_cost: item.unitCost,
      ignored: item.ignored ?? false,
      no_print: item.noPrint ?? false,
      sort_order: item.sortOrder ?? itemIndex
    }))
  ).filter((row) => row.section_id);
  if (!itemRows.length) return;

  const { error: itemError } = await client.from("estimate_items").insert(itemRows);
  if (itemError) throw itemError;
}

export async function saveEstimateSubItems(
  estimateId: string,
  subItems: SubcontractorItem[],
  client: SupabaseEstimateClient | null = supabase
): Promise<void> {
  if (!client) return;
  const deleteRes = await client.from("estimate_subcontractor_items").delete().eq("estimate_id", estimateId);
  if (deleteRes.error) throw deleteRes.error;
  if (!subItems.length) return;

  const { error } = await client.from("estimate_subcontractor_items").insert(
    subItems.map((item, index) => ({
      estimate_id: estimateId,
      description: item.description ?? null,
      cost: item.cost,
      markup_pct: item.markupPct,
      sort_order: item.sortOrder ?? index
    }))
  );
  if (error) throw error;
}

export async function saveEstimateAlternates(
  estimateId: string,
  alternates: EstimateAlternate[],
  client: SupabaseEstimateClient | null = supabase
): Promise<void> {
  if (!client) return;
  const deleteRes = await client.from("estimate_alternates").delete().eq("estimate_id", estimateId);
  if (deleteRes.error) throw deleteRes.error;
  if (!alternates.length) return;

  const { error } = await client.from("estimate_alternates").insert(
    alternates.map((alternate, index) => ({
      estimate_id: estimateId,
      description: alternate.description,
      amount: alternate.amount,
      sort_order: alternate.sortOrder ?? index
    }))
  );
  if (error) throw error;
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
