// Supabase client — loaded as plain <script> before Babel processes JSX
const SUPABASE_URL = 'https://tapnbdorfxfdjmcwifzj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhcG5iZG9yZnhmZGptY3dpZnpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczODgzNzUsImV4cCI6MjA5Mjk2NDM3NX0.sfflLwHEIQFmgbLlljJS51BdKCjqO-9BZWlH4-Wvs3s';

const { createClient } = window.supabase;
window.sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Query Helpers ─────────────────────────────────────────────────────────────
// All helpers return { data, error } matching Supabase JS v2 conventions.
// IMPORTANT: Never include line_items.total in INSERT/UPDATE — it is GENERATED ALWAYS AS.

// ── Bid helpers (backed by opportunities table) ───────────────────────────────
// The legacy schema used a `bids` table. The production schema uses `opportunities`.
// These helpers translate between the old bid shape and the new opportunities schema.

const STATUS_TO_STAGE = {
  'Lead / ITB':  'ITB',
  'New':         'ITB',
  'Pricing':     'Takeoff/Pricing',
  'Estimating':  'Takeoff/Pricing',
  'Review / Send': 'Review',
  'Submitted':   'Submit',
  'Follow Up':   'Submit',
  'Won':         'Won',
  'Lost':        'Lost',
  'Cold':        'Lost',
  'Archived':    'Lost',
};

const STAGE_TO_STATUS = {
  'ITB':             'Lead / ITB',
  'Takeoff/Pricing': 'Pricing',
  'Review':          'Review / Send',
  'Submit':          'Submitted',
  'Won':             'Won',
  'Lost':            'Lost',
};

function opportunityToBid(row) {
  return {
    id:              row.id,
    number:          row.opportunity_number,
    name:            row.project_name,
    gc_name:         row.client,
    stage:           STATUS_TO_STAGE[row.status] || row.status,
    due_date:        row.bid_due_date,
    estimated_value: row.estimated_value,
    project_type:    row.job_type,
    notes:           row.notes,
    created_at:      row.created_at,
    updated_at:      row.updated_at,
  };
}

const OPP_COLUMNS = 'id, opportunity_number, project_name, client, status, bid_due_date, estimated_value, job_type, notes, created_at, updated_at';

async function getBids() {
  const { data, error } = await window.sb.from('opportunities')
    .select(OPP_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) return { data: null, error };
  return { data: data.map(opportunityToBid), error: null };
}

async function getBid(bidId) {
  const { data, error } = await window.sb.from('opportunities')
    .select(OPP_COLUMNS)
    .eq('id', bidId)
    .single();
  if (error) return { data: null, error };
  return { data: opportunityToBid(data), error: null };
}

async function addBid({ gc_name, name, due_date, project_type }) {
  const year = new Date().getFullYear().toString().slice(-2);
  const seq = String(Date.now()).slice(-3);
  const opportunity_number = `B${year}-${seq}`;
  const { data, error } = await window.sb.from('opportunities')
    .insert({
      opportunity_number,
      project_name: name,
      client: gc_name || 'Unknown',
      bid_due_date: due_date || null,
      job_type: project_type || null,
      status: 'Lead / ITB',
    })
    .select(OPP_COLUMNS)
    .single();
  if (error) return { data: null, error };
  return { data: opportunityToBid(data), error: null };
}

// STAGE_NEXT maps current stage → next stage for the advance button.
// Submit has no single next — caller must pass 'Won' or 'Lost' explicitly.
const STAGE_NEXT = {
  'ITB':             'Takeoff/Pricing',
  'Takeoff/Pricing': 'Review',
  'Review':          'Submit',
  'Submit':          null,
};

async function updateBidStage(bidId, stage) {
  const status = STAGE_TO_STATUS[stage] || stage;
  return window.sb.from('opportunities')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', bidId);
}

async function markBidWon(bid) {
  const now = new Date().toISOString();
  const { error: stageErr } = await window.sb.from('opportunities')
    .update({ status: 'Won', updated_at: now })
    .eq('id', bid.id);
  if (stageErr) return { data: null, error: stageErr };

  const { data: existing, error: existingErr } = await getJobByBidId(bid.id);
  if (existingErr) return { data: null, error: existingErr };
  if (existing) return { data: existing, error: null };

  const rawNum = bid.number ? bid.number.replace(/^B/, 'J') : `J-${String(Date.now()).slice(-6)}`;
  const jobPayload = {
    opportunity_id:  bid.id,
    job_number:      rawNum,
    project_name:    bid.name || 'Untitled Job',
    client:          bid.gc_name || 'Unknown',
    base_contract:   0,
    backlog_status:  'Awarded / Waiting',
  };

  return window.sb.from('jobs').insert(jobPayload).select().single();
}

