// Estimator workbook — V2 parity: areas → sections → items, full alternates, V2 sidebar
const { useState: uS_est, useMemo: uM_est, useEffect: uE_est, useRef: uR_est } = React;

// ── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULT_EXCLUSIONS = [
  'Demolition of existing casework or construction',
  'Preparation and finishing of drywall, painting',
  'Flooring (except as specified in casework design)',
  'Plumbing and electrical (rough and trim)',
  'Window treatments and hardware not integrated into casework',
  'Appliances and equipment (unless specified as included)',
  'Rubber base, cove base, or floor trim',
  'Corner guards',
  'Site finishing or patching of walls/ceilings',
  'FRP panels and glazing/glass',
].map(text => ({ text, active: true, sub: false }));

const DEFAULT_CLARIFICATIONS = [
  'Blum 125° concealed hinges, satin nickel',
  'Brushed chrome pulls (standard hardware)',
  'Accuride 3832 drawer slides',
  '5mm shelf pin system',
  'Dowel-and-screw joinery throughout',
  'Net 30 payment terms',
  'F&S standard construction methods',
  'Lead time per project schedule',
].map(text => ({ text, active: true, sub: false }));

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) { if (n == null || isNaN(n)) return '—'; return '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 }); }

function migrateAlt(alt) {
  if (alt.sections && alt.sections.length > 0) return alt;
  const item = (alt.price != null && alt.price !== 0) ? {
    id: crypto.randomUUID(), desc: alt.description || 'Scope',
    qty: alt.qty || 1, unit: alt.unit || 'LS',
    unit_cost: alt.price || 0, drawing_ref: '', ignore: false, no_print: false,
  } : null;
  return {
    ...alt,
    sections: item ? [{ id: crypto.randomUUID(), name: 'Scope', items: [item] }] : [],
    apply_oh:  alt.apply_oh  ?? true,
    apply_del: alt.apply_del ?? true,
    apply_ins: alt.apply_ins ?? true,
    del_pct:   alt.del_pct  ?? null,
    ins_pct:   alt.ins_pct  ?? null,
  };
}

function migrateTerms(raw, defaults) {
  if (!raw || !raw.length) return defaults;
  if (typeof raw[0] === 'string') return raw.map(t => ({ text: t, active: true, sub: false }));
  return raw;
}

function calcBid(tree, bid) {
  const mat = (tree || []).reduce((sum, area) => {
    if (area.ignore) return sum;
    const aQty = area.qty || 1;
    return sum + (area.sections || []).reduce((s2, sec) => {
      if (sec.ignore) return s2;
      return s2 + (sec.items || []).reduce((s3, it) => {
        if (it.ignore) return s3;
        return s3 + (it.qty || 0) * (it.unit_cost || 0) * aQty;
      }, 0);
    }, 0);
  }, 0);
  const ohPct  = (bid?.oh_pct  ?? 15) / 100;
  const delPct = (bid?.del_pct ??  5) / 100;
  const insPct = (bid?.ins_pct ?? 20) / 100;
  const oh = mat * ohPct;
  const matOh = mat + oh;
  return { mat, oh, matOh, del: matOh * delPct, ins: matOh * insPct, total: matOh * (1 + delPct + insPct) };
}

function calcAlt(alt, bid) {
  const mat = (alt.sections || []).reduce((s, sec) =>
    s + (sec.items || []).filter(it => !it.ignore).reduce((s2, it) =>
      s2 + (it.qty || 0) * (it.unit_cost || 0), 0), 0);
  const ohPct  = alt.apply_oh  ? (bid?.oh_pct  ?? 15) / 100 : 0;
  const delPct = alt.apply_del ? (alt.del_pct  ?? bid?.del_pct ?? 5)  / 100 : 0;
  const insPct = alt.apply_ins ? (alt.ins_pct  ?? bid?.ins_pct ?? 20) / 100 : 0;
  const matOh  = mat * (1 + ohPct);
  return { mat, matOh, del: matOh * delPct, ins: matOh * insPct, total: matOh * (1 + delPct + insPct) };
}

// ── ZZTakeoff parser ──────────────────────────────────────────────────────────
function parseZZTakeoff(rows) {
  let hdrIdx = -1, cols = {};
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i].map(c => String(c).toLowerCase());
    if (r.some(c => c === 'name' || c === 'group')) { hdrIdx = i; break; }
  }
  if (hdrIdx < 0) return null;
  const hdr = rows[hdrIdx].map(c => String(c).toLowerCase());
  cols.name = hdr.findIndex(c => c === 'name' || c === 'group');
  cols.qty  = hdr.findIndex(c => c === 'qty' || c === 'measurement 1');
  cols.unit = hdr.findIndex(c => c === 'unit' || c === 'units 1');
  cols.cost = hdr.findIndex(c => c === 'cost each' || c === 'unit cost');
  const isFormatA = cols.cost >= 0;
  const areas = [];
  let cur = null;
  for (let i = hdrIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r[cols.name] || '').trim();
    if (!name) continue;
    const unitVal = cols.unit >= 0 ? String(r[cols.unit] || '').trim() : '';
    const costVal = cols.cost >= 0 ? parseFloat(r[cols.cost]) : NaN;
    const isArea  = isFormatA ? isNaN(costVal) : !unitVal;
    if (isArea) { cur = { name, checked: true, items: [] }; areas.push(cur); }
    else if (cur) {
      cur.items.push({ desc: name, checked: true, qty: parseFloat(r[cols.qty]) || 1, unit: unitVal || 'EA', unitCost: isNaN(costVal) ? 0 : costVal });
    }
  }
  return areas.length ? areas : null;
}

