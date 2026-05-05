// Supabase client — loaded as plain <script> before Babel processes JSX
const SUPABASE_URL = 'https://tapnbdorfxfdjmcwifzj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhcG5iZG9yZnhmZGptY3dpZnpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczODgzNzUsImV4cCI6MjA5Mjk2NDM3NX0.sfflLwHEIQFmgbLlljJS51BdKCjqO-9BZWlH4-Wvs3s';

const { createClient } = window.supabase;
window.sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Query Helpers ─────────────────────────────────────────────────────────────
// All helpers return { data, error } matching Supabase JS v2 conventions.
// IMPORTANT: Never include line_items.total in INSERT/UPDATE — it is GENERATED ALWAYS AS.

// ── Bid helpers ───────────────────────────────────────────────────────────────

async function getBids() {
  return window.sb.from('bids').select('*').order('created_at', { ascending: false });
}

async function getBid(bidId) {
  return window.sb.from('bids').select('*').eq('id', bidId).single();
}

async function addBid({ gc_name, name, due_date, project_type }) {
  const year = new Date().getFullYear().toString().slice(-2);
  const seq = String(Date.now()).slice(-3);
  const number = `B${year}-${seq}`;
  return window.sb.from('bids')
    .insert({ number, name, gc_name, due_date, project_type, stage: 'ITB' })
    .select().single();
}

// STAGE_NEXT maps current stage → next stage for the advance button.
// Submit has no single next — caller must pass 'Won' or 'Lost' explicitly.
const STAGE_NEXT = {
  'ITB': 'Takeoff/Pricing',
  'Takeoff/Pricing': 'Review',
  'Review': 'Submit',
  'Submit': null,
};

async function updateBidStage(bidId, stage) {
  // stage must be one of: 'ITB','Takeoff/Pricing','Review','Submit','Won','Lost'
  return window.sb.from('bids')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', bidId);
}

async function markBidWon(bid) {
  const now = new Date().toISOString();
  const { error: stageErr } = await window.sb.from('bids')
    .update({ stage: 'Won', updated_at: now })
    .eq('id', bid.id);
  if (stageErr) return { data: null, error: stageErr };

  const { data: existing, error: existingErr } = await getJobByBidId(bid.id);
  if (existingErr) return { data: null, error: existingErr };
  if (existing) return { data: existing, error: null };

  const jobPayload = {
    bid_id: bid.id,
    number: bid.number ? bid.number.replace(/^B/, 'J') : `J-${String(Date.now()).slice(-6)}`,
    name: bid.name || 'Untitled Job',
    gc_name: bid.gc_name || null,
    status: 'Ready',
    contract_value: null,
  };

  return window.sb.from('jobs').insert(jobPayload).select().single();
}

async function updateBid(bidId, fields) {
  // General-purpose bid update — accepts any column subset.
  return window.sb.from('bids')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', bidId);
}

async function updateBidInfo(bidId, fields) {
  // V2 alias for updateBid — accepts estimator metadata columns:
  // oh_pct, del_pct, ins_pct, doc_type, attention, po_number, terms,
  // drawings_dated, bid_docs, estimator, exclusions, clarifications,
  // general_terms, warranty, finish_terms, hardware_terms, fab_note,
  // pricing_mode, delivery_date, specs_dated, addendums
  return window.sb.from('bids')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', bidId);
}

async function updateBidTerms(bidId, columnName, jsonbArray) {
  // Targeted JSONB array update for exclusions/clarifications/terms fields.
  // columnName: 'exclusions' | 'clarifications' | 'general_terms' |
  //             'warranty' | 'finish_terms' | 'hardware_terms' | 'fab_note'
  // jsonbArray: array of { text, active, sub } objects
  return window.sb.from('bids')
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
  return window.sb.from('jobs').select('*').eq('bid_id', bidId).maybeSingle();
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
};
