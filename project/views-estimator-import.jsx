// ZZTakeoff import modal — parses a ZZTakeoff CSV (or generic Excel) into areas/sections/items.
//
// ZZTakeoff CSV structure (hierarchy via leading spaces in the Name column):
//   0 spaces + no Units + no Cost Each  → Area header
//   N spaces + no Units + no Cost Each  → Section / sub-group header
//   N spaces + Units filled             → Priced line item  ← only these are imported
//   Each item appears twice; the priced copy has col 4 (Units) non-empty.
//
// Columns (0-based): 0=Name, 1=Measurement1, 2=Units1, 3=Qty, 4=Units, 7=Cost Each

const { useState: uSi, useMemo: uMi } = React;

const OVERLAY = {position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:900,
  display:'flex',alignItems:'flex-start',justifyContent:'center',overflowY:'auto',padding:'32px 16px'};
const MODAL = {background:'var(--paper)',borderRadius:'var(--r)',width:760,maxWidth:'100%',
  boxShadow:'0 8px 40px rgba(0,0,0,.35)',display:'flex',flexDirection:'column',maxHeight:'85vh'};

// ── ZZTakeoff hierarchical parser ─────────────────────────────────────────────
function parseZZTakeoff(rawRows) {
  const parsed = [];
  let currentArea = 'General';
  let currentSection = 'Casework';

  for (const row of rawRows) {
    const rawName = String(row[0] || '');
    const leading  = rawName.length - rawName.trimStart().length;
    const name     = rawName.trim();
    if (!name) continue;

    const qty      = parseFloat(row[3]) || 1;
    const units    = String(row[4] || '').trim();
    const costEach = parseFloat(row[7]) || 0;

    if (leading === 0 && !units && !costEach) {
      currentArea    = name;
      currentSection = 'Casework';
      continue;
    }
    if (leading > 0 && !units && !costEach) {
      currentSection = name;
      continue;
    }
    if (units) {
      parsed.push({ _idx: parsed.length, area: currentArea, section: currentSection,
        description: name, qty, unit: units, selected: true });
    }
  }
  return parsed;
}

// ── Generic column-based parser (fallback) ────────────────────────────────────
function matchCol(headers, ...targets) {
  for (const t of targets) {
    const i = headers.findIndex(h => h.toLowerCase().includes(t.toLowerCase()));
    if (i >= 0) return i;
  }
  return -1;
}

function parseGeneric(headerRow, dataRows) {
  const iArea = matchCol(headerRow, 'area', 'location', 'room');
  const iSec  = matchCol(headerRow, 'section', 'division', 'category', 'type');
  const iDesc = matchCol(headerRow, 'description', 'item', 'desc', 'name');
  const iQty  = matchCol(headerRow, 'qty', 'quantity', 'count');
  const iUnit = matchCol(headerRow, 'unit', 'uom', 'measure');
  return dataRows.map((row, idx) => ({
    _idx: idx, area: String(row[iArea]??'').trim()||'General',
    section: String(row[iSec]??'').trim()||'Casework',
    description: String(row[iDesc]??'').trim(),
    qty: parseFloat(row[iQty])||1, unit: String(row[iUnit]??'').trim()||'EA', selected: true,
  })).filter(r => r.description);
}