// ── Main component ────────────────────────────────────────────────────────────
function EstimatorView({ activeBidId }) {
  const [bid,             setBid]             = uS_est(null);
  const [tree,            setTree]            = uS_est(null);
  const [activeAreaId,    setActiveAreaId]    = uS_est(null);
  const [activeSectionId, setActiveSectionId] = uS_est(null);
  const [libItems,        setLibItems]        = uS_est(null);
  const [libQ,            setLibQ]            = uS_est('');
  const [libCat,          setLibCat]          = uS_est('');
  const [centerView,      setCenterView]      = uS_est('grid');
  const [alts,            setAlts]            = uS_est(null);
  const [activeAltId,     setActiveAltId]     = uS_est(null);
  const [activeAltSecId,  setActiveAltSecId]  = uS_est(null);
  const [termsTab,        setTermsTab]        = uS_est('general_terms');
  const [zzPreview,       setZZPreview]       = uS_est(null);
  const [zzImporting,     setZZImporting]     = uS_est(false);
  const [showPDFPreview,  setShowPDFPreview]  = uS_est(false);
  const [drafts,          setDrafts]          = uS_est({});   // { [sectionId]: {desc,qty,unit,unitCost,drawingRef} }
  const [altDrafts,       setAltDrafts]       = uS_est({});  // { [sectionId]: draft } for alt sections
  const saveTimer                             = uR_est(null);

  // ── Load bid metadata ──────────────────────────────────────────────────────
  uE_est(() => {
    if (!activeBidId) { setBid(null); return; }
    window.dbHelpers.getBid(activeBidId).then(({ data }) => { if (data) setBid(data); });
  }, [activeBidId]);

  // ── Load tree ─────────────────────────────────────────────────────────────
  uE_est(() => {
    if (!activeBidId) { setTree([]); return; }
    setTree(null);
    let cancelled = false;
    async function load() {
      const { data: areas } = await window.dbHelpers.getAreas(activeBidId);
      if (!areas || cancelled) return;
      const [{ data: sections }, { data: items }] = await Promise.all([
        window.dbHelpers.getAllSections(areas.map(a => a.id)),
        window.dbHelpers.getLineItems(activeBidId),
      ]);
      if (cancelled) return;
      const itemsBySec = {};
      for (const it of (items || [])) { (itemsBySec[it.section_id] ||= []).push(it); }
      const secsByArea = {};
      for (const s of (sections || [])) { (secsByArea[s.area_id] ||= []).push({ ...s, items: itemsBySec[s.id] || [] }); }
      const assembled = areas.map(a => ({ ...a, sections: secsByArea[a.id] || [] }));
      setTree(assembled);
      if (assembled.length > 0) {
        setActiveAreaId(prev => prev || assembled[0].id);
        const firstSec = assembled[0].sections[0];
        if (firstSec) setActiveSectionId(prev => prev || firstSec.id);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [activeBidId]);

  // ── Load alternates ────────────────────────────────────────────────────────
  uE_est(() => {
    if (!activeBidId) { setAlts([]); return; }
    window.dbHelpers.getAlternates(activeBidId).then(({ data }) => {
      setAlts((data || []).map(migrateAlt));
    });
  }, [activeBidId]);

  // ── Load library ──────────────────────────────────────────────────────────
  uE_est(() => {
    let cancelled = false;
    window.dbHelpers.getLibraryItems().then(({ data }) => { if (!cancelled) setLibItems(data || []); });
    return () => { cancelled = true; };
  }, []);

  const fuse = uM_est(() => {
    if (!libItems?.length || typeof window.Fuse !== 'function') return null;
    return new window.Fuse(libItems, { keys: ['description', 'code', 'category'], threshold: 0.3 });
  }, [libItems]);

  const libResults = uM_est(() => {
    let base = libItems || [];
    if (libCat) base = base.filter(l => l.category === libCat);
    if (!libQ || !fuse) return base;
    return fuse.search(libQ).map(r => r.item).filter(l => !libCat || l.category === libCat);
  }, [libQ, libCat, fuse, libItems]);

  const libCats = uM_est(() => {
    if (!libItems) return [];
    return [...new Set(libItems.map(l => l.category).filter(Boolean))].sort();
  }, [libItems]);

  const costs = uM_est(() => calcBid(tree, bid), [tree, bid]);

  // ── AREA CRUD ─────────────────────────────────────────────────────────────
  async function handleAddArea() {
    const { data: areaData } = await window.dbHelpers.addArea(activeBidId, { name: 'New Area', qty: 1, sort_order: (tree || []).length });
    if (!areaData) return;
    const { data: secData } = await window.dbHelpers.addSection(areaData.id, { name: 'Casework', sort_order: 0 });
    const newArea = { ...areaData, sections: secData ? [{ ...secData, items: [] }] : [] };
    setTree(prev => [...(prev || []), newArea]);
    setActiveAreaId(areaData.id);
    if (secData) setActiveSectionId(secData.id);
    setCenterView('grid');
  }

  async function handleAddSection(areaId) {
    const area = (tree || []).find(a => a.id === areaId);
    const { data } = await window.dbHelpers.addSection(areaId, { name: 'New Section', sort_order: (area?.sections || []).length });
    if (data) {
      setTree(prev => prev.map(a => a.id === areaId ? { ...a, sections: [...a.sections, { ...data, items: [] }] } : a));
      setActiveSectionId(data.id);
    }
  }

  async function handleDeleteArea(areaId) {
    if (!confirm('Delete area and all its sections and items?')) return;
    const { error } = await window.dbHelpers.deleteArea(areaId);
    if (!error) {
      setTree(prev => prev.filter(a => a.id !== areaId));
      if (activeAreaId === areaId) { setActiveAreaId(null); setActiveSectionId(null); }
    }
  }

  async function handleDeleteSection(areaId, sectionId) {
    if (!confirm('Delete section and all its items?')) return;
    const { error } = await window.dbHelpers.deleteSection(sectionId);
    if (!error) {
      setTree(prev => prev.map(a => a.id === areaId ? { ...a, sections: a.sections.filter(s => s.id !== sectionId) } : a));
      if (activeSectionId === sectionId) setActiveSectionId(null);
    }
  }

  async function handleToggleAreaFlag(areaId, flag) {
    const area = (tree || []).find(a => a.id === areaId);
    if (!area) return;
    const next = !area[flag];
    setTree(prev => prev.map(a => a.id === areaId ? { ...a, [flag]: next } : a));
    await window.dbHelpers.updateArea(areaId, { [flag]: next });
  }

  async function handleToggleSectionFlag(areaId, sectionId, flag) {
    const sec = (tree || []).flatMap(a => a.sections).find(s => s.id === sectionId);
    if (!sec) return;
    const next = !sec[flag];
    setTree(prev => prev.map(a => a.id === areaId ? {
      ...a, sections: a.sections.map(s => s.id === sectionId ? { ...s, [flag]: next } : s)
    } : a));
    await window.dbHelpers.updateSection(sectionId, { [flag]: next });
  }

  async function handleUpdateAreaField(areaId, field, value) {
    const parsed = field === 'qty' ? (parseInt(value) || 1) : value;
    setTree(prev => prev.map(a => a.id === areaId ? { ...a, [field]: parsed } : a));
    await window.dbHelpers.updateArea(areaId, { [field]: parsed });
  }

  async function handleUpdateSectionName(areaId, sectionId, name) {
    setTree(prev => prev.map(a => a.id === areaId ? {
      ...a, sections: a.sections.map(s => s.id === sectionId ? { ...s, name } : s)
    } : a));
    await window.dbHelpers.updateSection(sectionId, { name });
  }

  // ── ITEM CRUD ─────────────────────────────────────────────────────────────
  async function handleUpdateItem(areaId, sectionId, itemId, field, value) {
    const parsed = (field === 'qty' || field === 'unit_cost') ? parseFloat(value) || 0 : value;
    setTree(prev => prev.map(a => a.id === areaId ? {
      ...a, sections: a.sections.map(s => s.id === sectionId ? {
        ...s, items: s.items.map(it => it.id === itemId ? { ...it, [field]: parsed } : it)
      } : s)
    } : a));
    await window.dbHelpers.updateLineItem(itemId, { [field]: parsed });
  }

  async function handleToggleItemFlag(areaId, sectionId, itemId, flag) {
    const item = (tree || []).flatMap(a => a.sections).flatMap(s => s.items).find(it => it.id === itemId);
    if (!item) return;
    const next = !item[flag];
    setTree(prev => prev.map(a => a.id === areaId ? {
      ...a, sections: a.sections.map(s => s.id === sectionId ? {
        ...s, items: s.items.map(it => it.id === itemId ? { ...it, [flag]: next } : it)
      } : s)
    } : a));
    await window.dbHelpers.updateLineItem(itemId, { [flag]: next });
  }

  async function handleDeleteItem(areaId, sectionId, itemId) {
    if (!confirm('Delete this line item?')) return;
    const { error } = await window.dbHelpers.deleteLineItem(itemId);
    if (!error) setTree(prev => prev.map(a => a.id === areaId ? {
      ...a, sections: a.sections.map(s => s.id === sectionId ? {
        ...s, items: s.items.filter(it => it.id !== itemId)
      } : s)
    } : a));
  }

  // ── DRAFT ROW (Notion-style) ──────────────────────────────────────────────
  function getDraft(sectionId) {
    return drafts[sectionId] || { desc: '', qty: 1, unit: 'EA', unitCost: 0, drawingRef: '' };
  }
  function setDraft(sectionId, patch) {
    setDrafts(prev => ({ ...prev, [sectionId]: { ...getDraft(sectionId), ...patch } }));
  }
  async function handleCommitDraft(areaId, sectionId) {
    const d = getDraft(sectionId);
    if (!d.desc.trim()) return;
    const sec = (tree || []).flatMap(a => a.sections).find(s => s.id === sectionId);
    const { data, error } = await window.dbHelpers.addLineItem({
      bid_id: activeBidId, area_id: areaId, section_id: sectionId,
      description: d.desc.trim(), qty: d.qty || 1, unit: d.unit || 'EA',
      unit_cost: d.unitCost || 0, drawing_ref: d.drawingRef || '',
      sort_order: (sec?.items || []).length,
    });
    if (error) { console.error('addLineItem failed:', error); return; }
    if (data) {
      setTree(prev => prev.map(a => a.id === areaId ? {
        ...a, sections: a.sections.map(s => s.id === sectionId ? { ...s, items: [...s.items, data] } : s)
      } : a));
      setDrafts(prev => ({ ...prev, [sectionId]: null }));
    }
  }

  function handleAddItemClick(areaId, sectionId) {
    const input = document.querySelector(`[data-draft-desc="${sectionId}"]`);
    if (input) input.focus();
  }

  // ── MARKUP % ──────────────────────────────────────────────────────────────
  function handlePctChange(field, value) {
    const n = Math.max(0, Math.min(100, parseFloat(value) || 0));
    setBid(prev => ({ ...prev, [field]: n }));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => window.dbHelpers.updateBidInfo(activeBidId, { [field]: n }), 800);
  }

  // ── LIBRARY INSERT ────────────────────────────────────────────────────────
  async function handleInsertFromLibrary(lib) {
    const unit_cost = (lib.material_cost || 0) + (lib.labor_cost || 0);
    // Alternate context
    if (centerView === 'alt' && activeAltId) {
      const alt = (alts || []).find(a => a.id === activeAltId);
      if (!alt) return;
      const secId = activeAltSecId || alt.sections?.[0]?.id;
      if (!secId) return;
      const newItem = { id: crypto.randomUUID(), desc: lib.description, qty: 1, unit: lib.unit || 'EA', unit_cost, drawing_ref: '', ignore: false, no_print: false };
      const newSecs = alt.sections.map(s => s.id === secId ? { ...s, items: [...s.items, newItem] } : s);
      await handleUpdateAlt(activeAltId, { sections: newSecs });
      return;
    }
    // Area context
    if (!activeSectionId || !activeBidId) return;
    const area = (tree || []).find(a => a.sections.some(s => s.id === activeSectionId));
    if (!area) return;
    const sec = area.sections.find(s => s.id === activeSectionId);
    const { data, error } = await window.dbHelpers.addLineItem({
      bid_id: activeBidId, area_id: area.id, section_id: activeSectionId,
      description: lib.description, qty: 1, unit: lib.unit || 'EA', unit_cost,
      sort_order: (sec?.items || []).length,
    });
    if (!error && data) setTree(prev => prev.map(a => a.id === area.id ? {
      ...a, sections: a.sections.map(s => s.id === activeSectionId ? { ...s, items: [...s.items, data] } : s)
    } : a));
  }

  // ── ALTERNATES ────────────────────────────────────────────────────────────
  async function handleAddAlt() {
    const { data } = await window.dbHelpers.addAlternate(activeBidId, {
      description: 'New Alternate', sort_order: (alts || []).length,
    });
    if (data) {
      const migrated = migrateAlt({ ...data, sections: [] });
      setAlts(prev => [...(prev || []), migrated]);
      setActiveAltId(migrated.id);
      if (migrated.sections?.[0]) setActiveAltSecId(migrated.sections[0].id);
      setCenterView('alt');
    }
  }

  async function handleUpdateAlt(id, fields) {
    setAlts(prev => prev.map(a => a.id === id ? { ...a, ...fields } : a));
    await window.dbHelpers.updateAlternate(id, fields);
  }

  async function handleDeleteAlt(id) {
    if (!confirm('Remove this alternate?')) return;
    const { error } = await window.dbHelpers.deleteAlternate(id);
    if (!error) {
      setAlts(prev => prev.filter(a => a.id !== id));
      if (activeAltId === id) { setActiveAltId(null); setCenterView('grid'); }
    }
  }

  // Alt section/item mutations (stored in JSONB sections column)
  function altMutateSections(altId, fn) {
    const alt = (alts || []).find(a => a.id === altId);
    if (!alt) return;
    const newSecs = fn(alt.sections || []);
    handleUpdateAlt(altId, { sections: newSecs });
  }

  async function handleAddAltSection(altId) {
    altMutateSections(altId, secs => [...secs, { id: crypto.randomUUID(), name: 'New Section', items: [] }]);
  }

  function handleUpdateAltSectionName(altId, secId, name) {
    altMutateSections(altId, secs => secs.map(s => s.id === secId ? { ...s, name } : s));
  }

  function handleDeleteAltSection(altId, secId) {
    if (!confirm('Delete section and all its items?')) return;
    altMutateSections(altId, secs => secs.filter(s => s.id !== secId));
  }

  function handleUpdateAltItem(altId, secId, itemId, field, value) {
    const parsed = (field === 'qty' || field === 'unit_cost') ? parseFloat(value) || 0 : value;
    altMutateSections(altId, secs => secs.map(s => s.id === secId
      ? { ...s, items: s.items.map(it => it.id === itemId ? { ...it, [field]: parsed } : it) } : s));
  }

  function handleToggleAltItemFlag(altId, secId, itemId, flag) {
    altMutateSections(altId, secs => secs.map(s => s.id === secId
      ? { ...s, items: s.items.map(it => it.id === itemId ? { ...it, [flag]: !it[flag] } : it) } : s));
  }

  function handleDeleteAltItem(altId, secId, itemId) {
    if (!confirm('Delete this line item?')) return;
    altMutateSections(altId, secs => secs.map(s => s.id === secId
      ? { ...s, items: s.items.filter(it => it.id !== itemId) } : s));
  }

  function getAltDraft(secId) { return altDrafts[secId] || { desc: '', qty: 1, unit: 'EA', unitCost: 0, drawingRef: '' }; }
  function setAltDraft(secId, patch) { setAltDrafts(prev => ({ ...prev, [secId]: { ...getAltDraft(secId), ...patch } })); }

  function handleCommitAltDraft(altId, secId) {
    const d = getAltDraft(secId);
    if (!d.desc.trim()) return;
    const newItem = { id: crypto.randomUUID(), desc: d.desc.trim(), qty: d.qty || 1, unit: d.unit || 'EA', unit_cost: d.unitCost || 0, drawing_ref: d.drawingRef || '', ignore: false, no_print: false };
    altMutateSections(altId, secs => secs.map(s => s.id === secId ? { ...s, items: [...s.items, newItem] } : s));
    setAltDrafts(prev => ({ ...prev, [secId]: null }));
  }

  // ── TERMS / EXCLUSIONS ────────────────────────────────────────────────────
  function getItems(field) {
    const raw = bid?.[field];
    if (field === 'exclusions')      return migrateTerms(raw, DEFAULT_EXCLUSIONS);
    if (field === 'clarifications')  return migrateTerms(raw, DEFAULT_CLARIFICATIONS);
    return migrateTerms(raw, []);
  }

  async function saveItems(field, items) {
    setBid(prev => ({ ...prev, [field]: items }));
    await window.dbHelpers.updateBidInfo(activeBidId, { [field]: items });
  }

  // ── ZZ TAKEOFF IMPORT ─────────────────────────────────────────────────────
  async function handleZZImport() {
    if (!window.showOpenFilePicker) { alert('File import requires Chrome or Edge.'); return; }
    try {
      const [fh] = await window.showOpenFilePicker({
        types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx', '.xls'] } }],
      });
      const file = await fh.getFile();
      const ab   = await file.arrayBuffer();
      const wb   = window.XLSX.read(ab, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const parsed = parseZZTakeoff(rows);
      if (!parsed) { alert('Could not parse ZZTakeoff format.'); return; }
      setZZPreview(parsed);
    } catch (e) { if (e.name !== 'AbortError') console.error('ZZTakeoff import error:', e); }
  }

  async function doZZImport(areas) {
    setZZImporting(true);
    for (const area of areas.filter(a => a.checked && a.items.some(it => it.checked))) {
      const { data: areaRow } = await window.dbHelpers.addArea(activeBidId, { name: area.name, qty: 1, sort_order: (tree || []).length });
      if (!areaRow) continue;
      const { data: secRow } = await window.dbHelpers.addSection(areaRow.id, { name: 'Casework', sort_order: 0 });
      if (!secRow) continue;
      for (const [idx, it] of area.items.filter(i => i.checked).entries()) {
        await window.dbHelpers.addLineItem({ bid_id: activeBidId, area_id: areaRow.id, section_id: secRow.id, description: it.desc, qty: it.qty, unit: it.unit, unit_cost: it.unitCost, sort_order: idx });
      }
    }
    setZZPreview(null); setZZImporting(false); setTree(null); setActiveAreaId(null); setActiveSectionId(null);
  }

  // ── ACTIVE ALT ────────────────────────────────────────────────────────────
  const activeAlt = uM_est(() => (alts || []).find(a => a.id === activeAltId) || null, [alts, activeAltId]);

  // Active section name for library panel
  const activeSectionName = uM_est(() => {
    if (centerView === 'alt' && activeAlt) {
      const sec = (activeAlt.sections || []).find(s => s.id === activeAltSecId);
      return sec ? sec.name : activeAlt.sections?.[0]?.name || null;
    }
    if (!tree || !activeSectionId) return null;
    for (const a of tree) for (const s of a.sections) if (s.id === activeSectionId) return s.name;
    return null;
  }, [tree, activeSectionId, centerView, activeAlt, activeAltSecId]);

  // ── Section totals helper ─────────────────────────────────────────────────
  const getSecTotal = (sec, areaQty) => {
    if (sec.ignore) return 0;
    return (sec.items || []).reduce((s, it) => {
      if (it.ignore) return s;
      return s + (it.qty || 0) * (it.unit_cost || 0) * areaQty;
    }, 0);
  };

  // ── Seed sample data for current bid ─────────────────────────────────────
  async function seedCurrentBid() {
    if (!activeBidId || !tree) return;
    const items = [
      { name: 'Kitchen Cabinetry', sections: [
        { name: 'Base Cabinets', items: [
          { description: '3/4" Maple 5-piece base doors (36"w)', qty: 4, unit: 'EA', unit_cost: 320 },
          { description: '3/4" Maple 5-piece base doors (48"w)', qty: 2, unit: 'EA', unit_cost: 420 },
          { description: 'Base cabinet boxes (36"w)', qty: 4, unit: 'EA', unit_cost: 280 },
        ]},
        { name: 'Wall Cabinets', items: [
          { description: '3/4" Maple 5-piece wall doors (30"w)', qty: 5, unit: 'EA', unit_cost: 240 },
          { description: '3/4" Maple 5-piece wall doors (36"w)', qty: 3, unit: 'EA', unit_cost: 280 },
        ]},
      ]},
      { name: 'Countertops', sections: [
        { name: 'Quartz Counters', items: [
          { description: 'Quartz countertop (LF)', qty: 28, unit: 'LF', unit_cost: 95 },
          { description: 'Island quartz top (LF)', qty: 8, unit: 'LF', unit_cost: 105 },
        ]},
      ]},
      { name: 'Hardware', sections: [
        { name: 'Hardware & Hinges', items: [
          { description: 'Blum 125° concealed hinges (per cabinet)', qty: 14, unit: 'EA', unit_cost: 22 },
          { description: 'Brushed chrome knobs/pulls', qty: 32, unit: 'EA', unit_cost: 8.50 },
        ]},
      ]},
    ];
    for (const areaSpec of items) {
      let area = tree.find(a => a.name === areaSpec.name);
      if (!area) {
        const { data: newArea } = await window.dbHelpers.addArea(activeBidId, { name: areaSpec.name, qty: 1, sort_order: (tree || []).length });
        if (!newArea) continue;
        area = { ...newArea, sections: [] };
        setTree(prev => [...(prev || []), area]);
      }
      for (const secSpec of areaSpec.sections) {
        let section = (area.sections || []).find(s => s.name === secSpec.name);
        if (!section) {
          const { data: secData } = await window.dbHelpers.addSection(area.id, { name: secSpec.name, sort_order: (area.sections || []).length });
          if (!secData) continue;
          section = { ...secData, items: [] };
          setTree(prev => prev.map(a => a.id === area.id ? { ...a, sections: [...a.sections, section] } : a));
          area = { ...area, sections: [...(area.sections || []), section] };
        }
        for (const it of secSpec.items) {
          const { data, error: itErr } = await window.dbHelpers.addLineItem({
            bid_id: activeBidId, area_id: area.id, section_id: section.id,
            description: it.description, qty: it.qty, unit: it.unit, unit_cost: it.unit_cost,
            sort_order: (section.items || []).length,
          });
          if (itErr) { console.error('seedCurrentBid addLineItem failed:', itErr); continue; }
          if (data) {
            setTree(prev => prev.map(a => a.id === area.id ? {
              ...a, sections: a.sections.map(s => s.id === section.id ? { ...s, items: [...s.items, data] } : s)
            } : a));
            section = { ...section, items: [...(section.items || []), data] };
          }
        }
      }
    }
  }

  // ── RENDER ────────────────────────────────────────────────────────────────
  if (!activeBidId) return (
    <div className="view active" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <window.EmptyState heading="No bid open" body="Select a bid from the Pipeline to open its estimate." />
    </div>
  );

  if (tree === null) return <window.Spinner />;

  const exItems = getItems('exclusions');
  const clItems = getItems('clarifications');
  const exActive = exItems.filter(i => i.active).length;
  const clActive = clItems.filter(i => i.active).length;

  return (
    <div className="view active" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Cost topbar */}
      <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--line)', background: 'var(--panel)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginRight: 6 }}>{bid?.name || '…'}</div>
        {!(tree || []).some(a => (a.sections || []).some(s => (s.items || []).length > 0)) && (
          <button className="btn sm" onClick={seedCurrentBid}>Seed sample data</button>
        )}
        <button className="btn sm accent" onClick={() => setShowPDFPreview(true)} style={{ marginLeft: 'auto' }}>Build proposal →</button>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {[
            { label: 'Material', val: costs.mat },
            { label: 'OH',       val: costs.oh },
            { label: 'Del',      val: costs.del },
            { label: 'Ins',      val: costs.ins },
            { label: 'Base Bid', val: costs.total, accent: true },
          ].map(c => (
            <div key={c.label} style={{
              background: c.accent ? 'var(--accent-soft)' : 'var(--panel-alt)',
              border: `1px solid ${c.accent ? 'var(--accent-line,#d4956e)' : 'var(--line)'}`,
              borderRadius: 'var(--r-sm,4px)', padding: '3px 10px', textAlign: 'center', minWidth: 80
            }}>
              <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.06em', color: c.accent ? 'var(--accent-2)' : 'var(--ink-3)' }}>{c.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: c.accent ? 'var(--accent)' : 'var(--ink)', fontFamily: 'var(--mono)' }}>{fmt(c.val)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Body: sidebar + content + library */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr 280px', overflow: 'hidden' }}>

        {/* ── LEFT SIDEBAR ── */}
        <aside style={{ background: 'var(--panel-alt)', borderRight: '1px solid var(--line)', overflowY: 'auto', display: 'flex', flexDirection: 'column', fontSize: 12 }}>

          {/* Top links */}
          {[
            { id: 'info',    label: 'Project Info' },
            { id: 'basebid', label: 'Base Bid Summary' },
          ].map(v => (
            <div key={v.id} onClick={() => setCenterView(v.id)}
              style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid var(--line)',
                background: centerView === v.id ? 'var(--accent-soft)' : 'transparent',
                color: centerView === v.id ? 'var(--accent-2)' : 'var(--ink-2)',
                fontWeight: centerView === v.id ? 600 : 500,
                boxShadow: centerView === v.id ? 'inset 2px 0 0 var(--accent)' : 'none' }}>
              {v.label}
            </div>
          ))}

          {/* AREAS */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px 4px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--mute)', flex: 1 }}>Areas</span>
            <button className="btn ghost xs" style={{ padding: '1px 5px', fontSize: 14, lineHeight: 1 }} onClick={handleAddArea} title="Add area">+</button>
          </div>

          {(tree || []).map(area => (
            <div key={area.id}>
              {/* Area row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px 4px 10px', cursor: 'pointer',
                background: activeAreaId === area.id && centerView === 'grid' ? 'var(--panel-3,#EDE6D8)' : 'transparent',
                boxShadow: activeAreaId === area.id && centerView === 'grid' ? 'inset 2px 0 0 var(--accent)' : 'none' }}
                onClick={() => { setActiveAreaId(area.id); setCenterView('grid'); if (area.sections[0]) setActiveSectionId(area.sections[0].id); }}>
                <span style={{ fontSize: 10, color: 'var(--ink-3)', width: 10, flexShrink: 0 }}>{activeAreaId === area.id ? '▼' : '▶'}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: activeAreaId === area.id ? 600 : 400, color: area.ignore ? 'var(--ink-3)' : 'var(--ink)' }}>
                  {area.name}
                </span>
                {(area.qty || 1) > 1 && <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--mono)', flexShrink: 0 }}>×{area.qty}</span>}
                <label style={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, cursor: 'pointer' }} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={!!area.ignore} onChange={() => handleToggleAreaFlag(area.id, 'ignore')} style={{ width: 10, height: 10 }} />
                  <span style={{ fontSize: 9, color: 'var(--mute)' }}>ign</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, cursor: 'pointer' }} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={!!area.no_print} onChange={() => handleToggleAreaFlag(area.id, 'no_print')} style={{ width: 10, height: 10 }} />
                  <span style={{ fontSize: 9, color: 'var(--mute)' }}>NP</span>
                </label>
                <button className="btn ghost xs" style={{ padding: '0 3px', opacity: .5, flexShrink: 0 }}
                  onClick={e => { e.stopPropagation(); handleDeleteArea(area.id); }}>×</button>
              </div>

              {/* Sections (only when area is active) */}
              {activeAreaId === area.id && (area.sections || []).map(sec => (
                <div key={sec.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px 3px 22px', cursor: 'pointer',
                  background: activeSectionId === sec.id && centerView === 'grid' ? 'var(--panel-3,#EDE6D8)' : 'transparent',
                  boxShadow: activeSectionId === sec.id && centerView === 'grid' ? 'inset 2px 0 0 var(--accent)' : 'none' }}
                  onClick={() => { setActiveSectionId(sec.id); setCenterView('grid'); }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5, color: sec.ignore ? 'var(--ink-3)' : activeSectionId === sec.id ? 'var(--ink)' : 'var(--ink-2)' }}>
                    {sec.name}
                  </span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, cursor: 'pointer' }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={!!sec.ignore} onChange={() => handleToggleSectionFlag(area.id, sec.id, 'ignore')} style={{ width: 10, height: 10 }} />
                    <span style={{ fontSize: 9, color: 'var(--mute)' }}>ign</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, cursor: 'pointer' }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={!!sec.no_print} onChange={() => handleToggleSectionFlag(area.id, sec.id, 'no_print')} style={{ width: 10, height: 10 }} />
                    <span style={{ fontSize: 9, color: 'var(--mute)' }}>NP</span>
                  </label>
                  <button className="btn ghost xs" style={{ padding: '0 3px', opacity: .4, flexShrink: 0 }}
                    onClick={e => { e.stopPropagation(); handleDeleteSection(area.id, sec.id); }}>×</button>
                </div>
              ))}
              {activeAreaId === area.id && (
                <div style={{ padding: '3px 10px 5px 22px' }}>
                  <button className="btn ghost xs" style={{ fontSize: 11, color: 'var(--ink-3)' }}
                    onClick={() => handleAddSection(area.id)}>+ section</button>
                </div>
              )}
            </div>
          ))}

          {/* ALTERNATES */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px 4px', borderTop: '1px solid var(--line)', marginTop: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--mute)', flex: 1 }}>Alternates</span>
            <button className="btn ghost xs" style={{ padding: '1px 5px', fontSize: 14, lineHeight: 1 }} onClick={handleAddAlt} title="Add alternate">+</button>
          </div>
          {alts === null ? null : (alts || []).length === 0 ? (
            <div style={{ padding: '4px 12px 8px', fontSize: 11, color: 'var(--mute)', fontStyle: 'italic' }}>No alternates — click + to add</div>
          ) : (alts || []).map((alt, i) => {
            const altCosts = calcAlt(alt, bid);
            return (
              <div key={alt.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px 4px 12px', cursor: 'pointer',
                background: activeAltId === alt.id && centerView === 'alt' ? 'var(--panel-3,#EDE6D8)' : 'transparent',
                boxShadow: activeAltId === alt.id && centerView === 'alt' ? 'inset 2px 0 0 var(--accent)' : 'none' }}
                onClick={() => { setActiveAltId(alt.id); const firstSec = alt.sections?.[0]; if (firstSec) setActiveAltSecId(firstSec.id); setCenterView('alt'); }}>
                <span style={{ fontSize: 10, color: 'var(--ink-3)', flexShrink: 0 }}>{i + 1}.</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5, color: 'var(--ink-2)' }}>{alt.description}</span>
                <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--accent)', flexShrink: 0 }}>{fmt(altCosts.total)}</span>
                <button className="btn ghost xs" style={{ padding: '0 3px', opacity: .4, flexShrink: 0 }}
                  onClick={e => { e.stopPropagation(); handleDeleteAlt(alt.id); }}>×</button>
              </div>
            );
          })}

          {/* PROPOSAL TERMS */}
          <div style={{ padding: '8px 12px 4px', borderTop: '1px solid var(--line)', marginTop: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--mute)' }}>Proposal Terms</span>
          </div>
          {[
            { id: 'exclusions',      label: 'Exclusions',     active: exActive, total: exItems.length },
            { id: 'clarifications',  label: 'Clarifications', active: clActive, total: clItems.length },
            { id: 'terms',           label: 'Terms',          active: null,     total: null },
          ].map(v => (
            <div key={v.id} onClick={() => setCenterView(v.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', cursor: 'pointer',
                background: centerView === v.id ? 'var(--panel-3,#EDE6D8)' : 'transparent',
                boxShadow: centerView === v.id ? 'inset 2px 0 0 var(--accent)' : 'none',
                color: centerView === v.id ? 'var(--ink)' : 'var(--ink-2)',
                fontWeight: centerView === v.id ? 600 : 400 }}>
              <span style={{ flex: 1 }}>{v.label}</span>
              {v.total != null && (
                <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: v.active < v.total ? 'var(--warn)' : 'var(--ok)' }}>
                  {v.active}/{v.total}
                </span>
              )}
            </div>
          ))}

        </aside>
        {/* ── END LEFT SIDEBAR ── */}

        {/* ── CENTER PANEL ── */}
        <div style={{ overflowY: 'auto', background: 'var(--bg)' }}>
          {centerView === 'info' && <InfoPanel bid={bid} setBid={setBid} activeBidId={activeBidId} alts={alts} handlePctChange={handlePctChange} setCenterView={setCenterView} />}
          {centerView === 'basebid' && <BaseBidPanel tree={tree} bid={bid} costs={costs} setActiveAreaId={setActiveAreaId} setCenterView={setCenterView} />}
          {centerView === 'exclusions' && <TermsListPanel key="excl" title="Exclusions" items={exItems} defaults={DEFAULT_EXCLUSIONS} onSave={items => saveItems('exclusions', items)} />}
          {centerView === 'clarifications' && <TermsListPanel key="clar" title="Clarifications" items={clItems} defaults={DEFAULT_CLARIFICATIONS} onSave={items => saveItems('clarifications', items)} />}
          {centerView === 'terms' && <ProposalTermsPanel bid={bid} getItems={getItems} saveItems={saveItems} termsTab={termsTab} setTermsTab={setTermsTab} />}
          {centerView === 'alt' && activeAlt && (
            <AltGridPanel
              alt={activeAlt} bid={bid}
              activeAltSecId={activeAltSecId} setActiveAltSecId={setActiveAltSecId}
              handleUpdateAlt={handleUpdateAlt}
              handleAddAltSection={handleAddAltSection}
              handleUpdateAltSectionName={handleUpdateAltSectionName}
              handleDeleteAltSection={handleDeleteAltSection}
              handleUpdateAltItem={handleUpdateAltItem}
              handleToggleAltItemFlag={handleToggleAltItemFlag}
              handleDeleteAltItem={handleDeleteAltItem}
              getAltDraft={getAltDraft} setAltDraft={setAltDraft}
              handleCommitAltDraft={handleCommitAltDraft}
              calcAlt={calcAlt}
            />
          )}
          {centerView === 'grid' && (
            <AreaGridPanel
              tree={tree} activeAreaId={activeAreaId} activeSectionId={activeSectionId}
              setActiveSectionId={setActiveSectionId}
              handleAddSection={handleAddSection} handleDeleteSection={handleDeleteSection}
              handleUpdateAreaField={handleUpdateAreaField} handleUpdateSectionName={handleUpdateSectionName}
              handleUpdateItem={handleUpdateItem} handleToggleItemFlag={handleToggleItemFlag}
              handleDeleteItem={handleDeleteItem}
              getDraft={getDraft} setDraft={setDraft} handleCommitDraft={handleCommitDraft}
              handleZZImport={handleZZImport}
              handleAddItemClick={handleAddItemClick} getSecTotal={getSecTotal}
            />
          )}
          {centerView === 'grid' && (tree || []).length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
              No areas yet. Click <b>+</b> next to AREAS to begin.
            </div>
          )}
        </div>
        {/* ── END CENTER PANEL ── */}

        {/* ── RIGHT LIBRARY PANEL ── */}
        <aside style={{ borderLeft: '1px solid var(--line)', background: 'var(--panel)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--mute)', fontWeight: 600, marginBottom: 5 }}>Pricing Library</div>
            {activeSectionName && (
              <div style={{ fontSize: 11, color: 'var(--ok)', marginBottom: 5 }}>Adding to: <b>{activeSectionName}</b></div>
            )}
            <input value={libQ} onChange={e => setLibQ(e.target.value)} placeholder="Search library…"
              style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 'var(--r-sm,4px)', padding: '5px 8px', fontSize: 12, background: 'var(--bg)' }} />
            {libCats.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 5 }}>
                <button className={`btn xs${!libCat ? ' accent' : ''}`} onClick={() => setLibCat('')}>All</button>
                {libCats.map(c => (
                  <button key={c} className={`btn xs${libCat === c ? ' accent' : ''}`} onClick={() => setLibCat(c)} style={{ fontSize: 10 }}>{c}</button>
                ))}
              </div>
            )}
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {libItems === null ? <window.Spinner /> : libResults.length === 0 ? (
              <div className="muted" style={{ padding: '16px 12px', fontSize: 12 }}>No matching items.</div>
            ) : libResults.map((lib, i) => (
              <div key={lib.id || i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>{lib.code}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lib.description}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{lib.unit} · <b style={{ color: 'var(--accent)' }}>{fmt((lib.material_cost || 0) + (lib.labor_cost || 0))}</b></div>
                </div>
                <button className="btn sm accent" onClick={() => handleInsertFromLibrary(lib)}
                  disabled={!activeSectionName}>Insert</button>
              </div>
            ))}
          </div>
        </aside>
        {/* ── END RIGHT PANEL ── */}

      </div>{/* /grid */}

      {/* ZZTakeoff preview modal */}
      {zzPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--panel)', borderRadius: 'var(--r-lg)', padding: 24, width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>ZZTakeoff Import Preview</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Uncheck areas or items to exclude from import.</div>
            <div style={{ overflowY: 'auto', flex: 1, border: '1px solid var(--line)', borderRadius: 'var(--r-sm)' }}>
              {zzPreview.map((area, ai) => (
                <div key={ai}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--panel-alt)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={area.checked} onChange={() => setZZPreview(prev => prev.map((a, i) => i === ai ? { ...a, checked: !a.checked } : a))} />
                    {area.name}<span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-3)', fontWeight: 400 }}>{area.items.length} items</span>
                  </label>
                  {area.items.map((it, ii) => (
                    <label key={ii} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px 4px 26px', fontSize: 12, cursor: 'pointer' }}>
                      <input type="checkbox" checked={it.checked} onChange={() => setZZPreview(prev => prev.map((a, i) => i === ai ? { ...a, items: a.items.map((t, j) => j === ii ? { ...t, checked: !t.checked } : t) } : a))} />
                      <span style={{ flex: 1 }}>{it.desc}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>{it.qty} {it.unit} @ ${it.unitCost}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setZZPreview(null)} disabled={zzImporting}>Cancel</button>
              <button className="btn accent" onClick={() => doZZImport(zzPreview)} disabled={zzImporting}>{zzImporting ? 'Importing…' : 'Import'}</button>
            </div>
          </div>
        </div>
      )}

      {showPDFPreview && (
        <PDFPreviewModal
          bid={bid}
          tree={tree}
          onClose={() => setShowPDFPreview(false)}
          onExport={() => {
            const doc = generateProposalPDF(tree, bid, activeBidId);
            doc.save((bid?.name || 'Proposal') + '.pdf');
            setShowPDFPreview(false);
          }}
        />
      )}

    </div>
  );
}

