// Line items grid + pricing library sidebar
// ItemsGrid: always-editable rows, Tab/Enter/Escape keyboard nav, save on blur
// LibrarySidebar: fuzzy search + category filter, click to insert

const { useState: uSg, useMemo: uMg, useEffect: uEg } = React;
const UNITS = ['EA','LF','SF','SY','CY','LS','HR','TON','BF','MBF','lin. ft','sq. ft.','set'];

// ── ItemsGrid ─────────────────────────────────────────────────────────────────
function ItemsGrid({ section, areaId, onAddItem, onUpdateItem, onDeleteItem,
                     onRenameSection, onDeleteSection, isActive, onClickSection }) {
  const [drafts, setDrafts] = uSg({});
  const [editSec, setEditSec] = uSg(false);

  const secTotal = uMg(() =>
    (section.items||[]).reduce((s,i) => s + (i.ignore ? 0 : (+(i.qty)||0)*(+(i.unit_cost)||0)), 0),
    [section.items]
  );

  const get = (item, f) => (drafts[item.id]??{})[f] !== undefined ? drafts[item.id][f] : item[f];

  function draft(id, f, v) {
    setDrafts(d => ({ ...d, [id]: { ...(d[id]||{}), [f]: v } }));
  }

  async function flush(item, f) {
    const v = (drafts[item.id]??{})[f];
    if (v === undefined) return;
    const coerced = (f === 'qty' || f === 'unit_cost') ? (+v || 0) : v;
    await onUpdateItem(item.id, { [f]: coerced });
    setDrafts(d => { const n = {...d,[item.id]:{...(d[item.id]||{})}}; delete n[item.id][f]; return n; });
  }

  const cid = (itemId, f) => `gi-${itemId}-${f}`;

  function nav(e, item, f) {
    const FS = ['description','qty','unit','unit_cost'];
    const fi = FS.indexOf(f);
    const items = section.items||[];
    const ii = items.findIndex(x => x.id === item.id);
    if (e.key === 'Tab') {
      e.preventDefault();
      flush(item, f);
      const target = !e.shiftKey
        ? (fi < FS.length-1 ? cid(item.id, FS[fi+1]) : (items[ii+1] ? cid(items[ii+1].id,'description') : null))
        : (fi > 0 ? cid(item.id, FS[fi-1]) : (ii > 0 ? cid(items[ii-1].id,'unit_cost') : null));
      if (target) document.getElementById(target)?.focus();
      else if (!e.shiftKey) onAddItem();
    } else if (e.key === 'Enter') {
      e.preventDefault(); flush(item, f);
      const ni = items[ii+1];
      if (ni) document.getElementById(cid(ni.id,'description'))?.focus();
      else onAddItem();
    } else if (e.key === 'Escape') {
      setDrafts(d => { const n={...d}; delete n[item.id]; return n; });
    }
  }

  const fmt$ = n => '$'+(+(n||0)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const inp = { font:'inherit', fontSize:12.5, width:'100%', padding:'3px 5px',
    border:'1px solid transparent', background:'transparent', borderRadius:3,
    boxSizing:'border-box', outline:'none' };
  const focusBorder = e => { e.target.style.borderColor='var(--accent)'; e.target.style.background='var(--paper)'; };
  const blurBorder  = e => { e.target.style.borderColor='transparent'; e.target.style.background='transparent'; };

  return (
    <div onClick={onClickSection}
      style={{marginBottom:0, borderBottom:'2px solid var(--line)', background: isActive ? 'rgba(176,80,40,.02)' : 'transparent'}}>
      {/* Section sticky header */}
      <div style={{display:'flex',alignItems:'center',padding:'7px 16px',borderBottom:'1px solid var(--line)',
        position:'sticky',top:0,background: isActive ? '#faf4ee' : 'var(--panel-alt)',zIndex:2,
        borderLeft:`3px solid ${isActive ? 'var(--accent)' : 'transparent'}`}}>
        {editSec && onRenameSection ? (
          <input autoFocus defaultValue={section.name}
            style={{flex:1,font:'inherit',fontSize:13,fontWeight:700,background:'var(--paper)',
              border:'1px solid var(--accent)',borderRadius:3,padding:'2px 6px'}}
            onBlur={e=>{setEditSec(false); const v=e.target.value.trim(); if(v&&v!==section.name) onRenameSection(section.id,v);}}
            onKeyDown={e=>{if(e.key==='Enter')e.target.blur(); if(e.key==='Escape')setEditSec(false);}} />
        ) : (
          <span style={{flex:1,fontWeight:700,fontSize:13,cursor:'pointer',color:isActive?'var(--accent)':'var(--ink)'}}
            onDoubleClick={()=>onRenameSection&&setEditSec(true)}>{section.name}</span>
        )}
        <span style={{fontFamily:'var(--mono)',fontSize:12,fontWeight:700,color:'var(--accent)',marginLeft:8}}>
          ${Math.round(secTotal).toLocaleString()}
        </span>
        {onDeleteSection && (
          <button style={{background:'none',border:'none',cursor:'pointer',fontSize:15,color:'var(--mute)',padding:'0 0 0 8px',lineHeight:1}}
            onClick={e=>{e.stopPropagation(); onDeleteSection(section.id);}}>×</button>
        )}
      </div>
      {/* Items table */}
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5,tableLayout:'fixed'}}>
        <colgroup><col/><col style={{width:64}}/><col style={{width:78}}/><col style={{width:96}}/><col style={{width:92}}/><col style={{width:28}}/></colgroup>
        <thead>
          <tr style={{background:'var(--panel-alt)'}}>
            {['Description','Qty','Unit','Unit Cost','Total',''].map((h,i)=>(
              <th key={i} style={{padding:'3px '+(i===0?'16px':'8px'),textAlign:i<2?'left':i===2?'center':'right',
                fontSize:10,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--mute)'}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(section.items||[]).map(item => {
            const rt = (+(item.qty)||0)*(+(item.unit_cost)||0);
            return (
              <tr key={item.id} style={{borderBottom:'1px solid var(--line)',opacity:item.ignore?0.4:1}}>
                <td style={{padding:'2px 16px 2px 8px'}}>
                  <input id={cid(item.id,'description')} style={inp} value={get(item,'description')||''}
                    placeholder="Description…" onChange={e=>draft(item.id,'description',e.target.value)}
                    onFocus={focusBorder} onBlur={e=>{blurBorder(e);flush(item,'description');}}
                    onKeyDown={e=>nav(e,item,'description')} />
                </td>
                <td style={{padding:'2px 8px'}}>
                  <input id={cid(item.id,'qty')} type="number" step="any" style={{...inp,textAlign:'right'}}
                    value={get(item,'qty')??1} onChange={e=>draft(item.id,'qty',e.target.value)}
                    onFocus={focusBorder} onBlur={e=>{blurBorder(e);flush(item,'qty');}}
                    onKeyDown={e=>nav(e,item,'qty')} />
                </td>
                <td style={{padding:'2px 8px'}}>
                  <select id={cid(item.id,'unit')} style={{...inp,padding:'3px 2px'}} value={get(item,'unit')||'EA'}
                    onChange={e=>onUpdateItem(item.id,{unit:e.target.value})}
                    onFocus={focusBorder} onBlur={blurBorder} onKeyDown={e=>nav(e,item,'unit')}>
                    {UNITS.map(u=><option key={u}>{u}</option>)}
                  </select>
                </td>
                <td style={{padding:'2px 8px'}}>
                  <input id={cid(item.id,'unit_cost')} type="number" step="any" style={{...inp,textAlign:'right'}}
                    value={get(item,'unit_cost')??0} onChange={e=>draft(item.id,'unit_cost',e.target.value)}
                    onFocus={focusBorder} onBlur={e=>{blurBorder(e);flush(item,'unit_cost');}}
                    onKeyDown={e=>nav(e,item,'unit_cost')} />
                </td>
                <td style={{padding:'2px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:600,
                  color:item.ignore?'var(--mute)':'var(--ink)',whiteSpace:'nowrap'}}>
                  {item.ignore ? '—' : fmt$(rt)}
                </td>
                <td style={{padding:'2px 4px',textAlign:'center'}}>
                  <button style={{background:'none',border:'none',cursor:'pointer',fontSize:17,color:'var(--mute)',lineHeight:1,padding:0}}
                    onClick={()=>onDeleteItem(item.id)}>×</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(section.items||[]).length===0 && (
        <div style={{padding:'12px 16px',fontSize:12,color:'var(--mute)'}}>No items — add below or insert from the library →</div>
      )}
      <div style={{padding:'6px 16px 12px'}}>
        <button className="btn ghost sm" onClick={e=>{e.stopPropagation();onAddItem();}}>+ Add item</button>
      </div>
    </div>
  );
}

// ── LibrarySidebar ────────────────────────────────────────────────────────────
function LibrarySidebar({ onInsert }) {
  const [items, setItems] = uSg(null);
  const [query, setQuery] = uSg('');
  const [cat, setCat]     = uSg('');
  const [fuse, setFuse]   = uSg(null);
  const [cats, setCats]   = uSg([]);

  uEg(() => {
    window.dbHelpers.getLibraryItems().then(({ data }) => {
      if (!data) return;
      setItems(data);
      setCats([...new Set(data.map(i=>i.category||'').filter(Boolean))].sort());
      if (typeof window.Fuse === 'function')
        setFuse(new window.Fuse(data, { keys:['description','category'], threshold:0.35 }));
    });
  }, []);

  const results = uMg(() => {
    if (!items) return [];
    let pool = cat ? items.filter(i=>(i.category||'')===cat) : items;
    if (!query.trim()) return pool.slice(0,80);
    const raw = fuse ? fuse.search(query).map(r=>r.item) : pool;
    return (cat ? raw.filter(i=>(i.category||'')===cat) : raw).slice(0,80);
  }, [query, cat, items, fuse]);

  return (
    <div style={{width:252,borderLeft:'1px solid var(--line)',display:'flex',flexDirection:'column',flexShrink:0,background:'var(--panel-alt)'}}>
      <div style={{padding:'8px 10px',borderBottom:'1px solid var(--line)',flexShrink:0}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--mute)',marginBottom:5}}>Pricing Library</div>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search…"
          style={{width:'100%',font:'inherit',fontSize:12,background:'var(--paper)',border:'1px solid var(--line)',
            borderRadius:'var(--r-sm)',padding:'4px 8px',boxSizing:'border-box',marginBottom:4}} />
        {cats.length > 0 && (
          <select value={cat} onChange={e=>setCat(e.target.value)}
            style={{width:'100%',font:'inherit',fontSize:11,background:'var(--paper)',border:'1px solid var(--line)',
              borderRadius:'var(--r-sm)',padding:'3px 6px',boxSizing:'border-box'}}>
            <option value="">All Categories</option>
            {cats.map(c=><option key={c}>{c}</option>)}
          </select>
        )}
      </div>
      <div style={{overflowY:'auto',flex:1}}>
        {!items && <div style={{padding:12,fontSize:12,color:'var(--mute)'}}>Loading…</div>}
        {items && results.length===0 && (query||cat) && <div style={{padding:12,fontSize:12,color:'var(--mute)'}}>No results.</div>}
        {results.map((item,i) => (
          <div key={item.id||i} onClick={()=>onInsert&&onInsert(item)}
            style={{padding:'5px 10px',borderBottom:'1px solid var(--line)',cursor:'pointer',fontSize:11.5}}
            title={`${item.description} — $${item.unit_cost}/${item.unit||'EA'}`}>
            <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500,color:'var(--ink)'}}>{item.description}</div>
            <div style={{display:'flex',justifyContent:'space-between',marginTop:2,fontSize:10.5,color:'var(--mute)'}}>
              <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:120}}>{item.category||'—'}</span>
              <span style={{fontFamily:'var(--mono)',color:'var(--accent)',flexShrink:0}}>${item.unit_cost}/{item.unit||'EA'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

window.ItemsGrid      = ItemsGrid;
window.LibrarySidebar = LibrarySidebar;
