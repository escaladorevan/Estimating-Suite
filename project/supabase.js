// Supabase client — loaded as plain <script> before Babel processes JSX
// Legacy prototype Supabase bridge.
// Production persistence belongs in src/lib/*-repository.ts.
// Do not add production behavior here unless explicitly asked to work on the legacy prototype.

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

// ── Area helpers (V2) ─────────────────────────────────────────────────────────

async function getAreas(bidId) {
  return window.sb.from('areas').select('*').eq('bid_id', bidId).order('sort_order');
}

async function addArea(bidId, { name = 'New Area', qty = 1, sort_order = 0 } = {}) {
  return window.sb.from('areas')
    .insert({ bid_id: bidId, name, qty, sort_order })
    .select().single();
}

async function updateArea(areaId, fields) {
  return window.sb.from('areas').update(fields).eq('id', areaId);
}

async function deleteArea(areaId) {
  // Cascades to sections + line_items via FK ON DELETE CASCADE
  return window.sb.from('areas').delete().eq('id', areaId);
}

// ── Section helpers (V2) ──────────────────────────────────────────────────────

async function getSections(areaId) {
  return window.sb.from('sections').select('*').eq('area_id', areaId).order('sort_order');
}

async function getAllSections(areaIds) {
  // Load sections for multiple areas in one query (used when assembling full bid tree).
  if (!areaIds || !areaIds.length) return { data: [], error: null };
  return window.sb.from('sections').select('*').in('area_id', areaIds).order('sort_order');
}

async function addSection(areaId, { name = 'New Section', sort_order = 0 } = {}) {
  return window.sb.from('sections')
    .insert({ area_id: areaId, name, sort_order })
    .select().single();
}

async function updateSection(sectionId, fields) {
  return window.sb.from('sections').update(fields).eq('id', sectionId);
}

async function deleteSection(sectionId) {
  // Cascades to line_items via FK ON DELETE CASCADE
  return window.sb.from('sections').delete().eq('id', sectionId);
}

// ── Line item helpers ─────────────────────────────────────────────────────────

async function getLineItems(bidId) {
  return window.sb.from('line_items').select('*').eq('bid_id', bidId).order('sort_order');
}

async function addLineItem({ bid_id, area_id, section_id, section, description, qty, unit, unit_cost, sort_order, drawing_ref, ignore, no_print }) {
  // NEVER include 'total' — it is GENERATED ALWAYS AS (qty * unit_cost) STORED
  const payload = {
    bid_id,
    description,
    qty: qty || 1,
    unit: unit || 'EA',
    unit_cost: unit_cost || 0,
    sort_order: sort_order || 0,
  };
  if (area_id     !== undefined) payload.area_id     = area_id;
  if (section_id  !== undefined) payload.section_id  = section_id;
  if (section     !== undefined) payload.section     = section;
  if (drawing_ref !== undefined) payload.drawing_ref = drawing_ref;
  if (ignore      !== undefined) payload.ignore      = ignore;
  if (no_print    !== undefined) payload.no_print    = no_print;
  return window.sb.from('line_items').insert(payload).select().single();
}

async function updateLineItem(id, fields) {
  // Strip 'total' defensively — it is a generated column and cannot be set
  const { total: _t, ...safe } = fields;
  return window.sb.from('line_items').update(safe).eq('id', id);
}

async function deleteLineItem(id) {
  return window.sb.from('line_items').delete().eq('id', id);
}

// ── Library helpers ───────────────────────────────────────────────────────────

async function getLibraryItems(filters = {}) {
  let q = window.sb.from('library_items').select('*').order('category').order('description');
  if (filters.category) q = q.eq('category', filters.category);
  return q;
}

async function upsertLibraryItem(fields) {
  return window.sb.from('library_items').upsert(fields).select().single();
}

// ── Job helpers ───────────────────────────────────────────────────────────────

async function getJobs() {
  return window.sb.from('jobs').select('*').order('created_at', { ascending: false });
}

async function getJob(id) {
  return window.sb.from('jobs').select('*').eq('id', id).single();
}

async function getJobByBidId(bidId) {
  return window.sb.from('jobs').select('*').eq('opportunity_id', bidId).maybeSingle();
}

async function updateJob(id, fields) {
  return window.sb.from('jobs').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id).select().single();
}

async function addChangeOrder({ job_id, description, amount, status = 'Submitted' }) {
  return window.sb.from('change_orders').insert({ job_id, description, amount, status }).select().single();
}

async function updateChangeOrder(id, fields) {
  return window.sb.from('change_orders').update(fields).eq('id', id).select().single();
}

// ── Contact helpers ───────────────────────────────────────────────────────────

async function getContacts(role) {
  // role: 'gc' | 'owner' | 'sub' | 'field' | undefined (returns all contacts)
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

async function getAlternates(bidId) {
  return window.sb.from('bid_alternates').select('*').eq('bid_id', bidId).order('sort_order');
}

async function addAlternate(bidId, { description = '', qty = 1, unit = 'lump sum', price = 0, sort_order = 0 } = {}) {
  return window.sb.from('bid_alternates')
    .insert({ bid_id: bidId, description, qty, unit, price, sort_order })
    .select().single();
}

async function updateAlternate(id, fields) {
  return window.sb.from('bid_alternates').update(fields).eq('id', id);
}

async function deleteAlternate(id) {
  return window.sb.from('bid_alternates').delete().eq('id', id);
}

// ── Estimate data helpers (iframe bridge) ─────────────────────────────────────

async function getEstimateData(bidId) {
  const { data, error } = await window.sb.from('bids').select('estimate_data').eq('id', bidId).single();
  return { data: data?.estimate_data, error };
}

async function saveEstimateData(bidId, estimateData) {
  const { error } = await window.sb.from('bids')
    .update({ estimate_data: estimateData, updated_at: new Date().toISOString() })
    .eq('id', bidId);
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