function parseSheet(sheet) {
  const allRows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!allRows.length) return { rows: [] };
  const headerRow = allRows[0].map(h => String(h).trim());
  const dataRows  = allRows.slice(1).filter(r => r.some(c => c !== ''));
  const isZZ = headerRow[0] === 'Name' && headerRow.includes('Layer');
  return { rows: isZZ ? parseZZTakeoff(dataRows) : parseGeneric(headerRow, dataRows) };
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function ZZImportModal({ bidId, onClose, onImported }) {
  const [step,     setStep]     = uSi('pick');
  const [rows,     setRows]     = uSi([]);
  const [fileName, setFileName] = uSi('');
  const [error,    setError]    = uSi('');
  const [pct,      setPct]      = uSi(0);

  // Group selected rows: areas → sections → items
  const grouped = uMi(() => {
    const map = {};
    rows.forEach(r => {
      if (!map[r.area]) map[r.area] = { name: r.area, sections: {} };
      const sk = r.section;
      if (!map[r.area].sections[sk]) map[r.area].sections[sk] = { name: sk, items: [] };
      map[r.area].sections[sk].items.push(r);
    });
    return Object.values(map).map(a => ({ ...a, sections: Object.values(a.sections) }));
  }, [rows]);

  const selCount  = rows.filter(r => r.selected).length;
  const totalRows = rows.length;

  function toggleRow(idx) {
    setRows(rs => rs.map(r => r._idx === idx ? {...r, selected: !r.selected} : r));
  }
  function toggleArea(areaName, checked) {
    setRows(rs => rs.map(r => r.area === areaName ? {...r, selected: checked} : r));
  }
  function isAreaChecked(areaName) {
    const aRows = rows.filter(r => r.area === areaName);
    return aRows.length > 0 && aRows.every(r => r.selected);
  }

  function handleFile(file) {
    if (!file) return;
    setFileName(file.name); setError('');
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = window.XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const { rows: parsed } = parseSheet(wb.Sheets[wb.SheetNames[0]]);
        if (!parsed.length) { setError('No importable rows found. Make sure this is a ZZTakeoff CSV export.'); return; }
        setRows(parsed); setStep('review');
      } catch(ex) { setError('Could not parse file: ' + ex.message); }
    };
    reader.readAsArrayBuffer(file);
  }

  async function doImport() {
    const selAreas = grouped.map(a => ({
      ...a, sections: a.sections.map(s => ({
        ...s, items: s.items.filter(i => i.selected)
      })).filter(s => s.items.length)
    })).filter(a => a.sections.length);

    if (!selAreas.length) return;
    setStep('importing'); setPct(0);
    const total = selAreas.reduce((s,a) => s + a.sections.reduce((ss,s2) => ss + s2.items.length, 0), 0);
    let done = 0;
    try {
      for (let aIdx = 0; aIdx < selAreas.length; aIdx++) {
        const area = selAreas[aIdx];
        const { data: aData, error: aErr } = await window.dbHelpers.addArea(bidId, { name: area.name, qty: 1, sort_order: aIdx });
        if (aErr) throw new Error('Area: ' + aErr.message);
        for (let sIdx = 0; sIdx < area.sections.length; sIdx++) {
          const sec = area.sections[sIdx];
          const { data: sData, error: sErr } = await window.dbHelpers.addSection(aData.id, { name: sec.name, sort_order: sIdx });
          if (sErr) throw new Error('Section: ' + sErr.message);
          for (let iIdx = 0; iIdx < sec.items.length; iIdx++) {
            const item = sec.items[iIdx];
            const { error: iErr } = await window.dbHelpers.addLineItem({
              bid_id: bidId, area_id: aData.id, section_id: sData.id,
              description: item.description, qty: item.qty, unit: item.unit,
              unit_cost: 0, sort_order: iIdx,
            });
            if (iErr) throw new Error('Item: ' + iErr.message);
            done++; setPct(Math.round((done / total) * 100));
          }
        }
      }
      onImported();
    } catch(ex) { setError(ex.message); setStep('review'); }
  }

  const hdr    = {padding:'14px 20px',borderBottom:'1px solid var(--line)',display:'flex',alignItems:'center',gap:10,flexShrink:0};
  const footer = {padding:'12px 20px',borderTop:'1px solid var(--line)',display:'flex',alignItems:'center',gap:10,justifyContent:'flex-end',flexShrink:0};

  return (
    <div style={OVERLAY} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={MODAL}>
        {/* Header */}
        <div style={hdr}>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:15}}>Import ZZTakeoff</div>
            {fileName && <div style={{fontSize:11,color:'var(--mute)',marginTop:1}}>{fileName}</div>}
          </div>
          <button style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--mute)',padding:'0 4px'}}
            onClick={onClose}>×</button>
        </div>

        {/* PICK */}
        {step === 'pick' && (
          <div style={{padding:'32px 24px',textAlign:'center'}}>
            <div style={{fontSize:13,color:'var(--ink-2)',marginBottom:20}}>
              Select the CSV exported from ZZTakeoff.<br/>
              Each folder becomes an <strong>Area</strong>. Sub-folders become <strong>Sections</strong>.
            </div>
            <label style={{display:'inline-block',background:'var(--accent)',color:'#fff',
              borderRadius:'var(--r)',padding:'10px 24px',cursor:'pointer',fontWeight:600,fontSize:13}}>
              Choose File…
              <input type="file" accept=".csv,.xlsx,.xls" style={{display:'none'}}
                onChange={e=>handleFile(e.target.files[0])} />
            </label>
            {error && <div style={{marginTop:16,color:'var(--bad)',fontSize:12}}>{error}</div>}
          </div>
        )}

        {/* REVIEW — V2-style grouped table */}
        {step === 'review' && (
          <>
            <div style={{padding:'8px 20px',borderBottom:'1px solid var(--line)',display:'flex',
              alignItems:'center',gap:14,flexShrink:0}}>
              <span style={{fontSize:12,color:'var(--mute)',flex:1}}>
                {grouped.length} area{grouped.length!==1?'s':''} · {selCount} of {totalRows} items selected
              </span>
              <button className="btn ghost sm" onClick={()=>setRows(rs=>rs.map(r=>({...r,selected:true})))}>All</button>
              <button className="btn ghost sm" onClick={()=>setRows(rs=>rs.map(r=>({...r,selected:false})))}>None</button>
            </div>
            <div style={{overflowY:'auto',flex:1}}>
              {error && <div style={{padding:'8px 20px',color:'var(--bad)',fontSize:12,background:'#fff5f5'}}>{error}</div>}
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead style={{position:'sticky',top:0,zIndex:1}}>
                  <tr style={{background:'#eef3f9'}}>
                    <th style={{width:32,padding:'5px 8px'}}></th>
                    <th style={{padding:'5px 8px',textAlign:'left',fontSize:10,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--mute)'}}>Description</th>
                    <th style={{width:60,padding:'5px 8px',textAlign:'right',fontSize:10,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--mute)'}}>Qty</th>
                    <th style={{width:60,padding:'5px 8px',fontSize:10,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--mute)'}}>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(area => {
                    const areaChecked = isAreaChecked(area.name);
                    const areaItems = rows.filter(r => r.area === area.name);
                    const selInArea = areaItems.filter(r => r.selected).length;
                    return (
                      <React.Fragment key={area.name}>
                        {/* Area header row */}
                        <tr style={{background:'var(--panel-alt)',borderLeft:'3px solid var(--accent)',borderBottom:'1px solid var(--line)'}}>
                          <td style={{padding:'6px 8px',textAlign:'center'}}>
                            <input type="checkbox" checked={areaChecked}
                              onChange={e=>toggleArea(area.name, e.target.checked)}
                              style={{cursor:'pointer'}} />
                          </td>
                          <td colSpan={2} style={{padding:'6px 8px',color:'var(--ink)',fontWeight:700,fontSize:12}}>
                            {area.name}
                          </td>
                          <td style={{padding:'6px 8px',color:'var(--mute)',fontSize:11,textAlign:'right'}}>
                            {selInArea}/{areaItems.length}
                          </td>
                        </tr>
                        {/* Sections + items */}
                        {area.sections.map(sec => (
                          <React.Fragment key={sec.name}>
                            {area.sections.length > 1 && (
                              <tr style={{background:'#f0ece4'}}>
                                <td></td>
                                <td colSpan={3} style={{padding:'4px 8px 4px 20px',fontSize:10,fontWeight:700,
                                  letterSpacing:'.06em',textTransform:'uppercase',color:'var(--mute)'}}>
                                  {sec.name}
                                </td>
                              </tr>
                            )}
                            {sec.items.map(item => (
                              <tr key={item._idx} style={{borderBottom:'1px solid var(--line)',
                                opacity:item.selected?1:0.35,background:item.selected?'#fff':'rgba(0,0,0,.02)'}}>
                                <td style={{padding:'4px 8px 4px 24px'}}>
                                  <input type="checkbox" checked={item.selected}
                                    onChange={()=>toggleRow(item._idx)} style={{cursor:'pointer'}} />
                                </td>
                                <td style={{padding:'4px 8px',fontSize:11.5,color:'var(--ink)'}}>{item.description}</td>
                                <td style={{padding:'4px 8px',fontSize:11.5,textAlign:'right',fontFamily:'var(--mono)',color:'var(--mute)'}}>{item.qty}</td>
                                <td style={{padding:'4px 8px',fontSize:11.5,color:'var(--mute)'}}>{item.unit}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={footer}>
              <span style={{fontSize:11,color:'var(--mute)',flex:1}}>Unit costs import as $0 — apply pricing from library after</span>
              <button className="btn ghost" onClick={onClose}>Cancel</button>
              <button className="btn accent" disabled={selCount===0} onClick={doImport}>
                Import {selCount} item{selCount!==1?'s':''}
              </button>
            </div>
          </>
        )}

        {/* IMPORTING */}
        {step === 'importing' && (
          <div style={{padding:'40px 24px',textAlign:'center'}}>
            <div style={{fontWeight:600,fontSize:13,marginBottom:12}}>Importing… {pct}%</div>
            <div style={{height:6,background:'var(--line)',borderRadius:3,overflow:'hidden',maxWidth:320,margin:'0 auto'}}>
              <div style={{height:'100%',background:'var(--accent)',borderRadius:3,width:pct+'%',transition:'width .2s'}} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

window.ZZImportModal = ZZImportModal;
