// Left-panel sidebar for native estimator
// Mirrors V2 FS_Estimator_v2_1.html renderLeft():
//   Project Info link → Base Bid Summary link → AREAS (collapsible, inline name+qty)
//   → ALTERNATES → PROPOSAL TERMS (Exclusions / Clarifications / General Terms)

const { useState: uSsb, useRef: uRsb } = React;

// ── Single area row ────────────────────────────────────────────────────────────
function AreaTreeItem({ area, selAreaId, selSecId, collapsed, onToggle, onSelectArea,
                        onSelectSection, onRename, onSetQty, onAddSection, onDeleteArea, onDeleteSection, onDuplicateArea }) {
  const [editName, setEditName] = uSsb(false);
  const [addSec,   setAddSec]   = uSsb(false);
  const [newSec,   setNewSec]   = uSsb('');

  const isAreaActive = selAreaId === area.id;

  function commitRename(val) {
    setEditName(false);
    if (val.trim() && val.trim() !== area.name) onRename(area.id, val.trim());
  }

  function commitAddSec() {
    if (newSec.trim()) onAddSection(area.id, newSec.trim());
    setNewSec(''); setAddSec(false);
  }

  const rowBg   = isAreaActive && !selSecId ? 'rgba(176,80,40,.12)' : 'transparent';
  const rowBL   = `2px solid ${isAreaActive && !selSecId ? 'var(--accent)' : 'transparent'}`;

  return (
    <div style={{borderBottom:'1px solid rgba(0,0,0,.04)'}}>
      {/* Area header row */}
      <div style={{display:'flex',alignItems:'center',padding:'5px 8px',gap:3,background:rowBg,borderLeft:rowBL,cursor:'pointer'}}
        onClick={()=>!editName&&onSelectArea(area.id)}>
        <button style={{background:'none',border:'none',cursor:'pointer',fontSize:9,color:'var(--mute)',padding:'0 2px',flexShrink:0,lineHeight:1}}
          onClick={e=>{e.stopPropagation();onToggle(area.id);}}>
          {collapsed ? '▶' : '▼'}
        </button>
        {editName ? (
          <input autoFocus defaultValue={area.name}
            style={{flex:1,font:'inherit',fontSize:12,background:'var(--paper)',border:'1px solid var(--accent)',borderRadius:3,padding:'1px 5px',minWidth:0}}
            onBlur={e=>commitRename(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter')e.target.blur(); if(e.key==='Escape')setEditName(false);}}
            onClick={e=>e.stopPropagation()} />
        ) : (
          <span style={{flex:1,fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
            color:isAreaActive?'var(--accent)':'var(--ink)',userSelect:'none'}}
            onDoubleClick={e=>{e.stopPropagation();setEditName(true);}}>
            {area.name||'Unnamed Area'}
          </span>
        )}
        {/* QTY multiplier */}
        <span style={{fontSize:10,color:'var(--mute)',flexShrink:0}}>×</span>
        <input type="number" min="1" step="1"
          value={area.qty||1}
          title="Area quantity multiplier"
          onClick={e=>e.stopPropagation()}
          onChange={e=>onSetQty(area.id, Math.max(1,+e.target.value||1))}
          style={{width:32,font:'inherit',fontSize:11,textAlign:'center',
            background:'rgba(176,80,40,.08)',border:'1px solid rgba(176,80,40,.25)',borderRadius:3,
            padding:'1px 3px',color:'var(--accent)',fontWeight:700,flexShrink:0}} />
        {onDuplicateArea && (
          <button title="Duplicate area" style={{background:'none',border:'none',cursor:'pointer',fontSize:12,color:'var(--mute)',padding:'0 2px',lineHeight:1,flexShrink:0}}
            onClick={e=>{e.stopPropagation();onDuplicateArea(area.id);}}>⧉</button>
        )}
        <button style={{background:'none',border:'none',cursor:'pointer',fontSize:14,color:'var(--mute)',padding:'0 2px',lineHeight:1,flexShrink:0}}
          onClick={e=>{e.stopPropagation();onDeleteArea(area.id);}}>×</button>
      </div>

      {/* Sections */}
      {!collapsed && (
        <div style={{paddingLeft:14}}>
          {(area.sections||[]).map(sec => {
            const secActive = selSecId===sec.id;
            return (
              <div key={sec.id} style={{display:'flex',alignItems:'center',gap:4,padding:'3px 8px 3px 6px',cursor:'pointer',
                background:secActive?'rgba(176,80,40,.09)':'transparent',
                borderLeft:`2px solid ${secActive?'var(--accent)':'transparent'}`}}
                onClick={()=>onSelectSection(area.id, sec.id)}>
                <span style={{flex:1,fontSize:11.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                  color:secActive?'var(--accent)':'var(--ink-2)'}}>{sec.name}</span>
                <span style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--mute)',flexShrink:0}}>{(sec.items||[]).length}</span>
                <button style={{background:'none',border:'none',cursor:'pointer',fontSize:13,color:'var(--mute)',padding:0,lineHeight:1,flexShrink:0}}
                  onClick={e=>{e.stopPropagation();onDeleteSection(area.id,sec.id);}}>×</button>
              </div>
            );
          })}
          {/* Inline add section */}
          {addSec ? (
            <div style={{padding:'3px 6px 5px'}}>
              <input autoFocus value={newSec} placeholder="Section name…"
                style={{width:'100%',font:'inherit',fontSize:11,background:'var(--paper)',
                  border:'1px solid var(--accent)',borderRadius:3,padding:'2px 6px',boxSizing:'border-box'}}
                onChange={e=>setNewSec(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter')commitAddSec(); if(e.key==='Escape'){setNewSec('');setAddSec(false);}}}
                onBlur={commitAddSec} />
            </div>
          ) : (
            <button style={{display:'block',background:'none',border:'none',cursor:'pointer',
              fontSize:11,color:'var(--mute)',padding:'2px 6px 6px'}}
              onClick={()=>setAddSec(true)}>+ section</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main sidebar ───────────────────────────────────────────────────────────────
function EstimatorSidebar({
  tree, bid, alts, selView, selAreaId, selSecId, collapsed, selAltIdx,
  onView, onSelectArea, onSelectSection, onToggleCollapse,
  onAddArea, onDeleteArea, onDuplicateArea, onRenameArea, onAreaQty,
  onAddSection, onDeleteSection, onSelectAlt, onAddAlt,
}) {
  const [addingArea, setAddingArea] = uSsb(false);
  const [newAreaName, setNewAreaName] = uSsb('');

  function commitAddArea() {
    if (newAreaName.trim()) onAddArea(newAreaName.trim());
    setNewAreaName(''); setAddingArea(false);
  }

  const exclActive = (bid?.exclusions||[]).filter(e=>e.active).length;
  const exclTotal  = (bid?.exclusions||[]).length;
  const clarActive = (bid?.clarifications||[]).filter(e=>e.active).length;
  const clarTotal  = (bid?.clarifications||[]).length;

  function NavLink({ view, label, badge }) {
    const active = selView === view;
    return (
      <div style={{display:'flex',alignItems:'center',padding:'6px 16px',cursor:'pointer',fontSize:12,
        background:active?'rgba(176,80,40,.13)':'transparent',
        borderLeft:`3px solid ${active?'var(--accent)':'transparent'}`,
        color:active?'var(--accent)':'var(--ink-2)'}}
        onClick={()=>onView(view)}>
        <span style={{flex:1,fontWeight:active?600:400}}>{label}</span>
        {badge > 0 && <span style={{fontSize:9,background:'rgba(0,0,0,.07)',borderRadius:8,padding:'1px 5px',color:'var(--mute)',flexShrink:0}}>{badge}</span>}
      </div>
    );
  }

  function SectionHead({ label, onAdd }) {
    return (
      <div style={{display:'flex',alignItems:'center',padding:'5px 10px 3px 12px',
        borderTop:'1px solid rgba(0,0,0,.06)',marginTop:6}}>
        <span style={{flex:1,fontSize:10,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--mute)'}}>{label}</span>
        {onAdd && (
          <button style={{background:'var(--accent)',color:'#fff',border:'none',borderRadius:3,
            width:18,height:18,cursor:'pointer',fontSize:14,lineHeight:1,display:'flex',alignItems:'center',justifyContent:'center'}}
            onClick={onAdd}>+</button>
        )}
      </div>
    );
  }

  return (
    <div style={{width:228,borderRight:'1px solid var(--line)',overflowY:'auto',flexShrink:0,
      background:'var(--panel-alt)',display:'flex',flexDirection:'column'}}>

      {/* Top nav */}
      <div style={{paddingTop:6}}>
        <NavLink view="info"    label="📋 Project Info" badge={0} />
        <NavLink view="basebid" label="💰 Base Bid Summary" badge={0} />
      </div>

      {/* Areas */}
      <SectionHead label="Areas" onAdd={()=>setAddingArea(true)} />

      {(tree?.areas||[]).map(area => (
        <AreaTreeItem key={area.id} area={area}
          selAreaId={selAreaId} selSecId={selSecId}
          collapsed={!!collapsed[area.id]}
          onToggle={onToggleCollapse}
          onSelectArea={onSelectArea}
          onSelectSection={onSelectSection}
          onRename={onRenameArea}
          onSetQty={onAreaQty}
          onAddSection={onAddSection}
          onDeleteArea={onDeleteArea}
          onDeleteSection={onDeleteSection}
          onDuplicateArea={onDuplicateArea} />
      ))}

      {addingArea ? (
        <div style={{padding:'4px 10px 6px'}}>
          <input autoFocus value={newAreaName} placeholder="Area name…"
            style={{width:'100%',font:'inherit',fontSize:12,background:'var(--paper)',
              border:'1px solid var(--accent)',borderRadius:3,padding:'3px 6px',boxSizing:'border-box'}}
            onChange={e=>setNewAreaName(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter')commitAddArea(); if(e.key==='Escape'){setNewAreaName('');setAddingArea(false);}}}
            onBlur={commitAddArea} />
        </div>
      ) : !(tree?.areas||[]).length && (
        <div style={{padding:'8px 12px',fontSize:12,color:'var(--mute)'}}>No areas yet — click + to add.</div>
      )}

      {/* Alternates */}
      <SectionHead label="Alternates" onAdd={onAddAlt} />
      {(alts||[]).length === 0 && (
        <div style={{padding:'6px 16px',fontSize:11,color:'var(--mute)',fontStyle:'italic'}}>No alternates — click + to add</div>
      )}
      {(alts||[]).map((alt,i) => {
        const active = selView==='alternates' && selAltIdx===i;
        return (
          <div key={alt.id||i} style={{display:'flex',alignItems:'center',padding:'4px 16px',cursor:'pointer',gap:4,
            background:active?'rgba(176,80,40,.09)':'transparent',
            borderLeft:`2px solid ${active?'var(--accent)':'transparent'}`}}
            onClick={()=>onSelectAlt(i)}>
            <span style={{fontSize:9,color:'var(--mute)',minWidth:16,flexShrink:0}}>#{i+1}</span>
            <span style={{flex:1,fontSize:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
              color:active?'var(--accent)':'var(--ink-2)'}}>{alt.description||<em style={{color:'var(--mute)'}}>Unnamed alternate</em>}</span>
          </div>
        );
      })}

      {/* Proposal Terms */}
      <SectionHead label="Proposal Terms" onAdd={null} />
      <NavLink view="exclusions"    label={`📄 Exclusions`}    badge={exclActive} />
      <NavLink view="clarifications" label={`📋 Clarifications`} badge={clarActive} />
      <NavLink view="proposalterms"  label="📑 General Terms"   badge={0} />
    </div>
  );
}

window.EstimatorSidebar = EstimatorSidebar;