// Fields the legacy views use on a bid that map to opportunities columns.
const BID_TO_OPP_FIELD = {
  name:            'project_name',
  gc_name:         'client',
  project_type:    'job_type',
  due_date:        'bid_due_date',
  estimated_value: 'estimated_value',
  notes:           'notes',
  stage:           'status',  // translated below via STAGE_TO_STATUS
};

// Fields that lived in bids but have no column in opportunities yet (estimates data).
// We drop them silently so the save doesn't error.
const BID_FIELDS_NOT_IN_OPP = new Set([
  'oh_pct', 'del_pct', 'ins_pct', 'estimator', 'doc_type', 'attention',
  'po_number', 'terms', 'drawings_dated', 'bid_docs', 'exclusions',
  'clarifications', 'general_terms', 'warranty', 'finish_terms',
  'hardware_terms', 'fab_note', 'pricing_mode', 'delivery_date',
  'specs_dated', 'addendums', 'address', 'ship_via', 'number',
]);

function translateBidFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (BID_FIELDS_NOT_IN_OPP.has(k)) continue;
    const mapped = BID_TO_OPP_FIELD[k];
    if (mapped) {
      out[mapped] = (k === 'stage') ? (STAGE_TO_STATUS[v] || v) : v;
    } else {
      out[k] = v;  // pass through any already-correct column name
    }
  }
  return out;
}

async function updateBid(bidId, fields) {
  const translated = translateBidFields(fields);
  if (Object.keys(translated).length === 0) return { data: null, error: null };
  return window.sb.from('opportunities')
    .update({ ...translated, updated_at: new Date().toISOString() })
    .eq('id', bidId);
}

async function updateBidInfo(bidId, fields) {
  const translated = translateBidFields(fields);
  if (Object.keys(translated).length === 0) return { data: null, error: null };
  return window.sb.from('opportunities')
    .update({ ...translated, updated_at: new Date().toISOString() })
    .eq('id', bidId);
}

async function updateBidTerms(bidId, columnName, jsonbArray) {
  if (BID_FIELDS_NOT_IN_OPP.has(columnName)) return { data: null, error: null };
  return window.sb.from('opportunities')
    .update({ [columnName]: jsonbArray, updated_at: new Date().toISOString() })
    .eq('id', bidId);
}

// ── Estimate bridge ───────────────────────────────────────────────────────────
// Areas/sections/items/alternates now belong to an estimate record, not a bid.
// These helpers transparently find or create the estimate so calling views
// can still pass bidId (opportunity id) without knowing about estimate_id.

const _estimateIdCache = {};

async function getEstimateIdForBid(bidId) {
  if (_estimateIdCache[bidId]) return { id: _estimateIdCache[bidId], error: null };
  const { data, error } = await window.sb.from('estimates')
    .select('id')
    .eq('opportunity_id', bidId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.id) _estimateIdCache[bidId] = data.id;
  return { id: data?.id || null, error };
}

async function getOrCreateEstimateForBid(bidId) {
  const { id, error } = await getEstimateIdForBid(bidId);
  if (error) return { id: null, error };
  if (id) return { id, error: null };

  const { data: opp, error: oppErr } = await window.sb.from('opportunities')
    .select('project_name, client')
    .eq('id', bidId)
    .single();
  if (oppErr) return { id: null, error: oppErr };

  const { data: est, error: estErr } = await window.sb.from('estimates')
    .insert({ opportunity_id: bidId, project_name: opp.project_name, client: opp.client })
    .select('id')
    .single();
  if (estErr) return { id: null, error: estErr };
  _estimateIdCache[bidId] = est.id;
  return { id: est.id, error: null };
}

// ── Area helpers ──────────────────────────────────────────────────────────────

async function getAreas(bidId) {
  const { id: estId, error } = await getOrCreateEstimateForBid(bidId);
  if (error) return { data: null, error };
  return window.sb.from('estimate_areas').select('*').eq('estimate_id', estId).order('sort_order');
}

async function addArea(bidId, { name = 'New Area', qty = 1, sort_order = 0 } = {}) {
  const { id: estId, error } = await getOrCreateEstimateForBid(bidId);
  if (error) return { data: null, error };
  return window.sb.from('estimate_areas')
    .insert({ estimate_id: estId, name, qty, sort_order })
    .select().single();
}

async function updateArea(areaId, fields) {
  return window.sb.from('estimate_areas').update(fields).eq('id', areaId);
}

async function deleteArea(areaId) {
  return window.sb.from('estimate_areas').delete().eq('id', areaId);
}

// ── Section helpers ───────────────────────────────────────────────────────────

