// Center panel views for native estimator
// BaseBidView, AlternatesView, TermsListView, InfoView
// All receive data + callbacks from EstimatorNative

const { useState: uSc } = React;

// ── BaseBidView ────────────────────────────────────────────────────────────────
function BaseBidView({ tree, bid, totals, onSetMargin }) {
  if (!totals) return <div style={{padding:24,color:'var(--mute)'}}>No estimate data yet.</div>;
  const fmt$ = n => '$'+Math.round(n||0).toLocaleString();
  const pInp = { width:44, font:'inherit', fontSize:12, textAlign:'right',
    border:'1px solid var(--line)', borderRadius:3, padding:'1px 4px' };

  return (
    <div style={{padding:16,overflowY:'auto',maxWidth:700}}>
      <div style={{fontWeight:700,fontSize:14,marginBottom:14,color:'var(--ink)'}}>Base Bid Summary</div>

      {/* Area breakdown table */}
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,marginBottom:20,background:'#fff',
        borderRadius:6,overflow:'hidden',boxShadow:'0 1px 4px rgba(0,0,0,.08)'}}>
        <thead>
          <tr style={{background:'#22201B',color:'#fff'}}>
            <th style={{padding:'7px 14px',textAlign:'left',fontSize:11,fontWeight:600}}>Area</th>
            <th style={{padding:'7px 14px',textAlign:'center',fontSize:11,fontWeight:600,width:60}}>Qty</th>
            <th style={{padding:'7px 14px',textAlign:'right',fontSize:11,fontWeight:600,width:120}}>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {(tree?.areas||[]).map(area => {
            const secSub = (area.sections||[]).reduce((s,sec)=>
              s+(sec.items||[]).reduce((ss,i)=>ss+(i.ignore?0:(+(i.qty)||0)*(+(i.unit_cost)||0)),0),0);
            const aTotal = (area.qty||1)*secSub;
            return (
              <tr key={area.id} style={{borderBottom:'1px solid var(--line)',opacity:area.ignore?0.4:1}}>
                <td style={{padding:'7px 14px',color:'var(--ink)'}}>{area.name}</td>
                <td style={{padding:'7px 14px',textAlign:'center',fontFamily:'var(--mono)',fontSize:12,color:'var(--mute)'}}>×{area.qty||1}</td>
                <td style={{padding:'7px 14px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:600}}>{fmt$(aTotal)}</td>
              </tr>
            );
          })}
          {(tree?.areas||[]).length===0 && (
            <tr><td colSpan={3} style={{padding:'12px 14px',color:'var(--mute)',fontSize:12}}>No areas yet.</td></tr>
          )}
          <tr style={{background:'var(--panel-alt)',borderTop:'2px solid var(--accent)'}}>
            <td style={{padding:'7px 14px',fontWeight:700,color:'var(--ink)'}} colSpan={2}>Material Total</td>
            <td style={{padding:'7px 14px',textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,color:'var(--accent)'}}>{fmt$(totals.mat)}</td>
          </tr>
        </tbody>
      </table>

      {/* Bid calculation box */}
      <div style={{background:'#fff',border:'1px solid var(--line)',borderRadius:6,padding:'14px 18px',maxWidth:380}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:10,paddingBottom:6,borderBottom:'1px solid var(--line)',color:'var(--ink)'}}>
          Bid Calculation
        </div>
        {[
          { label:'Material',    val:fmt$(totals.mat),     margin:null },
          { label:'+ Overhead',  val:`+ ${fmt$(totals.ohAmt)}`,  margin:{f:'oh_pct',  v:bid.oh_pct??15}  },
          { label:'= Mat + OH',  val:fmt$(totals.matOh),   margin:null },
          { label:'+ Delivery',  val:`+ ${fmt$(totals.delAmt)}`, margin:{f:'del_pct', v:bid.del_pct??5}  },
          { label:'+ Install',   val:`+ ${fmt$(totals.insAmt)}`, margin:{f:'ins_pct', v:bid.ins_pct??20} },
        ].map(({label,val,margin})=>(
          <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',
            padding:'5px 0',borderBottom:'1px solid #f5f0ea',fontSize:13}}>
            <span style={{color:'var(--ink-2)'}}>{label}</span>
            <div style={{display:'flex',alignItems:'center',gap:6,fontFamily:'var(--mono)'}}>
              {margin && (
                <span style={{fontSize:11,color:'var(--mute)',display:'flex',alignItems:'center',gap:2}}>
                  <input type="number" min="0" max="100" step="0.1" style={pInp}
                    defaultValue={margin.v}
                    onBlur={e=>onSetMargin(margin.f, +e.target.value||0)} />%
                </span>
              )}
              <span style={{fontWeight:600}}>{val}</span>
            </div>
          </div>
        ))}
        <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0 2px',
          borderTop:'2px solid var(--accent)',fontSize:15,fontWeight:700}}>
          <span style={{color:'var(--ink)'}}>Base Bid Total</span>
          <span style={{color:'var(--accent)',fontFamily:'var(--mono)'}}>{fmt$(totals.total)}</span>
        </div>
      </div>
    </div>
  );
}