// ── ItemRow — local state for optimistic updates, syncs to tree on blur ──────
function ItemRow({ it, area, sec, handleUpdateItem, handleToggleItemFlag, handleDeleteItem, UNITS }) {
  const [qty, setQty] = uS_est(it.qty || 0);
  const [unitCost, setUnitCost] = uS_est(it.unit_cost || 0);
  const [desc, setDesc] = uS_est(it.description || '');

  uE_est(() => { setQty(it.qty || 0); }, [it.qty]);
  uE_est(() => { setUnitCost(it.unit_cost || 0); }, [it.unit_cost]);
  uE_est(() => { setDesc(it.description || ''); }, [it.description]);

  const ext = qty * unitCost * (area.qty || 1);

  return (
    <tr style={{ opacity: it.ignore ? .45 : 1 }}
      onMouseEnter={e => { const b = e.currentTarget.querySelector('.del-btn'); if (b) b.style.opacity = '1'; }}
      onMouseLeave={e => { const b = e.currentTarget.querySelector('.del-btn'); if (b) b.style.opacity = '0'; }}>
      <td className="ctr"><input type="checkbox" checked={!!it.ignore} onChange={() => handleToggleItemFlag(area.id, sec.id, it.id, 'ignore')} title="Ignore" /></td>
      <td className="ctr"><input type="checkbox" checked={!!it.no_print} onChange={() => handleToggleItemFlag(area.id, sec.id, it.id, 'no_print')} title="No print" /></td>
      <td style={{ paddingLeft: 6 }}>
        <input className="inline-inp" value={desc}
          style={{ textDecoration: it.ignore ? 'line-through' : 'none' }}
          onChange={e => setDesc(e.target.value)}
          onBlur={e => handleUpdateItem(area.id, sec.id, it.id, 'description', e.target.value)}
          onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
      </td>
      <td className="num">
        <input className="inline-inp num tnum" value={qty} type="number" min="0"
          onChange={e => { const v = parseFloat(e.target.value) || 0; setQty(v); handleUpdateItem(area.id, sec.id, it.id, 'qty', v); }}
          onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
      </td>
      <td className="ctr">
        <select value={it.unit || 'EA'} onChange={e => handleUpdateItem(area.id, sec.id, it.id, 'unit', e.target.value)}
          style={{ background: 'transparent', border: 'none', fontSize: 11, fontFamily: 'var(--mono)', cursor: 'pointer' }}>
          {UNITS.map(u => <option key={u}>{u}</option>)}
        </select>
      </td>
      <td className="num">
        <input className="inline-inp num tnum" value={unitCost} type="number" min="0" step="0.01"
          onChange={e => { const v = parseFloat(e.target.value) || 0; setUnitCost(v); handleUpdateItem(area.id, sec.id, it.id, 'unit_cost', v); }}
          onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
      </td>
      <td className="num tnum" style={{ fontWeight: 600, color: it.ignore ? 'var(--ink-3)' : 'var(--ink)' }}>
        {ext > 0 ? '$' + Math.round(ext).toLocaleString() : '—'}
      </td>
      <td className="ctr">
        <button className="del-btn btn ghost xs" style={{ opacity: 0, color: 'var(--bad)', transition: 'opacity .15s' }}
          onClick={() => handleDeleteItem(area.id, sec.id, it.id)}>×</button>
      </td>
    </tr>
  );
}