async function getSections(areaId) {
  return window.sb.from('estimate_sections').select('*').eq('area_id', areaId).order('sort_order');
}

async function getAllSections(areaIds) {
  if (!areaIds || !areaIds.length) return { data: [], error: null };
  return window.sb.from('estimate_sections').select('*').in('area_id', areaIds).order('sort_order');
}

async function addSection(areaId, { name = 'New Section', sort_order = 0 } = {}) {
  return window.sb.from('estimate_sections')
    .insert({ area_id: areaId, name, sort_order })
    .select().single();
}

async function updateSection(sectionId, fields) {
  return window.sb.from('estimate_sections').update(fields).eq('id', sectionId);
}

async function deleteSection(sectionId) {
  return window.sb.from('estimate_sections').delete().eq('id', sectionId);
}

// ── Line item helpers ─────────────────────────────────────────────────────────
// estimate_items: section_id FK only; name (not description); ignored (not ignore).
// bid_id and area_id no longer exist on this table.

async function getLineItems(bidId) {
  const { id: estId, error } = await getOrCreateEstimateForBid(bidId);
  if (error) return { data: null, error };
  const { data: areas } = await window.sb.from('estimate_areas').select('id').eq('estimate_id', estId);
  if (!areas?.length) return { data: [], error: null };
  const { data: secs } = await window.sb.from('estimate_sections').select('id').in('area_id', areas.map(a => a.id));
  if (!secs?.length) return { data: [], error: null };
  return window.sb.from('estimate_items').select('*').in('section_id', secs.map(s => s.id)).order('sort_order');
}

async function addLineItem({ section_id, description, qty, unit, unit_cost, sort_order, drawing_ref, ignore, no_print }) {
  const payload = {
    section_id,
    name: description,
    qty: qty || 1,
    unit: unit || 'EA',
    unit_cost: unit_cost || 0,
    sort_order: sort_order || 0,
  };
  if (drawing_ref !== undefined) payload.drawing_ref = drawing_ref;
  if (ignore      !== undefined) payload.ignored     = ignore;
  if (no_print    !== undefined) payload.no_print    = no_print;
  return window.sb.from('estimate_items').insert(payload).select().single();
}

async function updateLineItem(id, fields) {
  const { total: _t, bid_id: _b, area_id: _a, section: _s, description, ignore, ...rest } = fields;
  const safe = { ...rest };
  if (description !== undefined) safe.name    = description;
  if (ignore      !== undefined) safe.ignored = ignore;
  return window.sb.from('estimate_items').update(safe).eq('id', id);
}

async function deleteLineItem(id) {
  return window.sb.from('estimate_items').delete().eq('id', id);
}

// ── Library helpers ───────────────────────────────────────────────────────────
// pricing_library_items: name (not description).

async function getLibraryItems(filters = {}) {
  let q = window.sb.from('pricing_library_items').select('*').eq('active', true).order('category').order('name');
  if (filters.category) q = q.eq('category', filters.category);
  const { data, error } = await q;
  if (error) return { data: null, error };
  return { data: data.map(r => ({ ...r, description: r.name })), error: null };
}

async function upsertLibraryItem(fields) {
  const { description, ...rest } = fields;
  const payload = { ...rest };
  if (description !== undefined) payload.name = description;
  return window.sb.from('pricing_library_items').upsert(payload).select().single();
}

// ── Job helpers ───────────────────────────────────────────────────────────────
// jobs: job_number (not number), project_name (not name), client (not gc_name),
//       base_contract (not contract_value), backlog_status (not status).
// notes is in pm_notes — strip it from updates to avoid schema errors.

const JOB_TO_LEGACY = {
  job_number:     'number',
  project_name:   'name',
  client:         'gc_name',
  base_contract:  'contract_value',
  backlog_status: 'status',
};

const LEGACY_TO_JOB = {
  number:         'job_number',
  name:           'project_name',
  gc_name:        'client',
  contract_value: 'base_contract',
  status:         'backlog_status',
};

const JOB_FIELDS_NOT_IN_TABLE = new Set(['notes', 'gc_name', 'name', 'number', 'contract_value', 'status']);

function jobRowToLegacy(row) {
  const out = { ...row };
  for (const [newCol, oldCol] of Object.entries(JOB_TO_LEGACY)) {
    out[oldCol] = row[newCol];
  }
  return out;
}

function translateJobFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (JOB_FIELDS_NOT_IN_TABLE.has(k)) continue;
    out[LEGACY_TO_JOB[k] || k] = v;
  }
  return out;
}

async function getJobs() {
  const { data, error } = await window.sb.from('jobs').select('*').order('created_at', { ascending: false });
  if (error) return { data: null, error };
  return { data: data.map(jobRowToLegacy), error: null };
}

