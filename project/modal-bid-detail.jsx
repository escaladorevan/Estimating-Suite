// Bid Detail Modal — opens when a pipeline card is clicked.
// Shows all editable bid fields, stage controls, file slots, and
// an "Open Estimate" (or "View Job" for Won bids) action button.

const { useState: uS_bdm, useEffect: uE_bdm } = React;

const FILE_SLOTS = [
  { icon:'📐', label:'Drawings' },
  { icon:'📋', label:'Specifications' },
  { icon:'📅', label:'Schedule' },
  { icon:'📄', label:'PO / Contract' },
  { icon:'💼', label:'Proposal' },
  { icon:'📎', label:'Other' },
];

const PROJECT_TYPES = [
  'Healthcare TI','Education','Civic','Education Lab',
  'Office TI','Retail','Residential','Industrial','Other',
];

const STAGE_COLORS = {
  'ITB':'var(--ink-3)','Takeoff/Pricing':'#7c6fc4',
  'Review':'#b08030','Submit':'#4086c4',
  'Won':'var(--ok)','Lost':'var(--bad)',
};

function BidDetailModal({ bid, onClose, onOpenEstimate, onOpenJob, onBidUpdate }) {
  const [form, setForm] = uS_bdm(null);
  const [saving, setSaving] = uS_bdm(false);
  const [stageErr, setStageErr] = uS_bdm(null);

  uE_bdm(() => {
    if (!bid) { setForm(null); return; }
    setForm({
      name:            bid.name            || '',
      gc_name:         bid.gc_name         || '',
      project_type:    bid.project_type    || '',
      estimated_value: bid.estimated_value != null ? bid.estimated_value : '',
      due_date:        bid.due_date        || '',
      estimator:       bid.estimator       || '',
      oh_pct:          bid.oh_pct          ?? 15,
      del_pct:         bid.del_pct         ?? 5,
      ins_pct:         bid.ins_pct         ?? 20,
      stage:           bid.stage           || 'ITB',
    });
    setStageErr(null);
  }, [bid?.id]);

  if (!bid || !form) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    setSaving(true);
    const { error } = await window.dbHelpers.updateBid(bid.id, {
      name:            form.name,
      gc_name:         form.gc_name,
      project_type:    form.project_type,
      estimated_value: form.estimated_value !== '' ? Number(form.estimated_value) : null,
      due_date:        form.due_date || null,
      estimator:       form.estimator,
      oh_pct:          Number(form.oh_pct)  || 15,
      del_pct:         Number(form.del_pct) || 5,
      ins_pct:         Number(form.ins_pct) || 20,
    });
    setSaving(false);
    if (error) { alert('Save failed: ' + error.message); return; }
    onBidUpdate && onBidUpdate({ ...bid, ...form });
    onClose();
  }

  async function handleAdvance() {
    const next = window.dbHelpers.STAGE_NEXT[form.stage];
    if (!next) return;
    const { error } = await window.dbHelpers.updateBidStage(bid.id, next);
    if (error) { setStageErr(error.message); return; }
    set('stage', next);
    onBidUpdate && onBidUpdate({ ...bid, ...form, stage: next });
  }

  async function handleTerminal(stage) {
    setStageErr(null);
    if (stage === 'Won') {
      const { data: job, error } = await window.dbHelpers.markBidWon({ ...bid, ...form });
      if (error) { setStageErr(error.message); return; }
      set('stage', 'Won');
      onBidUpdate && onBidUpdate({ ...bid, ...form, stage: 'Won' });
      onClose();
      if (job) { window.__activeJob = job; window.__go && window.__go('job'); }
      return;
    }
    const { error } = await window.dbHelpers.updateBidStage(bid.id, stage);
    if (error) { setStageErr(error.message); return; }
    set('stage', stage);
    onBidUpdate && onBidUpdate({ ...bid, ...form, stage });
  }

  const nextStage  = window.dbHelpers.STAGE_NEXT[form.stage];
  const isSubmit   = form.stage === 'Submit';
  const isTerminal = form.stage === 'Won' || form.stage === 'Lost';
  const stageColor = STAGE_COLORS[form.stage] || 'var(--mute)';

  const numFmt = v => v != null && v !== '' ? '$' + Number(v).toLocaleString() : '—';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{maxWidth:780}} onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="modal-head">
          <div style={{minWidth:0}}>
            <div style={{fontSize:10.5,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--mute)',marginBottom:1}}>
              {bid.number}
            </div>
            <div style={{fontSize:15,fontWeight:700,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
              {form.name || 'Untitled Bid'}
            </div>
          </div>
          <span className="chip" style={{background:stageColor,color:'#fff',flexShrink:0}}>{form.stage}</span>
          {form.estimated_value ? (
            <span className="chip" style={{flexShrink:0,fontFamily:'var(--mono)',fontSize:11.5}}>
              {numFmt(form.estimated_value)}
            </span>
          ) : null}
          <div style={{flex:1}}/>
          <button className="modal-close" onClick={onClose} title="Close">×</button>
        </div>

        {/* ── Body ── */}
        <div className="modal-body">

          {/* Core fields — 2-col grid */}
          <div className="g2" style={{gap:10,marginBottom:10}}>
            <div className="field">
              <label>Project Name</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Caldwell Medical Casework"/>
            </div>
            <div className="field">
              <label>GC / Client</label>
              <input value={form.gc_name} onChange={e => set('gc_name', e.target.value)} placeholder="Turner Construction"/>
            </div>
            <div className="field">
              <label>Project Type</label>
              <select value={form.project_type} onChange={e => set('project_type', e.target.value)}>
                <option value="">— select —</option>
                {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Estimator</label>
              <input value={form.estimator} onChange={e => set('estimator', e.target.value)} placeholder="Evan Ramsey"/>
            </div>
            <div className="field">
              <label>Est. Value ($)</label>
              <input type="number" className="tnum" value={form.estimated_value} onChange={e => set('estimated_value', e.target.value)} placeholder="0"/>
            </div>
            <div className="field">
              <label>Bid Due Date</label>
              <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)}/>
            </div>
          </div>

          {/* Markup row — 3-col */}
          <div style={{fontSize:10,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--mute)',marginBottom:6}}>
            Markup percentages
          </div>
          <div className="g3" style={{gap:10,marginBottom:14}}>
            <div className="field">
              <label>Overhead %</label>
              <input type="number" className="tnum" value={form.oh_pct} onChange={e => set('oh_pct', e.target.value)}/>
            </div>
            <div className="field">
              <label>Delivery %</label>
              <input type="number" className="tnum" value={form.del_pct} onChange={e => set('del_pct', e.target.value)}/>
            </div>
            <div className="field">
              <label>Installation %</label>
              <input type="number" className="tnum" value={form.ins_pct} onChange={e => set('ins_pct', e.target.value)}/>
            </div>
          </div>

          {/* Stage controls */}
          {!isTerminal && (
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--mute)',marginBottom:6}}>
                Stage
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <span className="chip" style={{background:stageColor,color:'#fff'}}>{form.stage}</span>
                {nextStage && (
                  <button className="btn ghost sm" onClick={handleAdvance}>→ Advance to {nextStage}</button>
                )}
                {isSubmit && (
                  <>
                    <button className="chip ok" style={{cursor:'pointer',padding:'4px 10px'}} onClick={() => handleTerminal('Won')}>✓ Mark Won</button>
                    <button className="chip bad" style={{cursor:'pointer',padding:'4px 10px'}} onClick={() => handleTerminal('Lost')}>✗ Mark Lost</button>
                  </>
                )}
                {stageErr && <span style={{fontSize:11.5,color:'var(--bad)'}}>{stageErr}</span>}
              </div>
            </div>
          )}

          {/* File slots */}
          <div className="modal-section-head">Documents</div>
          <div className="g3" style={{gap:8}}>
            {FILE_SLOTS.map(s => (
              <div key={s.label} style={{
                display:'flex',alignItems:'center',gap:8,
                padding:'8px 10px',background:'var(--panel-alt)',
                borderRadius:'var(--r-sm)',border:'1px solid var(--line)',
              }}>
                <span style={{fontSize:18,lineHeight:1}}>{s.icon}</span>
                <div>
                  <div style={{fontWeight:600,fontSize:11}}>{s.label}</div>
                  <div style={{fontSize:10.5,color:'var(--mute)'}}>No file attached</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{fontSize:11,color:'var(--mute)',marginTop:6,fontStyle:'italic'}}>
            File upload coming in a future update.
          </div>

        </div>

        {/* ── Footer ── */}
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <div style={{flex:1}}/>
          {form.stage === 'Won'
            ? <button className="btn primary" onClick={() => { onClose(); onOpenJob && onOpenJob(bid); }}>
                View Job →
              </button>
            : <button className="btn primary" onClick={() => { onClose(); onOpenEstimate && onOpenEstimate(bid); }}>
                Open Estimate →
              </button>
          }
          <button className="btn accent" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

      </div>
    </div>
  );
}

window.BidDetailModal = BidDetailModal;
