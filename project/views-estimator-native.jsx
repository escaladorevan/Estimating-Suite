// Native React estimator — full replacement for the V2 iframe
// Activate via ?native=1 in the URL (iframe remains default)
// Mirrors FS_Estimator_v2_1.html structure: sidebar + area grid + library

const { useState, useEffect, useMemo, useCallback } = React;

function updSec(areas, areaId, secId, fn) {
  return areas.map(a => a.id!==areaId ? a : {...a, sections:a.sections.map(s=>s.id!==secId?s:fn(s))});
}

function EstimatorNative({ bidId }) {
  const [bid,     setBid]     = useState(null);
  const [tree,    setTree]    = useState(null);
  const [alts,    setAlts]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);
  const [selView, setSelView] = useState('info');
  const [selAreaId, setSelA]  = useState(null);
  const [selSecId,  setSelS]  = useState(null);
  const [selAltIdx, setSelAlt]= useState(null);
  const [collapsed, setColl]  = useState({});
  const [showImport,  setShowImport]  = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // ── Load ───────────────────────────────────────────────────────────────────
  async function loadBid() {
    setLoading(true); setErr(null);
    const { data: b, error: e1 } = await window.dbHelpers.getBid(bidId);
    if (e1) { setErr(e1.message); setLoading(false); return; }
    setBid(b);
    const { data: areas, error: e2 } = await window.dbHelpers.getAreas(bidId);
    if (e2) { setErr(e2.message); setLoading(false); return; }
    let assembled = [];
    if (areas?.length) {
      const { data: secs }  = await window.dbHelpers.getAllSections(areas.map(a=>a.id));
      const { data: items } = await window.dbHelpers.getLineItems(bidId);
      assembled = areas.map(area => ({
        ...area,
        sections: (secs||[]).filter(s=>s.area_id===area.id).sort((a,b)=>a.sort_order-b.sort_order)
          .map(sec => ({ ...sec, items:(items||[]).filter(i=>i.section_id===sec.id).sort((a,b)=>a.sort_order-b.sort_order) }))
      }));
      setSelA(assembled[0]?.id||null);
      setSelView(assembled[0] ? 'area' : 'info');
    }
    setTree({ areas: assembled });
    const { data: altData } = await window.dbHelpers.getAlternates(bidId);
    setAlts(altData||[]);
    setLoading(false);
  }

  useEffect(() => { if (bidId) loadBid().catch(e=>{setErr(e.message);setLoading(false);}); }, [bidId]);

  // ── Totals ──────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    if (!tree || !bid) return null;
    return window.EstimateEngine.calcBid({ areas:tree.areas, ohPct:bid.oh_pct??15, delPct:bid.del_pct??5, insPct:bid.ins_pct??20 });
  }, [tree, bid]);

  // ── Mutations ───────────────────────────────────────────────────────────────
  async function setMargin(f, v) {
    const num = parseFloat(v)||0;
    setBid(b=>({...b,[f]:num}));
    await window.dbHelpers.updateBid(bidId, {[f]:num});
  }
  async function addArea(name) {
    const { data, error } = await window.dbHelpers.addArea(bidId, { name, qty:1, sort_order:tree.areas.length });
    if (error) { alert(error.message); return; }
    const a = {...data, sections:[]};
    setTree(t=>({areas:[...t.areas,a]})); setSelA(a.id); setSelView('area');
  }
  async function renameArea(areaId, name) {
    setTree(t=>({areas:t.areas.map(a=>a.id===areaId?{...a,name}:a)}));
    window.dbHelpers.updateArea(areaId,{name});
  }
  async function setAreaQty(areaId, qty) {
    setTree(t=>({areas:t.areas.map(a=>a.id===areaId?{...a,qty}:a)}));
    window.dbHelpers.updateArea(areaId,{qty});
  }
  async function deleteArea(areaId) {
    if (!confirm('Delete this area and all its contents?')) return;
    await window.dbHelpers.deleteArea(areaId);
    setTree(t=>({areas:t.areas.filter(a=>a.id!==areaId)}));
    if (selAreaId===areaId) { setSelA(null); setSelS(null); }
  }
  async function duplicateArea(areaId) {
    const area = tree.areas.find(a=>a.id===areaId);
    if (!area) return;
    const { data: na, error: e1 } = await window.dbHelpers.addArea(bidId, { name:area.name+' (copy)', qty:area.qty||1, sort_order:tree.areas.length });
    if (e1) { alert(e1.message); return; }
    const newSecs = [];
    for (const sec of area.sections) {
      const { data: ns } = await window.dbHelpers.addSection(na.id, { name:sec.name });
      if (!ns) continue;
      const newItems = [];
      for (const item of sec.items) {
        const { data: ni } = await window.dbHelpers.addLineItem({ bid_id:bidId, area_id:na.id, section_id:ns.id,
          description:item.description, qty:item.qty, unit:item.unit, unit_cost:item.unit_cost,
          drawing_ref:item.drawing_ref, ignore:item.ignore, no_print:item.no_print });
        if (ni) newItems.push(ni);
      }
      newSecs.push({...ns, items:newItems});
    }
    setTree(t=>({areas:[...t.areas,{...na,sections:newSecs}]})); setSelA(na.id); setSelView('area');
  }
  async function addSection(areaId, name) {
    const area = tree.areas.find(a=>a.id===areaId);
    const { data, error } = await window.dbHelpers.addSection(areaId, { name, sort_order:area?.sections.length||0 });
    if (error) { alert(error.message); return; }
    const s = {...data, items:[]};
    setTree(t=>({areas:t.areas.map(a=>a.id===areaId?{...a,sections:[...a.sections,s]}:a)}));
    setSelA(areaId); setSelS(s.id); setSelView('area');
  }
  async function renameSection(secId, name) {
    setTree(t=>({areas:t.areas.map(a=>({...a,sections:a.sections.map(s=>s.id===secId?{...s,name}:s)}))}));
    window.dbHelpers.updateSection(secId,{name});
  }
  async function deleteSection(areaId, secId) {
    if (!confirm('Delete this section and all its items?')) return;
    await window.dbHelpers.deleteSection(secId);
    setTree(t=>({areas:t.areas.map(a=>a.id===areaId?{...a,sections:a.sections.filter(s=>s.id!==secId)}:a)}));
    if (selSecId===secId) setSelS(null);
  }
  async function duplicateSection(areaId, secId) {
    const area = tree.areas.find(a=>a.id===areaId);
    const sec = area?.sections.find(s=>s.id===secId);
    if (!sec) return;
    const { data: ns, error: e1 } = await window.dbHelpers.addSection(areaId, { name:sec.name+' (copy)', sort_order:area.sections.length });
    if (e1) { alert(e1.message); return; }
    const newItems = [];
    for (const item of sec.items) {
      const { data: ni } = await window.dbHelpers.addLineItem({ bid_id:bidId, area_id:areaId, section_id:ns.id,
        description:item.description, qty:item.qty, unit:item.unit, unit_cost:item.unit_cost,
        drawing_ref:item.drawing_ref, ignore:item.ignore, no_print:item.no_print });
      if (ni) newItems.push(ni);
    }
    setTree(t=>({areas:t.areas.map(a=>a.id!==areaId?a:{...a,sections:[...a.sections,{...ns,items:newItems}]})}));
  }
  async function addItem(secId, aId) {
    const { data, error } = await window.dbHelpers.addLineItem({
      bid_id:bidId, area_id:aId, section_id:secId, description:'', qty:1, unit:'EA', unit_cost:0, sort_order:0,
    });
    if (error) { alert(error.message); return; }
    setTree(t=>({areas:updSec(t.areas, aId, secId, s=>({...s,items:[...s.items,data]}))}));
    setTimeout(()=>document.getElementById(`gi-${data.id}-description`)?.focus(), 60);
  }
  async function updateItem(itemId, fields) {
    setTree(t=>({areas:t.areas.map(a=>({...a,sections:a.sections.map(s=>({...s,items:s.items.map(i=>i.id===itemId?{...i,...fields}:i)}))}))}) );
    window.dbHelpers.updateLineItem(itemId, fields);
  }
  async function deleteItem(itemId) {
    setTree(t=>({areas:t.areas.map(a=>({...a,sections:a.sections.map(s=>({...s,items:s.items.filter(i=>i.id!==itemId)}))}))}) );
    window.dbHelpers.deleteLineItem(itemId);
  }
  async function addAlt() {
    const { data, error } = await window.dbHelpers.addAlternate(bidId, { sort_order:alts.length });
    if (error) { alert(error.message); return; }
    setAlts(a=>[...a,data]); setSelView('alternates'); setSelAlt(alts.length);
  }
  async function updateAlt(id, fields) {
    setAlts(a=>a.map(x=>x.id===id?{...x,...fields}:x));
    window.dbHelpers.updateAlternate(id, fields);
  }
  async function deleteAlt(id) {
    setAlts(a=>a.filter(x=>x.id!==id));
    window.dbHelpers.deleteAlternate(id);
  }
  async function updateTerms(field, arr) {
    setBid(b=>({...b,[field]:arr}));
    window.dbHelpers.updateBidTerms(bidId, field, arr);
  }

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (!bidId) return <window.EmptyState heading="No bid selected" body="Open a bid from the Pipeline." />;
  if (loading) return <window.Spinner />;
  if (err) return <div style={{padding:32,color:'var(--bad)'}}>Error: {err}</div>;

  const fmt$ = n => '$'+Math.round(n||0).toLocaleString();
  const selArea = tree.areas.find(a=>a.id===selAreaId)||null;

  function insertFromLib(libItem) {
    if (!selSecId || !selAreaId) { alert('Select a section first.'); return; }
    window.dbHelpers.addLineItem({ bid_id:bidId, area_id:selAreaId, section_id:selSecId,
      description:libItem.description||libItem.desc||'', qty:1,
      unit:libItem.unit||libItem.uom||'EA', unit_cost:libItem.unit_cost||libItem.cost||0, sort_order:0,
    }).then(({data,error})=>{
      if(error){alert(error.message);return;}
      setTree(t=>({areas:updSec(t.areas,selAreaId,selSecId,s=>({...s,items:[...s.items,data]}))}));
    });
  }

  // ── Center view ─────────────────────────────────────────────────────────────
  function renderCenter() {
    if (selView==='area' && selArea) {
      return (
        <div style={{paddingBottom:32}}>
          <div style={{display:'flex',alignItems:'center',padding:'10px 16px',borderBottom:'1px solid var(--line)',
            background:'var(--panel-alt)',position:'sticky',top:0,zIndex:3}}>
            <span style={{flex:1,fontWeight:800,fontSize:14,color:'var(--ink)'}}>{selArea.name}</span>
            {(selArea.qty||1)>1 && (
              <span style={{fontSize:11,background:'var(--accent)',color:'#fff',borderRadius:4,padding:'1px 7px',fontWeight:700}}>
                ×{selArea.qty} repeated
              </span>
            )}
          </div>
          {selArea.sections.map(sec => (
            <window.ItemsGrid key={sec.id} section={sec} areaId={selArea.id}
              isActive={selSecId===sec.id}
              onClickSection={()=>setSelS(sec.id)}
              onRenameSection={renameSection}
              onDeleteSection={sid=>deleteSection(selArea.id,sid)}
              onDuplicateSection={sid=>duplicateSection(selArea.id,sid)}
              onAddItem={()=>{ setSelS(sec.id); addItem(sec.id,selArea.id); }}
              onUpdateItem={updateItem}
              onDeleteItem={deleteItem} />
          ))}
          {selArea.sections.length===0 && (
            <div style={{padding:'24px 16px',fontSize:13,color:'var(--mute)'}}>No sections yet — add one from the sidebar.</div>
          )}
        </div>
      );
    }
    if (selView==='basebid')        return <window.BaseBidView tree={tree} bid={bid} totals={totals} onSetMargin={setMargin} />;
    if (selView==='alternates')     return <window.AlternatesView alts={alts} onAdd={addAlt} onUpdate={updateAlt} onDelete={deleteAlt} />;
    if (selView==='exclusions')     return <window.TermsListView title="Exclusions" items={bid.exclusions||[]} onChange={v=>updateTerms('exclusions',v)} />;
    if (selView==='clarifications') return <window.TermsListView title="Clarifications" items={bid.clarifications||[]} onChange={v=>updateTerms('clarifications',v)} />;
    if (selView==='proposalterms')  return <window.TermsListView title="General Terms" items={bid.general_terms||[]} onChange={v=>updateTerms('general_terms',v)} />;
    if (selView==='info')           return <window.InfoView bid={bid} onSave={fields=>window.dbHelpers.updateBid(bidId,fields).then(()=>setBid(b=>({...b,...fields})))} />;
    return <div style={{padding:'32px 24px',fontSize:13,color:'var(--mute)'}}>Select a section from the sidebar.</div>;
  }

  // ── Top bar margin inputs ──────────────────────────────────────────────────
  const pctI = { width:40, font:'inherit', fontSize:11.5, textAlign:'right',
    background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.25)',
    borderRadius:3, padding:'1px 4px', color:'inherit' };

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',background:'var(--paper)',overflow:'hidden'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 14px',background:'#22201B',color:'#fff',flexShrink:0,flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
            {bid.name}
            <span style={{color:'#746B60',fontFamily:'var(--mono)',fontSize:11,fontWeight:400,marginLeft:6}}>{bid.number}</span>
          </div>
          {bid.gc_name && <div style={{fontSize:11,color:'#746B60',marginTop:1}}>{bid.gc_name}</div>}
        </div>
        {totals && (
          <div style={{display:'flex',alignItems:'center',gap:7,fontSize:12,fontFamily:'var(--mono)',flexWrap:'wrap',flexShrink:0}}>
            <span style={{color:'#A09080'}}>Mat {fmt$(totals.mat)}</span>
            {[['oh_pct','OH',bid.oh_pct??15],['del_pct','Del',bid.del_pct??5],['ins_pct','Ins',bid.ins_pct??20]].map(([f,label,v])=>(
              <span key={f} style={{color:'#A09080',display:'flex',alignItems:'center',gap:2}}>
                +{label} <input type="number" style={pctI} defaultValue={v} min="0" max="100" step="0.1" onBlur={e=>setMargin(f,e.target.value)} />%
              </span>
            ))}
            <span style={{fontWeight:700,fontSize:14,color:'#C46A3C',marginLeft:2}}>{fmt$(totals.total)}</span>
          </div>
        )}
        <div style={{display:'flex',gap:6,flexShrink:0}}>
          <button style={{background:'rgba(255,255,255,.1)',border:'none',cursor:'pointer',color:'#ddd',
            borderRadius:4,padding:'4px 10px',fontSize:11}} onClick={()=>setShowImport(true)}>⬆ Import</button>
          <button style={{background:'var(--accent)',border:'none',cursor:'pointer',color:'#fff',
            borderRadius:4,padding:'4px 10px',fontSize:11,fontWeight:600}} onClick={()=>setShowPreview(true)}>
            📄 Build Proposal
          </button>
        </div>
      </div>

      {/* 3-pane body */}
      <div style={{display:'flex',flex:1,minHeight:0,overflow:'hidden'}}>
        <window.EstimatorSidebar
          tree={tree} bid={bid} alts={alts}
          selView={selView} selAreaId={selAreaId} selSecId={selSecId}
          collapsed={collapsed} selAltIdx={selAltIdx}
          onView={v=>setSelView(v)}
          onSelectArea={id=>{setSelA(id);setSelS(null);setSelView('area');}}
          onSelectSection={(aId,sId)=>{setSelA(aId);setSelS(sId);setSelView('area');}}
          onToggleCollapse={id=>setColl(c=>({...c,[id]:!c[id]}))}
          onAddArea={addArea} onDeleteArea={deleteArea}
          onDuplicateArea={duplicateArea} onRenameArea={renameArea} onAreaQty={setAreaQty}
          onAddSection={addSection} onDeleteSection={(aId,sId)=>deleteSection(aId,sId)}
          onSelectAlt={i=>{setSelView('alternates');setSelAlt(i);}}
          onAddAlt={addAlt} />

        <div style={{flex:1,overflowY:'auto',minWidth:0}}>
          {renderCenter()}
        </div>

        <window.LibrarySidebar onInsert={insertFromLib} />
      </div>

      {/* Modals */}
      {showImport && <window.ZZImportModal bidId={bidId} onClose={()=>setShowImport(false)}
        onImported={()=>{ setShowImport(false); loadBid(); }} />}
      {showPreview && <window.ProposalPreviewModal bid={bid} areas={tree.areas} alts={alts}
        onClose={()=>setShowPreview(false)} />}
    </div>
  );
}

window.EstimatorNative = EstimatorNative;
