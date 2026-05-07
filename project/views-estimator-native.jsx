// Native React Estimator — Phase D
// Feature flag: append ?native=1 to the URL to activate.
// The iframe in views-estimator.jsx remains the default until all gates pass.
// Components: EstimatorNative (D-1 data hook, D-2 area sidebar, D-3/4 grid+library)

const { useState: uSen, useEffect: uEen, useMemo: uMen } = React;

// ── Tree helpers ──────────────────────────────────────────────
function updSec(areas, areaId, secId, fn) {
  return areas.map(a => a.id !== areaId ? a : {
    ...a, sections: a.sections.map(s => s.id !== secId ? s : fn(s))
  });
}

function normItem(i) { return { ...i, unitCost: +(i.unit_cost) || 0 }; }

// ── EstimatorNative ───────────────────────────────────────────
function EstimatorNative({ bidId }) {
  const [tree, setTree]       = uSen(null);
  const [bid, setBid]         = uSen(null);
  const [loading, setLoading] = uSen(true);
  const [err, setErr]         = uSen(null);
  const [selAreaId, setSelA]  = uSen(null);
  const [selSecId, setSelS]   = uSen(null);

  // ── Load ──
  uEen(() => {
    if (!bidId) return;
    setLoading(true); setErr(null);
    (async () => {
      const { data: bidData, error: e1 } = await window.dbHelpers.getBid(bidId);
      if (e1) { setErr(e1.message); setLoading(false); return; }
      setBid(bidData);

      const { data: areas, error: e2 } = await window.dbHelpers.getAreas(bidId);
      if (e2) { setErr(e2.message); setLoading(false); return; }

      let assembled = [];
      if (areas && areas.length) {
        const { data: secs, error: e3 } = await window.dbHelpers.getAllSections(areas.map(a => a.id));
        if (e3) { setErr(e3.message); setLoading(false); return; }

        const { data: items, error: e4 } = await window.dbHelpers.getLineItems(bidId);
        if (e4) { setErr(e4.message); setLoading(false); return; }

        assembled = areas.map(area => ({
          ...area,
          sections: (secs||[]).filter(s => s.area_id === area.id)
            .sort((a,b) => a.sort_order - b.sort_order)
            .map(sec => ({
              ...sec,
              items: (items||[]).filter(i => i.section_id === sec.id)
                .sort((a,b) => a.sort_order - b.sort_order)
                .map(normItem)
            }))
        }));

        // Auto-select first area + first section
        if (assembled.length) {
          setSelA(assembled[0].id);
          if (assembled[0].sections.length) setSelS(assembled[0].sections[0].id);
        }
      }
      setTree({ areas: assembled });
      setLoading(false);
    })().catch(e => { setErr(e.message); setLoading(false); });
  }, [bidId]);

  // ── Totals ──
  const totals = uMen(() => {
    if (!tree || !bid) return null;
    return window.EstimateEngine.calcBid({ areas: tree.areas, ohPct: bid.oh_pct??15, delPct: bid.del_pct??5, insPct: bid.ins_pct??20 });
  }, [tree, bid]);

  // ── Mutations ──
  async function doAddArea() {
    const name = prompt('Area name:'); if (!name) return;
    const { data, error } = await window.dbHelpers.addArea(bidId, { name, qty:1, sort_order: tree.areas.length });
    if (error) { alert(error.message); return; }
    const a = { ...data, sections:[] };
    setTree(t => ({ areas:[...t.areas, a] }));
    setSelA(a.id); setSelS(null);
  }

  async function doAddSection(areaId) {
    const name = prompt('Section name:'); if (!name) return;
    const area = tree.areas.find(a => a.id === areaId);
    const { data, error } = await window.dbHelpers.addSection(areaId, { name, sort_order: area?.sections.length||0 });
    if (error) { alert(error.message); return; }
    const s = { ...data, items:[] };
    setTree(t => ({ areas: t.areas.map(a => a.id===areaId ? {...a, sections:[...a.sections, s]} : a) }));
    setSelA(areaId); setSelS(s.id);
  }

  async function doDelArea(areaId) {
    if (!confirm('Delete this area and all its sections and items?')) return;
    const { error } = await window.dbHelpers.deleteArea(areaId);
    if (error) { alert(error.message); return; }
    setTree(t => ({ areas: t.areas.filter(a => a.id !== areaId) }));
    if (selAreaId === areaId) { setSelA(null); setSelS(null); }
  }

  async function doDelSection(areaId, secId) {
    if (!confirm('Delete this section and all its items?')) return;
    const { error } = await window.dbHelpers.deleteSection(secId);
    if (error) { alert(error.message); return; }
    setTree(t => ({ areas: t.areas.map(a => a.id===areaId ? {...a, sections: a.sections.filter(s => s.id!==secId)} : a) }));
    if (selSecId === secId) setSelS(null);
  }

  async function doAddItem(secId, areaId, overrides={}) {
    const { data, error } = await window.dbHelpers.addLineItem({
      bid_id: bidId, area_id: areaId, section_id: secId,
      description: overrides.description||'New item',
      qty: overrides.qty||1, unit: overrides.unit||'EA',
      unit_cost: overrides.unit_cost||0, sort_order:0,
    });
    if (error) { alert(error.message); return; }
    setTree(t => ({ areas: updSec(t.areas, areaId, secId, s => ({...s, items:[...s.items, normItem(data)]})) }));
  }

  async function doUpdateItem(areaId, secId, itemId, fields) {
    const { error } = await window.dbHelpers.updateLineItem(itemId, fields);
    if (error) { console.error(error); return; }
    setTree(t => ({
      areas: updSec(t.areas, areaId, secId, s => ({
        ...s, items: s.items.map(i => i.id===itemId ? normItem({...i,...fields}) : i)
      }))
    }));
  }

  async function doDelItem(areaId, secId, itemId) {
    const { error } = await window.dbHelpers.deleteLineItem(itemId);
    if (error) { alert(error.message); return; }
    setTree(t => ({ areas: updSec(t.areas, areaId, secId, s => ({...s, items: s.items.filter(i => i.id!==itemId)})) }));
  }

  // ── Derived selections ──
  const selArea = uMen(() => tree?.areas.find(a => a.id===selAreaId)||null, [tree, selAreaId]);
  const selSec  = uMen(() => {
    if (!tree || !selSecId) return null;
    for (const a of tree.areas) { const s = a.sections.find(s => s.id===selSecId); if (s) return s; }
    return null;
  }, [tree, selSecId]);

  // ── Guards ──
  if (!bidId) return <window.EmptyState heading="No bid selected" body="Open a bid from the Pipeline." />;
  if (loading) return <window.Spinner />;
  if (err) return <div style={{padding:32,color:'var(--bad)'}}>Error: {err}</div>;

  const fmt$ = n => '$' + Math.round(n||0).toLocaleString();

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:'var(--paper)'}}>

      {/* ── Cost bar ── */}
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'7px 16px',borderBottom:'1px solid var(--line)',background:'var(--panel-alt)',flexShrink:0,flexWrap:'wrap'}}>
        <div style={{fontWeight:700,fontSize:13,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
          {bid.name} <span style={{color:'var(--mute)',fontWeight:400,fontFamily:'var(--mono)',fontSize:11}}>{bid.number}</span>
        </div>
        {totals && (
          <div style={{display:'flex',gap:10,marginLeft:'auto',fontFamily:'var(--mono)',fontSize:12,flexWrap:'wrap'}}>
            <span><span style={{color:'var(--mute)'}}>Mat </span>{fmt$(totals.mat)}</span>
            <span style={{color:'var(--mute)'}}>+ OH {fmt$(totals.ohAmt)}</span>
            <span style={{color:'var(--mute)'}}>+ Del {fmt$(totals.delAmt)}</span>
            <span style={{color:'var(--mute)'}}>+ Ins {fmt$(totals.insAmt)}</span>
            <span style={{fontWeight:700,color:'var(--accent)',fontSize:13}}>{fmt$(totals.total)}</span>
          </div>
        )}
      </div>

      {/* ── 3-pane body ── */}
      <div style={{display:'flex',flex:1,minHeight:0,overflow:'hidden'}}>

        {/* Left: area/section tree */}
        <div style={{width:232,borderRight:'1px solid var(--line)',overflowY:'auto',flexShrink:0,background:'var(--panel-alt)'}}>
          <div style={{display:'flex',alignItems:'center',padding:'7px 10px',borderBottom:'1px solid var(--line)'}}>
            <span style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--mute)',flex:1}}>Areas</span>
            <button className="btn ghost sm" style={{fontSize:11,padding:'2px 7px'}} onClick={doAddArea}>+ Area</button>
          </div>

          {tree.areas.length === 0 && (
            <div style={{padding:'14px 12px',fontSize:12,color:'var(--mute)'}}>No areas yet.</div>
          )}

          {tree.areas.map(area => (
            <div key={area.id}>
              {/* Area row */}
              <div style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',cursor:'pointer',
                background:selAreaId===area.id&&!selSecId?'rgba(176,80,40,.07)':'transparent',
                borderLeft:selAreaId===area.id&&!selSecId?'2px solid var(--accent)':'2px solid transparent'}}
                onClick={() => { setSelA(area.id); setSelS(null); }}>
                <span style={{flex:1,fontWeight:600,fontSize:12.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{area.name}</span>
                {(area.qty||1)>1 && <span style={{fontSize:10,background:'var(--accent)',color:'#fff',borderRadius:3,padding:'1px 4px'}}>×{area.qty}</span>}
                <button style={{background:'none',border:'none',cursor:'pointer',fontSize:14,color:'var(--mute)',padding:0,lineHeight:1,flexShrink:0}}
                  onClick={e=>{e.stopPropagation();doDelArea(area.id);}}>×</button>
              </div>

              {/* Sections */}
              <div style={{paddingLeft:10}}>
                {area.sections.map(sec => (
                  <div key={sec.id} style={{display:'flex',alignItems:'center',gap:4,padding:'4px 10px 4px 8px',cursor:'pointer',fontSize:12,
                    background:selSecId===sec.id?'rgba(176,80,40,.07)':'transparent',
                    borderLeft:selSecId===sec.id?'2px solid var(--accent)':'2px solid transparent'}}
                    onClick={() => { setSelA(area.id); setSelS(sec.id); }}>
                    <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--ink-2)'}}>{sec.name}</span>
                    <span style={{fontSize:11,fontFamily:'var(--mono)',color:'var(--mute)',flexShrink:0}}>{sec.items.length}</span>
                    <button style={{background:'none',border:'none',cursor:'pointer',fontSize:13,color:'var(--mute)',padding:0,lineHeight:1,flexShrink:0}}
                      onClick={e=>{e.stopPropagation();doDelSection(area.id,sec.id);}}>×</button>
                  </div>
                ))}
                <div style={{padding:'3px 10px 6px 8px'}}>
                  <button className="btn ghost sm" style={{fontSize:10.5,padding:'2px 6px'}} onClick={()=>doAddSection(area.id)}>+ Section</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Center: items grid */}
        <div style={{flex:1,overflowY:'auto',minWidth:0}}>
          {!selSecId
            ? <div style={{padding:'32px 24px',fontSize:13,color:'var(--mute)'}}>
                {tree.areas.length===0 ? 'Add an area to start.' : 'Select a section to view its items.'}
              </div>
            : selSec
              ? <window.ItemsGrid
                  section={selSec}
                  areaId={selAreaId}
                  onAddItem={() => doAddItem(selSecId, selAreaId)}
                  onUpdateItem={(id, fields) => doUpdateItem(selAreaId, selSecId, id, fields)}
                  onDeleteItem={id => doDelItem(selAreaId, selSecId, id)}
                />
              : null
          }
        </div>

        {/* Right: library */}
        <window.LibrarySidebar
          onInsert={libItem => {
            if (!selSecId || !selAreaId) { alert('Select a section first.'); return; }
            doAddItem(selSecId, selAreaId, {
              description: libItem.description || libItem.desc || '',
              qty:         1,
              unit:        libItem.unit || libItem.uom || 'EA',
              unit_cost:   libItem.unit_cost || libItem.cost || 0,
            });
          }}
        />

      </div>
    </div>
  );
}

window.EstimatorNative = EstimatorNative;