async function getJob(id) {
  const { data, error } = await window.sb.from('jobs').select('*').eq('id', id).single();
  if (error) return { data: null, error };
  return { data: jobRowToLegacy(data), error: null };
}

async function getJobByBidId(bidId) {
  const { data, error } = await window.sb.from('jobs').select('*').eq('opportunity_id', bidId).maybeSingle();
  if (error) return { data: null, error };
  return { data: data ? jobRowToLegacy(data) : null, error: null };
}

async function updateJob(id, fields) {
  const translated = translateJobFields(fields);
  const { data, error } = await window.sb.from('jobs')
    .update({ ...translated, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) return { data: null, error };
  return { data: jobRowToLegacy(data), error: null };
}

async function addChangeOrder({ job_id, description, amount, status = 'submitted' }) {
  const number = `CO-${String(Date.now()).slice(-5)}`;
  const normalizedStatus = status.toLowerCase();
  return window.sb.from('change_orders')
    .insert({ job_id, number, description, amount, status: normalizedStatus })
    .select().single();
}

async function updateChangeOrder(id, fields) {
  return window.sb.from('change_orders').update(fields).eq('id', id).select().single();
}

// ── Contact helpers ───────────────────────────────────────────────────────────

async function getContacts(role) {
  let q = window.sb.from('contacts').select('*').order('name');
  if (role) q = q.eq('role', role);
  return q;
}

async function addContact({ name, company, role, phone, email, notes }) {
  return window.sb.from('contacts')
    .insert({ name, company, role, phone, email, notes })
    .select().single();
}

async function updateContact(id, fields) {
  return window.sb.from('contacts')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id);
}

// ── Alternate helpers ─────────────────────────────────────────────────────────
// estimate_alternates: estimate_id (not bid_id); amount (not price); no qty/unit.

async function getAlternates(bidId) {
  const { id: estId, error } = await getOrCreateEstimateForBid(bidId);
  if (error) return { data: null, error };
  return window.sb.from('estimate_alternates').select('*').eq('estimate_id', estId).order('sort_order');
}

async function addAlternate(bidId, { description = '', price = 0, amount, sort_order = 0 } = {}) {
  const { id: estId, error } = await getOrCreateEstimateForBid(bidId);
  if (error) return { data: null, error };
  return window.sb.from('estimate_alternates')
    .insert({ estimate_id: estId, description, amount: amount ?? price, sort_order })
    .select().single();
}

async function updateAlternate(id, fields) {
  const { bid_id: _b, qty: _q, unit: _u, price, ...rest } = fields;
  const payload = { ...rest };
  if (price !== undefined && payload.amount === undefined) payload.amount = price;
  return window.sb.from('estimate_alternates').update(payload).eq('id', id);
}

async function deleteAlternate(id) {
  return window.sb.from('estimate_alternates').delete().eq('id', id);
}

// ── Estimate data helpers (iframe bridge) ─────────────────────────────────────
// Old: stored as JSONB blob in bids.estimate_data.
// New: stored as rows in estimate_snapshots with estimate_id FK.

async function getEstimateData(bidId) {
  const { id: estId, error: estErr } = await getEstimateIdForBid(bidId);
  if (estErr || !estId) return { data: null, error: estErr };
  const { data, error } = await window.sb.from('estimate_snapshots')
    .select('snapshot')
    .eq('estimate_id', estId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data: data?.snapshot || null, error };
}

async function saveEstimateData(bidId, estimateData) {
  const { id: estId, error: estErr } = await getOrCreateEstimateForBid(bidId);
  if (estErr) return { error: estErr };
  const { error } = await window.sb.from('estimate_snapshots')
    .insert({ estimate_id: estId, snapshot: estimateData });
  return { error };
}

// ── Global export ─────────────────────────────────────────────────────────────

window.dbHelpers = {
  // Bids
  getBids, getBid, addBid, updateBidStage, markBidWon, updateBid, updateBidInfo, updateBidTerms, STAGE_NEXT,
  // Areas
  getAreas, addArea, updateArea, deleteArea,
  // Sections
  getSections, getAllSections, addSection, updateSection, deleteSection,
  // Line items
  getLineItems, addLineItem, updateLineItem, deleteLineItem,
  // Library
  getLibraryItems, upsertLibraryItem,
  // Jobs
  getJobs, getJob, getJobByBidId, updateJob, addChangeOrder, updateChangeOrder,
  // Contacts
  getContacts, addContact, updateContact,
  // Alternates
  getAlternates, addAlternate, updateAlternate, deleteAlternate,
  // Estimate data (iframe bridge)
  getEstimateData, saveEstimateData,
};
