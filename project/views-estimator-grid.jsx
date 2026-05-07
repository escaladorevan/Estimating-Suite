// Line items grid and pricing library sidebar — native estimator Phase D-3/D-4
// Loaded before views-estimator-native.jsx; exports window.ItemsGrid and window.LibrarySidebar

const { useState: uSg, useEffect: uEg, useMemo: uMg } = React;

const UNITS = ['EA','LF','SF','SY','CY','LS','HR','TON'];

// ── Inline edit helpers ───────────────────────────────────────
const inStyle = {
  font:'inherit', fontSize:12.5,
  background:'var(--paper)', border:'1px solid var(--accent)',
  borderRadius:'var(--r-sm)', padding:'3px 6px', width:'100%',
};

// ── ItemsGrid ─────────────────────────────────────────────────
function ItemsGrid({ section, areaId, onAddItem, onUpdateItem, onDeleteItem }) {
  const [editId, setEditId]   = uSg(null);
  const [editBuf, setEditBuf] = uSg({});

  const fmt$ = n => '$' + (+(n || 0)).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });

  const secTotal = uMg(() =>
    (section.items || []).reduce((s, i) =>
      s + (i.ignore ? 0 : (+(i.qty)||0) * (+(i.unit_cost)||0)), 0),
    [section.items]
  );

  function startEdit(item) {
    setEditId(item.id);
    setEditBuf({ description: item.description||'', qty: item.qty||1, unit: item.unit||'EA', unit_cost: item.unit_cost||0 });
  }

  async function commitEdit(itemId) {
    await onUpdateItem(itemId, {
      description: editBuf.description,
      qty:         +editBuf.qty  || 0,
      unit:        editBuf.unit,
      unit_cost:   +editBuf.unit_cost || 0,
    });
    setEditId(null);
  }

  return (
    <div style={{paddingBottom:40}}>
      {/* Section header */}
      <div style={{display:'flex',alignItems:'center',padding:'9px 16px',borderBottom:'1px solid var(--line)',position:'sticky',top:0,background:'var(--paper)',zIndex:2}}>
        <div style={{fontWeight:700,fontSize:13}}>{section.name}</div>
        <div style={{flex:1}}/>
        <div style={{fontFamily:'var(--mono)',fontSize:12,fontWeight:600,color:'var(--accent)'}}>
          ${Math.round(secTotal).toLocaleString()}
        </div>
      </div>

      {/* Items table */}
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
        <thead>
          <tr style={{background:'var(--panel-alt)'}}>
            {['Description','Qty','Unit','Unit Cost','Total',''].map((h,i) => (
              <th key={i} style={{padding:'5px '+(i===0?'16px':'8px'),textAlign:i===0?'left':i===5?'center':'right',fontWeight:600,fontSize:10,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--mute)',whiteSpace:'nowrap',width:i===0?undefined:i===1?60:i===2?68:i===3||i===4?88:32}}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(section.items || []).map(item => {
            const isEditing = editId === item.id;
            const rowTotal  = (+(item.qty)||0) * (+(item.unit_cost)||0);
            return (
              <tr key={item.id} style={{borderBottom:'1px solid var(--line)',background:item.ignore?'var(--panel-alt)':'transparent'}}
                  onDoubleClick={() => !isEditing && startEdit(item)}>
                <td style={{padding:'6px 16px'}}>
                  {isEditing
                    ? <input style={inStyle} autoFocus value={editBuf.description} onChange={e => setEditBuf(b=>({...b,description:e.target.value}))} onKeyDown={e => {if(e.key==='Enter') commitEdit(item.id); if(e.key==='Escape') setEditId(null);}} />
                    : <span style={{color:item.ignore?'var(--mute)':'inherit'}}>{item.description||'—'}</span>}
                </td>
                <td style={{padding:'6px 8px',textAlign:'right',fontFamily:'var(--mono)'}}>
                  {isEditing
                    ? <input type="number" style={{...inStyle,width:52,textAlign:'right'}} value={editBuf.qty} onChange={e => setEditBuf(b=>({...b,qty:e.target.value}))} />
                    : item.qty}
                </td>
                <td style={{padding:'6px 8px',textAlign:'center'}}>
                  {isEditing
                    ? <select style={{...inStyle,padding:'3px 4px'}} value={editBuf.unit} onChange={e => setEditBuf(b=>({...b,unit:e.target.value}))}>
                        {UNITS.map(u => <option key={u}>{u}</option>)}
                      </select>
                    : <span className="chip" style={{fontSize:10}}>{item.unit}</span>}
                </td>
                <td style={{padding:'6px 8px',textAlign:'right',fontFamily:'var(--mono)'}}>
                  {isEditing
                    ? <input type="number" style={{...inStyle,width:80,textAlign:'right'}} value={editBuf.unit_cost} onChange={e => setEditBuf(b=>({...b,unit_cost:e.target.value}))} />
                    : fmt$(item.unit_cost)}
                </td>
                <td style={{padding:'6px 8px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:600}}>
                  {item.ignore ? <span className="muted">—</span> : fmt$(rowTotal)}
                </td>
                <td style={{padding:'6px 8px',textAlign:'center'}}>
                  {isEditing
                    ? <button className="btn accent sm" style={{padding:'2px 7px',fontSize:11}} onClick={() => commitEdit(item.id)}>✓</button>
                    : <button style={{background:'none',border:'none',cursor:'pointer',fontSize:15,color:'var(--mute)',lineHeight:1,padding:'0 2px'}} onClick={() => onDeleteItem(item.id)}>×</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {(section.items||[]).length === 0 && (
        <div style={{padding:'18px 16px',fontSize:12.5,color:'var(--mute)'}}>
          No items yet. Add one or insert from the library →
        </div>
      )}

      <div style={{padding:'8px 16px'}}>
        <button className="btn ghost sm" onClick={onAddItem}>+ Add item</button>
      </div>
    </div>
  );
}

// ── LibrarySidebar ────────────────────────────────────────────
function LibrarySidebar({ onInsert }) {
  const [items, setItems] = uSg(null);
  const [query, setQuery] = uSg('');
  const [fuse, setFuse]   = uSg(null);

  uEg(() => {
    window.dbHelpers.getLibraryItems().then(({ data }) => {
      if (!data) return;
      setItems(data);
      if (typeof window.Fuse === 'function') {
        setFuse(new window.Fuse(data, { keys:['description','category'], threshold:0.35 }));
      }
    });
  }, []);

  const results = uMg(() => {
    if (!items) return [];
    if (!query.trim()) return items.slice(0, 60);
    return fuse ? fuse.search(query).map(r => r.item).slice(0, 60) : items.slice(0, 60);
  }, [query, items, fuse]);

  return (
    <div style={{width:260,borderLeft:'1px solid var(--line)',display:'flex',flexDirection:'column',flexShrink:0,background:'var(--panel-alt)'}}>
      <div style={{padding:'8px 10px 7px',borderBottom:'1px solid var(--line)',flexShrink:0}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--mute)',marginBottom:5}}>Pricing Library</div>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search items…"
          style={{width:'100%',font:'inherit',fontSize:12,background:'var(--paper)',border:'1px solid var(--line)',borderRadius:'var(--r-sm)',padding:'5px 8px'}} />
      </div>
      <div style={{overflowY:'auto',flex:1}}>
        {!items && <div style={{padding:14,fontSize:12,color:'var(--mute)'}}>Loading library…</div>}
        {items && results.length === 0 && query && (
          <div style={{padding:14,fontSize:12,color:'var(--mute)'}}>No results for "{query}"</div>
        )}
        {results.map((item, i) => (
          <div key={item.id||i} onClick={() => onInsert && onInsert(item)}
            style={{padding:'6px 10px',borderBottom:'1px solid var(--line)',cursor:'pointer',fontSize:11.5}}
            title={`${item.description} — $${item.unit_cost} / ${item.unit||'EA'}`}>
            <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500}}>{item.description}</div>
            <div style={{display:'flex',justifyContent:'space-between',marginTop:2,fontSize:10.5,color:'var(--mute)'}}>
              <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:140}}>{item.category||'—'}</span>
              <span style={{fontFamily:'var(--mono)',color:'var(--accent)',flexShrink:0,marginLeft:6}}>${item.unit_cost}/{item.unit||'EA'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

window.ItemsGrid      = ItemsGrid;
window.LibrarySidebar = LibrarySidebar;
