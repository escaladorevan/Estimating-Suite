// ZZTakeoff import modal — parses an Excel takeoff sheet into areas/sections/items.
// Expected columns (case-insensitive, flexible): Area | Section/Division | Description | Qty | Unit
// window.ZZImportModal = ZZImportModal

const { useState: uSi, useMemo: uMi } = React;

const OVERLAY = {position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:900,
  display:'flex',alignItems:'flex-start',justifyContent:'center',overflowY:'auto',padding:'32px 16px'};
const MODAL = {background:'var(--paper)',borderRadius:'var(--r)',width:900,maxWidth:'100%',
  boxShadow:'0 8px 40px rgba(0,0,0,.35)',display:'flex',flexDirection:'column',maxHeight:'85vh'};

function matchCol(headers, ...targets) {
  for (const t of targets) {
    const i = headers.findIndex(h => h.toLowerCase().includes(t.toLowerCase()));
    if (i >= 0) return i;
  }
  return -1;
}

function parseSheet(sheet) {
  const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rows.length) return { headers: [], rows: [] };
  const headerRow = rows[0].map(h => String(h).trim());
  const data = rows.slice(1).filter(r => r.some(c => c !== ''));

  const iArea = matchCol(headerRow, 'area', 'location', 'room');
  const iSec  = matchCol(headerRow, 'section', 'division', 'category', 'type');
  const iDesc = matchCol(headerRow, 'description', 'item', 'desc', 'name');
  const iQty  = matchCol(headerRow, 'qty', 'quantity', 'count');
  const iUnit = matchCol(headerRow, 'unit', 'uom', 'measure');
  const iNote = matchCol(headerRow, 'note', 'comment', 'remarks');

  const parsed = data.map((row, idx) => ({
    _idx: idx,
    area:        String(row[iArea] ?? '').trim() || 'General',
    section:     String(row[iSec]  ?? '').trim() || 'Scope',
    description: String(row[iDesc] ?? '').trim(),
    qty:         parseFloat(row[iQty]) || 1,
    unit:        String(row[iUnit] ?? '').trim() || 'EA',
    note:        String(row[iNote] ?? '').trim(),
    selected:    true,
  })).filter(r => r.description);

  return { headers: headerRow, rows: parsed, colMap: { iArea, iSec, iDesc, iQty, iUnit, iNote } };
}