// ── AlternatesView ─────────────────────────────────────────────────────────────
function AlternatesView({ alts, onAdd, onUpdate, onDelete }) {
  const fmt$ = n => '$'+(+(n||0)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const inp = { font:'inherit', fontSize:12.5, width:'100%', padding:'4px 8px',
    border:'1px solid var(--line)', borderRadius:3, boxSizing:'border-box', background:'#fff' };
  return (
    <div style={{padding:16,overflowY:'auto'}}>
      <div style={{display:'flex',alignItems:'center',marginBottom:14,gap:12}}>
        <div>
          <div style={{fontWeight:700,fontSize:14,color:'var(--ink)'}}>Alternates</div>
          <div style={{fontSize:12,color:'var(--mute)'}}>{alts.length} alternate{alts.length!==1?'s':''}</div>
        </div>
        <button className="btn accent sm" style={{marginLeft:'auto'}} onClick={onAdd}>+ Add Alternate</button>
      </div>
      {alts.length===0 && <div style={{padding:'24px 0',fontSize:13,color:'var(--mute)'}}>No alternates yet.</div>}
      {alts.map((alt,i) => (
        <div key={alt.id||i} style={{background:'#fff',border:'1px solid var(--line)',borderRadius:6,padding:14,marginBottom:10}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <span style={{fontSize:11,fontWeight:700,color:'var(--mute)',textTransform:'uppercase',letterSpacing:'.06em'}}>Alt #{i+1}</span>
            <button style={{background:'none',border:'none',cursor:'pointer',fontSize:13,color:'var(--mute)',padding:0}}
              onClick={()=>onDelete(alt.id)}>Remove</button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 80px 100px 110px',gap:8,alignItems:'center'}}>
            <input style={inp} value={alt.description||''} placeholder="Alternate description…"
              onChange={e=>onUpdate(alt.id,{description:e.target.value})} />
            <input type="number" step="any" style={{...inp,textAlign:'right'}} value={alt.qty||1}
              onChange={e=>onUpdate(alt.id,{qty:+e.target.value||1})} />
            <input style={inp} value={alt.unit||'lump sum'} placeholder="unit"
              onChange={e=>onUpdate(alt.id,{unit:e.target.value})} />
            <input type="number" step="any" style={{...inp,textAlign:'right'}} value={alt.price||0}
              placeholder="0" onChange={e=>onUpdate(alt.id,{price:+e.target.value||0})} />
          </div>
          <div style={{display:'flex',justifyContent:'flex-end',marginTop:6,fontSize:12,fontFamily:'var(--mono)',
            fontWeight:600,color:'var(--accent)'}}>
            {fmt$((alt.qty||1)*(alt.price||0))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── TermsListView ──────────────────────────────────────────────────────────────
function TermsListView({ title, items, onChange }) {
  const [draft, setDraft] = uSc('');

  function addItem() {
    if (!draft.trim()) return;
    onChange([...(items||[]), { text: draft.trim(), active: true }]);
    setDraft('');
  }

  function toggle(i) {
    const next = [...(items||[])];
    next[i] = { ...next[i], active: !next[i].active };
    onChange(next);
  }

  function remove(i) {
    onChange((items||[]).filter((_,idx)=>idx!==i));
  }

  function editText(i, val) {
    const next = [...(items||[])];
    next[i] = { ...next[i], text: val };
    onChange(next);
  }

  return (
    <div style={{padding:16,overflowY:'auto',maxWidth:720}}>
      <div style={{fontWeight:700,fontSize:14,marginBottom:12,color:'var(--ink)'}}>{title}</div>
      <div style={{background:'#fff',border:'1px solid var(--line)',borderRadius:6,padding:14,marginBottom:10}}>
        {(items||[]).length===0 && (
          <div style={{fontSize:12,color:'var(--mute)',marginBottom:8}}>No items yet.</div>
        )}
        {(items||[]).map((item,i) => (
          <div key={i} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'5px 4px',borderRadius:3,
            borderBottom:'1px solid var(--line)',opacity:item.active?1:0.5}}>
            <input type="checkbox" checked={!!item.active} onChange={()=>toggle(i)}
              style={{marginTop:4,cursor:'pointer',flexShrink:0}} />
            <textarea value={item.text||''} onChange={e=>editText(i,e.target.value)}
              rows={1} style={{flex:1,font:'inherit',fontSize:12,lineHeight:1.5,
                border:'none',background:'transparent',outline:'none',resize:'vertical',
                textDecoration:item.active?'none':'line-through',color:item.active?'var(--ink)':'var(--mute)'}} />
            <button style={{background:'none',border:'none',cursor:'pointer',fontSize:13,color:'var(--mute)',padding:'2px 4px',flexShrink:0}}
              onClick={()=>remove(i)}>×</button>
          </div>
        ))}
        <div style={{display:'flex',gap:8,marginTop:10,paddingTop:10,borderTop:'1px dashed var(--line)'}}>
          <input value={draft} onChange={e=>setDraft(e.target.value)} placeholder={`Add ${title.toLowerCase()} item…`}
            style={{flex:1,font:'inherit',fontSize:12,border:'1px solid var(--line)',borderRadius:4,padding:'6px 10px'}}
            onKeyDown={e=>e.key==='Enter'&&addItem()} />
          <button className="btn ghost sm" onClick={addItem}>Add</button>
        </div>
      </div>
    </div>
  );
}

// ── InfoView ───────────────────────────────────────────────────────────────────
// Full proposal-header form. All fields write directly to the bids table via onSave.
const SHIP_VIA_OPTIONS = ['Installed by F&S', 'Client Pick-up', 'Delivery to jobsite'];
const DOC_TYPES        = ['Proposal', 'Quote', 'Bid', 'Budget', 'Change Order'];
const PRICING_MODES    = [
  { value: 'byarea',   label: 'By Area (one line per area)' },
  { value: 'lumpsum',  label: 'Lump Sum (single line)' },
  { value: 'itemized', label: 'Itemized (all sections & items)' },
];

function InfoView({ bid, onSave }) {
  const [f, setF] = uSc({});
  const get  = k => f[k] !== undefined ? f[k] : (bid?.[k] ?? '');
  const save = k => { const v = f[k]; if (v !== undefined && v !== (bid?.[k] ?? '')) onSave({ [k]: v }); };

  const inpS = { width:'100%', font:'inherit', fontSize:13, border:'1px solid var(--line)',
    borderRadius:4, padding:'6px 10px', boxSizing:'border-box', background:'#fff' };
  const lblS = { fontSize:11, fontWeight:600, color:'#555', textTransform:'uppercase',
    letterSpacing:'.4px', display:'block', marginBottom:4 };

  const fld = (label, key, placeholder='') => (
    <div style={{display:'flex',flexDirection:'column',gap:4}}>
      <label style={lblS}>{label}</label>
      <input style={inpS} value={get(key)} placeholder={placeholder}
        onChange={e=>setF(p=>({...p,[key]:e.target.value}))}
        onBlur={()=>save(key)} />
    </div>
  );

  const sel = (label, key, options) => (
    <div style={{display:'flex',flexDirection:'column',gap:4}}>
      <label style={lblS}>{label}</label>
      <select style={{...inpS,padding:'6px 8px'}} value={get(key)}
        onChange={e=>{ setF(p=>({...p,[key]:e.target.value})); onSave({[key]:e.target.value}); }}>
        {options.map(o => typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>
        )}
      </select>
    </div>
  );

  const row = (...cols) => (
    <div style={{display:'grid',gridTemplateColumns:cols.map(()=>'1fr').join(' '),gap:14,marginBottom:14}}>
      {cols}
    </div>
  );

  const divider = label => (
    <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',
      color:'var(--mute)',borderTop:'1px solid var(--line)',paddingTop:12,marginBottom:12,marginTop:4}}>
      {label}
    </div>
  );

  return (
    <div style={{padding:16,maxWidth:720,overflowY:'auto',paddingBottom:48}}>
      <div style={{fontWeight:700,fontSize:14,marginBottom:16,color:'var(--ink)'}}>Project Information</div>

      {divider('Proposal Header')}
      {row(
        sel('Document Type', 'doc_type', DOC_TYPES),
        sel('Pricing Mode',  'pricing_mode', PRICING_MODES),
      )}
      {row(
        fld('Attention To', 'attention'),
        fld('Estimator',    'estimator', 'Evan Ramsey'),
      )}

      {divider('Project Address')}
      <div style={{marginBottom:14}}>
        <label style={lblS}>Project / Jobsite Address</label>
        <textarea style={{...inpS,minHeight:56,resize:'vertical'}} value={get('address')} placeholder="123 Main St&#10;Portland, OR 97201"
          onChange={e=>setF(p=>({...p,address:e.target.value}))} onBlur={()=>save('address')} />
      </div>

      {divider('Delivery & Payment')}
      {row(
        sel('Ship Via', 'ship_via', SHIP_VIA_OPTIONS),
        fld('Delivery Date', 'delivery_date', 'MM/DD/YYYY'),
        fld('P.O. Number',   'po_number', 'n/a'),
      )}
      {row(
        fld('Payment Terms', 'terms', 'Net 30'),
        fld('Architect',     'architect'),
      )}

      {divider('Bid Documents')}
      {row(
        fld('Bid Documents',    'bid_docs'),
        fld('Drawings Dated',   'drawings_dated'),
        fld('Specs Dated',      'specs_dated'),
      )}
      <div style={{marginBottom:14}}>
        <label style={lblS}>Addendums Acknowledged</label>
        <input style={inpS} value={get('addendums')} placeholder="e.g. Addendum No. 1 dated 04/10/2026, Addendum No. 2 dated 04/18/2026"
          onChange={e=>setF(p=>({...p,addendums:e.target.value}))} onBlur={()=>save('addendums')} />
        <div style={{fontSize:11,color:'var(--mute)',marginTop:3}}>Printed on proposal: "The following addendums have been received and acknowledged."</div>
      </div>

      {divider('Notes')}
      <div style={{marginBottom:14}}>
        <label style={lblS}>Scope / Notes (internal)</label>
        <textarea style={{...inpS,minHeight:72,resize:'vertical'}} value={get('notes')} placeholder="Internal notes — not printed on proposal…"
          onChange={e=>setF(p=>({...p,notes:e.target.value}))} onBlur={()=>save('notes')} />
      </div>
    </div>
  );
}

window.BaseBidView   = BaseBidView;
window.AlternatesView = AlternatesView;
window.TermsListView = TermsListView;
window.InfoView      = InfoView;