// ── AreaGridPanel ────────────────────────────────────────────────────────────
function AreaGridPanel({ tree, activeAreaId, activeSectionId, setActiveSectionId,
  handleAddSection, handleDeleteSection, handleUpdateAreaField, handleUpdateSectionName,
  handleUpdateItem, handleToggleItemFlag, handleDeleteItem,
  getDraft, setDraft, handleCommitDraft, handleZZImport, handleAddItemClick, getSecTotal }) {

  const areas = (tree || []).filter(a => !activeAreaId || a.id === activeAreaId);
  const UNITS = ['EA', 'LF', 'SF', 'SY', 'CY', 'LS', 'HR', 'TON'];

  return (
    <>
      {areas.map(area => (
        <div key={area.id}>
          {/* Area header */}
          <div style={{ padding: '8px 14px', background: 'var(--panel-alt)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
              <label style={{ fontSize: 11, color: 'var(--ink-3)', flexShrink: 0 }}>Area:</label>
              <input className="inline-inp" defaultValue={area.name} style={{ fontWeight: 700, fontSize: 13, maxWidth: 220 }}
                onBlur={e => handleUpdateAreaField(area.id, 'name', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
              <label style={{ fontSize: 11, color: 'var(--ink-3)', flexShrink: 0, marginLeft: 8 }}>× Qty:</label>
              <input type="number" min="1" className="inline-inp" defaultValue={area.qty || 1}
                style={{ width: 52, fontFamily: 'var(--mono)', fontSize: 13, textAlign: 'center' }}
                onBlur={e => handleUpdateAreaField(area.id, 'qty', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
            </div>
            <button className="btn sm ghost" onClick={handleZZImport} title="Import ZZTakeoff XLSX">↑ ZZTakeoff</button>
            <button className="btn sm" onClick={() => handleAddSection(area.id)}>+ Section</button>
          </div>

          {/* Sections */}
          {(area.sections || []).map(sec => {
            const secTotal = getSecTotal(sec, area.qty || 1);
            const d = getDraft(sec.id);
            return (
              <div key={sec.id}>
                {/* Area context + drawing ref header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', background: 'var(--panel-alt)', borderBottom: '1px solid var(--line)', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', width: 60, flexShrink: 0 }}>Area:</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', flex: 1 }}>{area.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--mute)', flexShrink: 0 }}>Dwg Ref:</span>
                  <input className="inline-inp mono" defaultValue={area.drawing_ref || ''} placeholder="—"
                    style={{ width: 120, flexShrink: 0 }}
                    onBlur={e => handleUpdateAreaField(area.id, 'drawing_ref', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
                </div>

                {/* Section header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--panel)', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}
                  onClick={() => setActiveSectionId(sec.id)}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <span style={{ fontSize: 9, color: 'var(--mute)' }}>ign</span>
                    <input type="checkbox" checked={!!sec.ignore} onChange={() => {}} style={{ width: 10, height: 10 }} />
                  </label>
                  <input className="inline-inp" defaultValue={sec.name}
                    style={{ fontWeight: 600, fontSize: 12.5, color: activeSectionId === sec.id ? 'var(--accent)' : 'var(--ink-2)', flex: 1 }}
                    onClick={e => e.stopPropagation()}
                    onBlur={e => handleUpdateSectionName(area.id, sec.id, e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
                  <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>{secTotal ? '$' + Math.round(secTotal).toLocaleString() : '—'}</span>
                  <button className="btn ghost xs" style={{ color: 'var(--bad)', opacity: .5 }}
                    onClick={e => { e.stopPropagation(); handleDeleteSection(area.id, sec.id); }}>×</button>
                </div>

                {/* Items table */}
                <table className="wf" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: 28 }} />
                    <col style={{ width: 28 }} />
                    <col />
                    <col style={{ width: 60 }} />
                    <col style={{ width: 50 }} />
                    <col style={{ width: 70 }} />
                    <col style={{ width: 80 }} />
                    <col style={{ width: 28 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="ctr" title="Ignore">Ign</th><th className="ctr" title="No Print">NP</th>
                      <th>Description</th><th className="num">Qty</th>
                      <th className="ctr">Unit</th><th className="num">Unit $</th><th className="num">Total</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sec.items || []).map(it => (
                      <ItemRow key={it.id} it={it} area={area} sec={sec}
                        handleUpdateItem={handleUpdateItem}
                        handleToggleItemFlag={handleToggleItemFlag}
                        handleDeleteItem={handleDeleteItem}
                        UNITS={UNITS} />
                    ))}
                    {/* Draft row — press Enter to commit */}
                    <tr style={{ background: 'var(--bg)' }}>
                      <td className="ctr"><input type="checkbox" disabled /></td>
                      <td className="ctr"><input type="checkbox" disabled /></td>
                      <td style={{ paddingLeft: 6 }}>
                        <input className="inline-inp" value={d.desc} placeholder="+ add item…"
                          data-draft-desc={sec.id}
                          style={{ color: 'var(--ink-3)' }}
                          onChange={e => setDraft(sec.id, { desc: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCommitDraft(area.id, sec.id); } }} />
                      </td>
                      <td className="num"><input className="inline-inp num tnum" value={d.qty}
                        onChange={e => setDraft(sec.id, { qty: parseFloat(e.target.value) || 1 })}
                        onKeyDown={e => e.key === 'Enter' && handleCommitDraft(area.id, sec.id)} /></td>
                      <td className="ctr">
                        <select value={d.unit || 'EA'} onChange={e => setDraft(sec.id, { unit: e.target.value })}
                          style={{ background: 'transparent', border: 'none', fontSize: 11, fontFamily: 'var(--mono)' }}>
                          {UNITS.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="num"><input className="inline-inp num tnum" value={d.unitCost}
                        onChange={e => setDraft(sec.id, { unitCost: parseFloat(e.target.value) || 0 })}
                        onKeyDown={e => e.key === 'Enter' && handleCommitDraft(area.id, sec.id)} /></td>
                      <td className="num tnum" style={{ color: 'var(--ink-3)' }}>
                        {d.qty && d.unitCost ? '$' + Math.round(d.qty * d.unitCost * (area.qty || 1)).toLocaleString() : '—'}
                      </td>
                      <td className="ctr">
                        <button className="btn ghost xs" style={{ fontSize: 13, color: 'var(--ok)' }}
                          onMouseDown={e => { e.preventDefault(); handleCommitDraft(area.id, sec.id); }}>✓</button>
                      </td>
                    </tr>
                    {/* + Add Item button */}
                    <tr>
                      <td colSpan={8} style={{ padding: '2px 6px 6px' }}>
                        <button className="btn ghost xs" style={{ fontSize: 11, color: 'var(--accent)', padding: '4px 8px' }}
                          onMouseDown={e => { e.preventDefault(); handleAddItemClick(area.id, sec.id); }}>
                          + Add Item
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })}

          {/* Add section dashed button */}
          <div style={{ padding: '10px 14px' }}>
            <button onClick={() => handleAddSection(area.id)}
              style={{ width: '100%', padding: '8px', border: '1px dashed var(--line-2)', borderRadius: 'var(--r-sm)', background: 'transparent', color: 'var(--ink-3)', fontSize: 12, cursor: 'pointer' }}>
              + Add Section to {area.name}
            </button>
          </div>

          {(area.sections || []).length === 0 && (
            <div style={{ padding: '20px 14px', color: 'var(--ink-3)', fontSize: 12 }}>No sections yet.</div>
          )}
        </div>
      ))}
    </>
  );
}

// ── AltGridPanel ─────────────────────────────────────────────────────────────
function AltGridPanel({ alt, bid, activeAltSecId, setActiveAltSecId,
  handleUpdateAlt, handleAddAltSection, handleUpdateAltSectionName, handleDeleteAltSection,
  handleUpdateAltItem, handleToggleAltItemFlag, handleDeleteAltItem,
  getAltDraft, setAltDraft, handleCommitAltDraft, calcAlt }) {

  const costs = calcAlt(alt, bid);
  const UNITS = ['EA', 'LF', 'SF', 'SY', 'CY', 'LS', 'HR', 'TON'];

  return (
    <div>
      {/* Alt header + markup bar */}
      <div style={{ padding: '10px 16px', background: 'var(--panel-alt)', borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, zIndex: 3 }}>
        <input className="inline-inp" defaultValue={alt.description}
          style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, display: 'block', width: '100%' }}
          onBlur={e => handleUpdateAlt(alt.id, { description: e.target.value })}
          onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {/* OH toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!alt.apply_oh} onChange={e => handleUpdateAlt(alt.id, { apply_oh: e.target.checked })} />
            <span style={{ color: 'var(--ink-2)' }}>Overhead</span>
            <span style={{ fontSize: 10, color: 'var(--mute)', fontFamily: 'var(--mono)' }}>{bid?.oh_pct ?? 15}%</span>
          </label>
          {/* Del toggle + % */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!alt.apply_del} onChange={e => handleUpdateAlt(alt.id, { apply_del: e.target.checked })} />
            <span style={{ color: 'var(--ink-2)' }}>Delivery</span>
            <input type="number" min="0" max="100" step="0.5"
              value={alt.del_pct ?? bid?.del_pct ?? 5}
              disabled={!alt.apply_del}
              onChange={e => handleUpdateAlt(alt.id, { del_pct: parseFloat(e.target.value) || 0 })}
              style={{ width: 44, border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '1px 4px', fontSize: 11, fontFamily: 'var(--mono)', background: alt.apply_del ? 'var(--bg)' : 'var(--panel-alt)', opacity: alt.apply_del ? 1 : .5 }} />
            <span style={{ fontSize: 10, color: 'var(--mute)' }}>%</span>
          </label>
          {/* Ins toggle + % */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!alt.apply_ins} onChange={e => handleUpdateAlt(alt.id, { apply_ins: e.target.checked })} />
            <span style={{ color: 'var(--ink-2)' }}>Install</span>
            <input type="number" min="0" max="100" step="0.5"
              value={alt.ins_pct ?? bid?.ins_pct ?? 20}
              disabled={!alt.apply_ins}
              onChange={e => handleUpdateAlt(alt.id, { ins_pct: parseFloat(e.target.value) || 0 })}
              style={{ width: 44, border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '1px 4px', fontSize: 11, fontFamily: 'var(--mono)', background: alt.apply_ins ? 'var(--bg)' : 'var(--panel-alt)', opacity: alt.apply_ins ? 1 : .5 }} />
            <span style={{ fontSize: 10, color: 'var(--mute)' }}>%</span>
          </label>
          <div style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14, color: 'var(--accent)' }}>
            {costs.total ? '$' + Math.round(costs.total).toLocaleString() : '—'}
          </div>
        </div>
      </div>

      {/* Sections + items */}
      {(alt.sections || []).map(sec => {
        const secTotal = (sec.items || []).reduce((s, it) => s + (it.ignore ? 0 : (it.qty || 0) * (it.unit_cost || 0)), 0);
        const d = getAltDraft(sec.id);
        return (
          <div key={sec.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--panel)', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}
              onClick={() => setActiveAltSecId(sec.id)}>
              <input className="inline-inp" defaultValue={sec.name}
                style={{ fontWeight: 600, fontSize: 12.5, color: activeAltSecId === sec.id ? 'var(--accent)' : 'var(--ink-2)', flex: 1 }}
                onClick={e => e.stopPropagation()}
                onBlur={e => handleUpdateAltSectionName(alt.id, sec.id, e.target.value)}
                onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
              <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>{secTotal ? '$' + Math.round(secTotal).toLocaleString() : '—'}</span>
              <button className="btn ghost xs" style={{ color: 'var(--bad)', opacity: .5 }}
                onClick={e => { e.stopPropagation(); handleDeleteAltSection(alt.id, sec.id); }}>×</button>
            </div>
            <table className="wf" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 28 }} /><col style={{ width: 28 }} /><col />
                <col style={{ width: 72 }} /><col style={{ width: 60 }} /><col style={{ width: 58 }} />
                <col style={{ width: 80 }} /><col style={{ width: 88 }} /><col style={{ width: 28 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="ctr">Ign</th><th className="ctr">NP</th>
                  <th>Description</th><th>Dwg Ref</th><th className="num">Qty</th>
                  <th className="ctr">Unit</th><th className="num">Unit $</th><th className="num">Total</th><th></th>
                </tr>
              </thead>
              <tbody>
                {(sec.items || []).map(it => {
                  const ext = (it.qty || 0) * (it.unit_cost || 0);
                  return (
                    <tr key={it.id} style={{ opacity: it.ignore ? .45 : 1 }}
                      onMouseEnter={e => { const b = e.currentTarget.querySelector('.del-btn'); if (b) b.style.opacity = '1'; }}
                      onMouseLeave={e => { const b = e.currentTarget.querySelector('.del-btn'); if (b) b.style.opacity = '0'; }}>
                      <td className="ctr"><input type="checkbox" checked={!!it.ignore} onChange={() => handleToggleAltItemFlag(alt.id, sec.id, it.id, 'ignore')} /></td>
                      <td className="ctr"><input type="checkbox" checked={!!it.no_print} onChange={() => handleToggleAltItemFlag(alt.id, sec.id, it.id, 'no_print')} /></td>
                      <td style={{ paddingLeft: 6 }}>
                        <input className="inline-inp" defaultValue={it.desc} style={{ textDecoration: it.ignore ? 'line-through' : 'none' }}
                          onBlur={e => handleUpdateAltItem(alt.id, sec.id, it.id, 'desc', e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
                      </td>
                      <td><input className="inline-inp mono" defaultValue={it.drawing_ref || ''} placeholder="—"
                        onBlur={e => handleUpdateAltItem(alt.id, sec.id, it.id, 'drawing_ref', e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && e.target.blur()} /></td>
                      <td className="num"><input className="inline-inp num tnum" defaultValue={it.qty}
                        onBlur={e => handleUpdateAltItem(alt.id, sec.id, it.id, 'qty', e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && e.target.blur()} /></td>
                      <td className="ctr">
                        <select value={it.unit || 'EA'} onChange={e => handleUpdateAltItem(alt.id, sec.id, it.id, 'unit', e.target.value)}
                          style={{ background: 'transparent', border: 'none', fontSize: 11, fontFamily: 'var(--mono)' }}>
                          {UNITS.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="num"><input className="inline-inp num tnum" defaultValue={it.unit_cost}
                        onBlur={e => handleUpdateAltItem(alt.id, sec.id, it.id, 'unit_cost', e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && e.target.blur()} /></td>
                      <td className="num tnum" style={{ fontWeight: 600 }}>{ext ? '$' + Math.round(ext).toLocaleString() : '—'}</td>
                      <td className="ctr">
                        <button className="del-btn btn ghost xs" style={{ opacity: 0, color: 'var(--bad)', transition: 'opacity .15s' }}
                          onClick={() => handleDeleteAltItem(alt.id, sec.id, it.id)}>×</button>
                      </td>
                    </tr>
                  );
                })}
                {/* Draft row */}
                <tr style={{ background: 'var(--bg)' }}>
                  <td className="ctr"><input type="checkbox" disabled /></td>
                  <td className="ctr"><input type="checkbox" disabled /></td>
                  <td style={{ paddingLeft: 6 }}>
                    <input className="inline-inp" value={d.desc} placeholder="+ add item…" style={{ color: 'var(--ink-3)' }}
                      onChange={e => setAltDraft(sec.id, { desc: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); handleCommitAltDraft(alt.id, sec.id); } }}
                      onBlur={() => handleCommitAltDraft(alt.id, sec.id)} />
                  </td>
                  <td><input className="inline-inp mono" value={d.drawingRef || ''} placeholder="—" onChange={e => setAltDraft(sec.id, { drawingRef: e.target.value })} /></td>
                  <td className="num"><input className="inline-inp num tnum" value={d.qty} onChange={e => setAltDraft(sec.id, { qty: parseFloat(e.target.value) || 1 })} /></td>
                  <td className="ctr">
                    <select value={d.unit || 'EA'} onChange={e => setAltDraft(sec.id, { unit: e.target.value })}
                      style={{ background: 'transparent', border: 'none', fontSize: 11, fontFamily: 'var(--mono)' }}>
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className="num"><input className="inline-inp num tnum" value={d.unitCost} onChange={e => setAltDraft(sec.id, { unitCost: parseFloat(e.target.value) || 0 })} /></td>
                  <td className="num tnum" style={{ color: 'var(--ink-3)' }}>—</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
      <div style={{ padding: '10px 14px' }}>
        <button onClick={() => handleAddAltSection(alt.id)}
          style={{ width: '100%', padding: '8px', border: '1px dashed var(--line-2)', borderRadius: 'var(--r-sm)', background: 'transparent', color: 'var(--ink-3)', fontSize: 12, cursor: 'pointer' }}>
          + Add Section to {alt.description}
        </button>
      </div>
    </div>
  );
}

// ── BaseBidPanel ──────────────────────────────────────────────────────────────
function BaseBidPanel({ tree, bid, costs, setActiveAreaId, setCenterView }) {
  const ohPct = (bid?.oh_pct ?? 15) / 100;
  const rows = (tree || []).map(area => {
    const mat = area.ignore ? 0 : (area.sections || []).reduce((s, sec) => {
      if (sec.ignore) return s;
      return s + (sec.items || []).reduce((s2, it) => s2 + (it.ignore ? 0 : (it.qty || 0) * (it.unit_cost || 0) * (area.qty || 1)), 0);
    }, 0);
    return { ...area, areaMat: mat, areaOh: mat * ohPct };
  });
  return (
    <div style={{ padding: '24px 28px', maxWidth: 700 }}>
      <div className="page-title" style={{ marginBottom: 4 }}>Base Bid Summary</div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 18 }}>{bid?.name}</div>
      <table className="wf">
        <thead>
          <tr>
            <th>Area</th>
            <th className="num">Material</th>
            <th className="num">Overhead</th>
            <th className="num">Total w/OH</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(area => (
            <tr key={area.id} style={{ opacity: area.ignore ? .4 : 1, cursor: 'pointer' }}
              onClick={() => { setActiveAreaId(area.id); setCenterView('grid'); }}>
              <td style={{ color: 'var(--accent)' }}>
                {area.name}
                {(area.qty || 1) > 1 && <span style={{ fontSize: 10, color: 'var(--mute)', marginLeft: 5 }}>×{area.qty}</span>}
              </td>
              <td className="num tnum">{area.areaMat ? '$' + Math.round(area.areaMat).toLocaleString() : '—'}</td>
              <td className="num tnum">{area.areaOh ? '$' + Math.round(area.areaOh).toLocaleString() : '—'}</td>
              <td className="num tnum" style={{ fontWeight: 600 }}>{(area.areaMat + area.areaOh) ? '$' + Math.round(area.areaMat + area.areaOh).toLocaleString() : '—'}</td>
            </tr>
          ))}
          <tr style={{ background: 'var(--panel-alt)' }}>
            <td style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>Total</td>
            <td className="num tnum" style={{ fontWeight: 700 }}>{costs.mat ? '$' + Math.round(costs.mat).toLocaleString() : '—'}</td>
            <td className="num tnum" style={{ fontWeight: 700 }}>{costs.oh ? '$' + Math.round(costs.oh).toLocaleString() : '—'}</td>
            <td className="num tnum" style={{ fontWeight: 700, color: 'var(--accent)' }}>{costs.matOh ? '$' + Math.round(costs.matOh).toLocaleString() : '—'}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ marginTop: 20, padding: '12px 16px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)' }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Material + OH', val: costs.matOh },
            { label: 'Delivery',      val: costs.del },
            { label: 'Installation',  val: costs.ins },
            { label: 'Base Bid',      val: costs.total, accent: true },
          ].map(c => (
            <div key={c.label}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--mute)' }}>{c.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--mono)', color: c.accent ? 'var(--accent)' : 'var(--ink)' }}>
                {c.val ? '$' + Math.round(c.val).toLocaleString() : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── TermsListPanel ────────────────────────────────────────────────────────────
function TermsListPanel({ title, items, defaults, onSave }) {
  const { useState: uS } = React;
  const [newText, setNewText] = uS('');
  const [newSub,  setNewSub]  = uS(false);

  function addItem() {
    if (!newText.trim()) return;
    onSave([...items, { text: newText.trim(), active: true, sub: newSub }]);
    setNewText(''); setNewSub(false);
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div className="page-title">{title}</div>
        <button className="btn sm ghost" onClick={() => onSave(items.map(i => ({ ...i, active: true })))}>All On</button>
        <button className="btn sm ghost" onClick={() => onSave(items.map(i => ({ ...i, active: false })))}>All Off</button>
        <button className="btn sm ghost" onClick={() => onSave(defaults)}>Reset</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 14 }}>
        {items.map((item, idx) => (
          <div key={idx} style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 8px',
            background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)',
            marginLeft: item.sub ? 28 : 0,
            opacity: item.active ? 1 : 0.55,
          }}>
            <input type="checkbox" checked={!!item.active} style={{ marginTop: 4, flexShrink: 0 }}
              onChange={() => { const next = [...items]; next[idx] = { ...next[idx], active: !next[idx].active }; onSave(next); }} />
            <textarea value={item.text} rows={1}
              onChange={e => { const next = [...items]; next[idx] = { ...next[idx], text: e.target.value }; onSave(next); }}
              onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
              style={{
                flex: 1, border: 'none', background: 'transparent', fontSize: 12.5, resize: 'none',
                fontFamily: 'var(--sans)', overflow: 'hidden',
                color: item.active ? 'var(--ink)' : 'var(--ink-3)',
                textDecoration: item.active ? 'none' : 'line-through',
              }} />
            <button className="btn ghost xs" style={{ color: 'var(--bad)', flexShrink: 0, marginTop: 2 }}
              onClick={() => onSave(items.filter((_, i) => i !== idx))}>×</button>
          </div>
        ))}
      </div>
      {/* Add new item */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)' }}>
        <input value={newText} onChange={e => setNewText(e.target.value)} placeholder="Add item…"
          onKeyDown={e => e.key === 'Enter' && addItem()}
          style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 12.5, fontFamily: 'var(--sans)', outline: 'none' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--ink-3)', cursor: 'pointer', flexShrink: 0 }}>
          <input type="checkbox" checked={newSub} onChange={e => setNewSub(e.target.checked)} />Sub-item
        </label>
        <button className="btn sm" onClick={addItem}>Add</button>
      </div>
    </div>
  );
}

// ── ProposalTermsPanel ────────────────────────────────────────────────────────
function ProposalTermsPanel({ bid, getItems, saveItems, termsTab, setTermsTab }) {
  const tabs = [
    ['general_terms', 'General'],
    ['warranty',      'Warranty'],
    ['finish_terms',  'Finish'],
    ['hardware_terms','Hardware'],
    ['fab_note',      'Fab Note'],
  ];
  return (
    <div style={{ padding: '24px 28px', maxWidth: 680 }}>
      <div className="page-title" style={{ marginBottom: 14 }}>Proposal Terms</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(([f, label]) => (
          <button key={f} className={`btn sm${termsTab === f ? ' accent' : ''}`} onClick={() => setTermsTab(f)}>{label}</button>
        ))}
      </div>
      <TermsListPanel title="" items={getItems(termsTab)} defaults={[]} onSave={items => saveItems(termsTab, items)} />
    </div>
  );
}

// ── InfoPanel ─────────────────────────────────────────────────────────────────
function InfoPanel({ bid, setBid, activeBidId, alts, handlePctChange, setCenterView }) {
  return (
    <div style={{ padding: '24px 28px', maxWidth: 700 }}>
      <div className="page-title" style={{ marginBottom: 18 }}>Project Info</div>
      {/* Markup rates */}
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg,6px)', padding: '14px 18px', marginBottom: 18 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)', fontWeight: 600, marginBottom: 10 }}>Markup Rates</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[['oh_pct', 'Overhead %', 15], ['del_pct', 'Delivery %', 5], ['ins_pct', 'Install %', 20]].map(([f, label, def]) => (
            <label key={f}>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 3 }}>{label}</div>
              <input type="number" min="0" max="100" step="0.5" value={bid?.[f] ?? def}
                onChange={e => handlePctChange(f, e.target.value)}
                style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 'var(--r-sm,4px)', padding: '5px 8px', fontSize: 13, fontFamily: 'var(--mono)', background: 'var(--bg)' }} />
            </label>
          ))}
        </div>
      </div>
      {/* Alternates badge */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)', fontWeight: 600, marginBottom: 6 }}>Alternates</div>
        <button className="btn sm ghost" onClick={() => setCenterView('alt')}
          style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sm)' }}>
          {(alts || []).length} Alternate{(alts || []).length !== 1 ? 's' : ''} →
        </button>
      </div>
      {/* Bid number (read-only) */}
      {bid?.number && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 3 }}>Bid Number</div>
          <div style={{ padding: '5px 8px', background: 'var(--panel-alt)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm,4px)', fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--ink-2)' }}>{bid.number}</div>
        </div>
      )}
      {/* Metadata fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[
          ['doc_type',       'Document Type',    'select', ['Proposal', 'Quote', 'Bid', 'Budget', 'Change Order']],
          ['pricing_mode',   'Pricing Mode',     'select', ['By Area', 'Lump Sum', 'Itemized']],
          ['gc_name',        'General Contractor','text',  null],
          ['architect',      'Architect',        'text',   null],
          ['due_date',       'Bid Due Date',     'date',   null],
          ['bid_docs',       'Bid Documents',    'text',   null],
          ['drawings_dated', 'Drawings Dated',   'date',   null],
          ['estimator',      'Estimator',        'text',   null],
          ['po_number',      'P.O. Number',      'text',   null],
          ['terms',          'Terms',            'text',   null],
          ['delivery_date',  'Delivery Date',    'date',   null],
          ['attention',      'Attention',        'text',   null],
        ].map(([field, label, type, opts]) => (
          <label key={field}>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 3 }}>{label}</div>
            {type === 'select' ? (
              <select value={bid?.[field] || ''} onChange={e => { setBid(p => ({ ...p, [field]: e.target.value })); window.dbHelpers.updateBidInfo(activeBidId, { [field]: e.target.value }); }}
                style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 'var(--r-sm,4px)', padding: '5px 8px', fontSize: 12.5, background: 'var(--bg)' }}>
                <option value="">—</option>
                {opts.map(o => <option key={o}>{o}</option>)}
              </select>
            ) : (
              <input type={type} defaultValue={bid?.[field] || ''}
                onBlur={e => { setBid(p => ({ ...p, [field]: e.target.value })); window.dbHelpers.updateBidInfo(activeBidId, { [field]: e.target.value }); }}
                style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 'var(--r-sm,4px)', padding: '5px 8px', fontSize: 12.5, background: 'var(--bg)' }} />
            )}
          </label>
        ))}
      </div>
      <label style={{ display: 'block', marginTop: 12 }}>
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 3 }}>Scope / Notes (internal)</div>
        <textarea defaultValue={bid?.notes || ''} rows={4}
          onBlur={e => { setBid(p => ({ ...p, notes: e.target.value })); window.dbHelpers.updateBidInfo(activeBidId, { notes: e.target.value }); }}
          style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 'var(--r-sm,4px)', padding: '6px 8px', fontSize: 12.5, background: 'var(--bg)', resize: 'vertical' }} />
      </label>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF EXPORT
// ─────────────────────────────────────────────────────────────────────────────

function generateProposalPDF(tree, bid) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });

  const I = bid || {};
  const bidCalc = calcBid(tree, bid);
  const ohFactor = 1 + (bid?.oh_pct ?? 15) / 100;

  const LM = 19, RM = 192, CW = RM - LM, BM = 275;
  const cDesc = LM, cRef = LM + 96, cQty = LM + 124, cUnit = LM + 135, cPrice = RM;
  let y = 15;

  function txt(x, yy, str, opts = {}) {
    if (!str && str !== 0) return;
    doc.setFontSize(opts.size || 8.5);
    doc.setFont('helvetica', opts.bold && opts.italic ? 'bolditalic' : opts.bold ? 'bold' : opts.italic ? 'italic' : 'normal');
    doc.setTextColor(...(opts.color || [0, 0, 0]));
    if (opts.align === 'right') doc.text(String(str), x, yy, { align: 'right' });
    else doc.text(String(str), x, yy, { maxWidth: opts.maxWidth || undefined });
  }

  function hline(yy, x0, x1, lw, gray) {
    doc.setDrawColor(gray ? 153 : 0);
    doc.setLineWidth(lw || 0.3);
    doc.line(x0 || LM, yy, x1 || RM, yy);
  }

  function fillRect(x, yy, w, h, r, g, b) {
    doc.setFillColor(r || 217, g || 217, b || 217);
    doc.rect(x, yy, w, h, 'F');
  }

  function checkY(space) {
    if (y + space > BM) {
      doc.addPage();
      y = 15;
      txt(LM, y, 'Form and Structure, Inc.  ' + (I.doc_type || 'Proposal'), { bold: true, size: 9.5 });
      y += 4.5;
      txt(LM, y, (I.number ? I.number + ' - ' : '') + (I.name || ''), { size: 8.5 });
      txt(RM, y, 'Continued…', { size: 8.5, align: 'right' });
      y += 4.5;
      txt(LM, y, I.client || '', { size: 8.5 });
      y += 3.5;
      hline(y, LM, RM, 0.5);
      y += 5.5;
    }
  }

  function newPage() { doc.addPage(); y = 15; }

  // Page 1 header
  const ax = RM, ay = y + 1;
  [{ t: 'Form and Structure, Inc.', b: true }, { t: '10708 NE 2nd Ave' },
   { t: 'Portland, OR 97211' }, { t: 'Tel: (503) 289-9204' }, { t: 'CCB# 52938' }]
    .forEach((l, i) => txt(ax, ay + i * 3.8, l.t, { size: 7.5, bold: l.b, align: 'right' }));
  y += 21;

  txt(LM, y, I.doc_type || 'Proposal', { size: 16, bold: true });
  txt(RM, y, 'Date  ' + (I.delivery_date || ''), { size: 9, align: 'right' });
  y += 5; hline(y, LM, RM, 0.5); y += 5;

  txt(LM, y, 'To:', { bold: true, size: 9 });
  const tx = LM + 7;
  txt(tx, y, I.gc_name || '', { bold: true, size: 9 });
  y += 2; hline(y, LM, RM, 0.25, true); y += 4.5;

  const c1l = LM, c1v = LM + 23, c2l = LM + CW / 2, c2v = LM + CW / 2 + 23;
  [
    ['Attention :', I.attention || '', 'Project Id :', I.number || ''],
    ['Project Desc.:', I.name || '', 'Ship Via :', 'Truck'],
    ['Terms :', I.terms || 'Net 30', 'P.O. Number :', I.po_number || 'n/a'],
    ['Delivery Date:', I.delivery_date || '', 'Estimator :', I.estimator || 'Evan Ramsey'],
  ].forEach(([l1, v1, l2, v2]) => {
    txt(c1l, y, l1, { bold: true, size: 7.5 }); txt(c1v, y, v1, { size: 7.5 });
    txt(c2l, y, l2, { bold: true, size: 7.5 }); txt(c2v, y, v2, { size: 7.5 });
    y += 4.5;
  });
  y += 2; hline(y, LM, RM, 0.5); y += 5;

  fillRect(LM, y - 3.2, CW, 5.2);
  [{ x: cDesc, t: 'Description', a: 'left' }, { x: cRef, t: 'Drawing Ref', a: 'left' },
   { x: cQty, t: 'Qty', a: 'right' }, { x: cUnit, t: 'Unit', a: 'left' }, { x: cPrice, t: 'Price', a: 'right' }]
    .forEach(c => txt(c.x, y, c.t, { bold: true, size: 7.5, align: c.a }));
  y += 5.2; hline(y, LM, RM, 0.4); y += 3;

  for (const area of (tree || [])) {
    if (area.ignore) continue;
    checkY(8);
    const aT = (area.sections || []).reduce((s, sec) =>
      s + (sec.items || []).filter(it => !it.ignore).reduce((s2, it) =>
        s2 + (it.qty || 0) * (it.unit_cost || 0), 0), 0) * ohFactor;
    const aQty = area.qty || 1;
    txt(cDesc, y, area.name || 'Area', { bold: true, size: 8.5 });
    txt(cQty, y, String(aQty), { size: 8.5, align: 'right' });
    txt(cUnit, y, aQty > 1 ? 'rooms' : 'lump sum', { size: 8.5 });
    txt(cPrice, y, '$' + aT.toLocaleString(undefined, { maximumFractionDigits: 0 }), { size: 8.5, align: 'right' });
    y += 5;
    for (const sec of (area.sections || [])) {
      if (sec.ignore) continue;
      for (const item of (sec.items || [])) {
        if (item.ignore) continue;
        checkY(5);
        const iTotal = (item.qty || 0) * (item.unit_cost || 0) * ohFactor;
        txt(cDesc, y, '  ' + (item.desc || item.description || '—'), { size: 7.5, maxWidth: 90 });
        if (item.drawing_ref) txt(cRef, y, item.drawing_ref, { size: 7.5, maxWidth: 28 });
        txt(cQty, y, String(item.qty || 1), { size: 7.5, align: 'right' });
        txt(cUnit, y, item.unit || '', { size: 7.5 });
        txt(cPrice, y, '$' + iTotal.toLocaleString(undefined, { maximumFractionDigits: 0 }), { size: 7.5, align: 'right' });
        y += 4.2;
      }
    }
  }

  hline(y, LM, RM, 0.25, true); y += 4.5;
  txt(cDesc, y, 'Base Bid', { bold: true, size: 10 });
  txt(cQty, y, '1', { bold: true, size: 10, align: 'right' });
  txt(cUnit, y, '$', { bold: true, size: 10 });
  txt(cPrice, y, '$' + bidCalc.total.toLocaleString(undefined, { maximumFractionDigits: 0 }), { bold: true, size: 10, align: 'right' });
  y += 6; hline(y, LM, RM, 0.8); y += 6;

  // Page 2 — Terms
  newPage();
  txt(LM, y, 'Form and Structure, Inc.  ' + (I.doc_type || 'Proposal'), { bold: true, size: 9.5 }); y += 4.5;
  txt(LM, y, (I.number ? I.number + ' - ' : '') + (I.name || ''), { size: 8.5 });
  txt(RM, y, 'Page No. 2 of 2 Pages', { size: 8.5, align: 'right' }); y += 4.5;
  txt(LM, y, I.client || '', { size: 8.5 }); y += 3.5;
  hline(y, LM, RM, 0.5); y += 5.5;

  function section(title, lines) {
    checkY(8);
    txt(LM, y, title, { bold: true, size: 8.5 }); y += 4.5;
    lines.forEach(line => { checkY(4); txt(LM + 3, y, line, { size: 7.5 }); y += 3.8; });
    y += 3;
  }

  section('EXCLUSIONS:', (I.exclusions || DEFAULT_EXCLUSIONS).filter(e => e.active).map(e => e.text));
  section('CLARIFICATIONS:', (I.clarifications || DEFAULT_CLARIFICATIONS).filter(e => e.active).map(e => e.text));

  y += 4;
  txt(LM, y, 'Please Note: Prices valid for 30 days.', { italic: true, size: 7.5 });
  y += 7; hline(y, LM, LM + 64, 0.4); y += 4;
  txt(LM, y, 'Authorized Signature', { size: 7.5 });

  return doc;
}

function PDFPreviewModal({ bid, tree, onClose, onExport }) {
  const [pdfUrl, setPdfUrl] = uS_est(null);

  uE_est(() => {
    try {
      const doc = generateProposalPDF(tree, bid);
      const url = doc.output('bloburi') || doc.output('datauristring');
      setPdfUrl(url);
    } catch (e) {
      console.error('PDF generation error:', e);
    }
  }, [bid, tree]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 8, width: '90%', maxWidth: 900, height: '85vh',
        display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>PDF Preview</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#666' }}>✕</button>
        </div>
        <iframe src={pdfUrl} style={{ flex: 1, border: 'none', width: '100%' }} />
        <div style={{ padding: '12px 20px', borderTop: '1px solid #ddd', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: '#f5f5f5' }}>Cancel</button>
          <button onClick={onExport} style={{ padding: '8px 16px', border: 'none', borderRadius: 4, cursor: 'pointer', background: '#2D6A8F', color: '#fff', fontWeight: 600 }}>Download PDF</button>
        </div>
      </div>
    </div>
  );
}

window.Views = Object.assign(window.Views || {}, { estimator: EstimatorView });