function ZZImportModal({ bidId, onClose, onImported }) {
  const [step,     setStep]     = uSi('pick');   // 'pick' | 'review' | 'importing'
  const [rows,     setRows]     = uSi([]);
  const [headers,  setHeaders]  = uSi([]);
  const [fileName, setFileName] = uSi('');
  const [error,    setError]    = uSi('');
  const [pct,      setPct]      = uSi(0);

  const grouped = uMi(() => {
    const sel = rows.filter(r => r.selected);
    const map = {};
    sel.forEach(r => {
      const ak = r.area;
      if (!map[ak]) map[ak] = { name: ak, sections: {} };
      const sk = r.section;
      if (!map[ak].sections[sk]) map[ak].sections[sk] = { name: sk, items: [] };
      map[ak].sections[sk].items.push(r);
    });
    return Object.values(map).map(a => ({ ...a, sections: Object.values(a.sections) }));
  }, [rows]);

  const selCount = rows.filter(r => r.selected).length;

  function handleFile(file) {
    if (!file) return;
    setFileName(file.name); setError('');
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = window.XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const sheetName = wb.SheetNames[0];
        const { rows: parsed, headers: hdrs } = parseSheet(wb.Sheets[sheetName]);
        if (!parsed.length) { setError('No data rows found. Check that the first row contains column headers.'); return; }
        setHeaders(hdrs); setRows(parsed); setStep('review');
      } catch(ex) { setError('Could not parse file: ' + ex.message); }
    };
    reader.readAsArrayBuffer(file);
  }

  function toggleRow(idx) {
    setRows(rs => rs.map(r => r._idx === idx ? { ...r, selected: !r.selected } : r));
  }

  function editRowField(idx, field, val) {
    setRows(rs => rs.map(r => r._idx === idx ? { ...r, [field]: val } : r));
  }

  async function doImport() {
    setStep('importing'); setPct(0);
    const areas = grouped;
    const total = areas.reduce((s, a) => s + a.sections.reduce((ss, s2) => ss + s2.items.length, 0), 0);
    let done = 0;

    try {
      for (const area of areas) {
        const { data: aData, error: aErr } = await window.dbHelpers.addArea(bidId, { name: area.name, qty: 1 });
        if (aErr) throw new Error('Area: ' + aErr.message);
        for (const sec of area.sections) {
          const { data: sData, error: sErr } = await window.dbHelpers.addSection(aData.id, { name: sec.name });
          if (sErr) throw new Error('Section: ' + sErr.message);
          for (const item of sec.items) {
            const { error: iErr } = await window.dbHelpers.addLineItem({
              bid_id: bidId, area_id: aData.id, section_id: sData.id,
              description: item.description, qty: item.qty, unit: item.unit, unit_cost: 0,
            });
            if (iErr) throw new Error('Item: ' + iErr.message);
            done++;
            setPct(Math.round((done / total) * 100));
          }
        }
      }
      onImported();
    } catch(ex) {
      setError(ex.message); setStep('review');
    }
  }

  const hdr = { padding:'14px 20px', borderBottom:'1px solid var(--line)', display:'flex',
    alignItems:'center', gap:10, flexShrink:0 };
  const footer = { padding:'12px 20px', borderTop:'1px solid var(--line)', display:'flex',
    alignItems:'center', gap:10, justifyContent:'flex-end', flexShrink:0 };

  return (
    <div style={OVERLAY} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={MODAL}>
        <div style={hdr}>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:15}}>Import ZZTakeoff</div>
            {fileName && <div style={{fontSize:11,color:'var(--mute)',marginTop:1}}>{fileName}</div>}
          </div>
          <button style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--mute)',padding:'0 4px'}}
            onClick={onClose}>×</button>
        </div>

        {/* PICK step */}
        {step === 'pick' && (
          <div style={{padding:'32px 24px',textAlign:'center'}}>
            <div style={{fontSize:13,color:'var(--ink-2)',marginBottom:20}}>
              Select an Excel file (.xlsx) exported from ZZTakeoff.<br/>
              Expected columns: <strong>Area, Section, Description, Qty, Unit</strong>
            </div>
            <label style={{display:'inline-block',background:'var(--accent)',color:'#fff',
              borderRadius:'var(--r)',padding:'10px 24px',cursor:'pointer',fontWeight:600,fontSize:13}}>
              Choose File…
              <input type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}}
                onChange={e=>handleFile(e.target.files[0])} />
            </label>
            {error && <div style={{marginTop:16,color:'var(--bad)',fontSize:12}}>{error}</div>}
          </div>
        )}

        {/* REVIEW step */}
        {step === 'review' && (
          <>
            <div style={{padding:'10px 20px',borderBottom:'1px solid var(--line)',display:'flex',alignItems:'center',gap:16,flexShrink:0}}>
              <span style={{fontSize:12,color:'var(--mute)'}}>{selCount} of {rows.length} rows selected</span>
              <button className="btn ghost sm" onClick={()=>setRows(rs=>rs.map(r=>({...r,selected:true})))}>Select all</button>
              <button className="btn ghost sm" onClick={()=>setRows(rs=>rs.map(r=>({...r,selected:false})))}>Deselect all</button>
            </div>
            <div style={{overflowY:'auto',flex:1}}>
              {error && <div style={{padding:'8px 20px',color:'var(--bad)',fontSize:12,background:'#fff5f5'}}>{error}</div>}
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead style={{position:'sticky',top:0,background:'var(--panel-alt)',zIndex:1}}>
                  <tr>
                    {['','Area','Section','Description','Qty','Unit'].map((h,i)=>(
                      <th key={i} style={{padding:'5px 8px',textAlign:'left',fontSize:10,fontWeight:700,
                        letterSpacing:'.08em',textTransform:'uppercase',color:'var(--mute)',
                        borderBottom:'1px solid var(--line)'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row._idx} style={{borderBottom:'1px solid var(--line)',opacity:row.selected?1:0.4,
                      background:row.selected?'transparent':'rgba(0,0,0,.02)'}}>
                      <td style={{padding:'3px 8px'}}>
                        <input type="checkbox" checked={row.selected} onChange={()=>toggleRow(row._idx)} style={{cursor:'pointer'}} />
                      </td>
                      <td style={{padding:'3px 6px'}}>
                        <input value={row.area} onChange={e=>editRowField(row._idx,'area',e.target.value)}
                          style={{font:'inherit',fontSize:11.5,border:'none',background:'transparent',width:'100%',padding:'1px 3px'}} />
                      </td>
                      <td style={{padding:'3px 6px'}}>
                        <input value={row.section} onChange={e=>editRowField(row._idx,'section',e.target.value)}
                          style={{font:'inherit',fontSize:11.5,border:'none',background:'transparent',width:'100%',padding:'1px 3px'}} />
                      </td>
                      <td style={{padding:'3px 6px',minWidth:200}}>
                        <input value={row.description} onChange={e=>editRowField(row._idx,'description',e.target.value)}
                          style={{font:'inherit',fontSize:11.5,border:'none',background:'transparent',width:'100%',padding:'1px 3px'}} />
                      </td>
                      <td style={{padding:'3px 6px'}}>
                        <input type="number" value={row.qty} onChange={e=>editRowField(row._idx,'qty',+e.target.value||1)}
                          style={{font:'inherit',fontSize:11.5,border:'none',background:'transparent',width:50,textAlign:'right',padding:'1px 3px'}} />
                      </td>
                      <td style={{padding:'3px 6px'}}>
                        <input value={row.unit} onChange={e=>editRowField(row._idx,'unit',e.target.value)}
                          style={{font:'inherit',fontSize:11.5,border:'none',background:'transparent',width:52,padding:'1px 3px'}} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={footer}>
              <span style={{fontSize:11,color:'var(--mute)',flex:1}}>
                {grouped.length} area{grouped.length!==1?'s':''} · prices will be set to $0 (apply from library after import)
              </span>
              <button className="btn ghost" onClick={onClose}>Cancel</button>
              <button className="btn accent" disabled={selCount===0} onClick={doImport}>
                Import {selCount} item{selCount!==1?'s':''}
              </button>
            </div>
          </>
        )}

        {/* IMPORTING step */}
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
