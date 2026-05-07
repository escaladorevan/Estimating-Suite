// Home + Pipeline views
const { useState: uS_home, useEffect: uE_home, useMemo: uM_home } = React;

const HomeView = ({ onOpenDetail }) => {
  const [jobs, setJobs] = uS_home(null);
  const [bids, setBids] = uS_home(null);

  uE_home(() => {
    window.dbHelpers.getJobs().then(({ data }) => setJobs(data || []));
    window.dbHelpers.getBids().then(({ data }) => setBids(data || []));
  }, []);

  const today = uM_home(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const nextWeek = uM_home(() => new Date(today.getTime() + 7*86400000), [today]);

  const kpis = uM_home(() => {
    if (!jobs || !bids) return [];
    const activeJobs = jobs.filter(j => ['active','Ready','Shop','Installing','In Progress'].includes(j.status));
    const backlog = activeJobs.reduce((s, j) => s + (Number(j.contract_value) || 0), 0);
    const activeBids = bids.filter(b => !['Won','Lost'].includes(b.stage));
    const dueSoon = activeBids.filter(b => { if (!b.due_date) return false; const d = new Date(b.due_date); return d >= today && d <= nextWeek; });
    const fmtVal = v => v >= 1000000 ? '$'+(v/1000000).toFixed(1)+'M' : '$'+Math.round(v/1000)+'k';
    return [
      { l:'Active jobs',    v:activeJobs.length,  sub:`${jobs.filter(j=>j.status==='Ready').length} ready to install` },
      { l:'Backlog value',  v:fmtVal(backlog),     sub:`${activeJobs.filter(j=>Number(j.contract_value)>0).length} valued jobs` },
      { l:'Active bids',    v:activeBids.length,   sub:`${activeBids.filter(b=>b.stage==='Submit').length} submitted`, accent:activeBids.length>0 },
      { l:'Due this week',  v:dueSoon.length,      sub:dueSoon.length>0?'need attention':'nothing urgent', accent:dueSoon.length>0 },
    ];
  }, [jobs, bids, today, nextWeek]);

  const upcomingBids = uM_home(() => {
    if (!bids) return [];
    return bids.filter(b => !['Won','Lost'].includes(b.stage))
      .sort((a,b) => new Date(a.due_date||'9999-12-31') - new Date(b.due_date||'9999-12-31'))
      .slice(0, 8);
  }, [bids]);

  const scheduledJobs = uM_home(() => {
    if (!jobs) return [];
    return jobs.filter(j => j.install_start && ['active','Ready','Shop','Installing'].includes(j.status))
      .sort((a,b) => new Date(a.install_start) - new Date(b.install_start))
      .slice(0, 8);
  }, [jobs]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  const dateStr = new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });

  if (!jobs || !bids) return <window.Spinner />;

  const activeBidCount = bids.filter(b => !['Won','Lost'].includes(b.stage)).length;
  const activeJobCount = jobs.filter(j => ['active','Ready','Shop','Installing','In Progress'].includes(j.status)).length;

  return (
    <div className="view active">
      <div className="page-head">
        <div>
          <div className="eyebrow">{dateStr}</div>
          <div className="page-title">{greeting}, Evan.</div>
          <div className="page-sub">
            <b style={{color:'var(--accent)'}}>{activeJobCount} active jobs</b> in the shop · {activeBidCount} bids in the pipeline
          </div>
        </div>
      </div>
      <div style={{padding:'18px 28px 40px'}}>

        {/* KPIs */}
        <div className="g4 mb-lg">
          {kpis.map((k,i) => (
            <div className="card kpi" key={i} style={k.accent?{borderColor:'var(--accent)',boxShadow:'0 0 0 2px rgba(176,80,40,.08)'}:{}}>
              <div className="lbl">{k.l}</div>
              <div className="val tnum">{k.v}</div>
              <div className="sub">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Pipeline bids + Install schedule */}
        <div style={{display:'grid',gridTemplateColumns:'3fr 2fr',gap:14}}>
          <div className="card">
            <div className="card-head">
              <h3>Pipeline bids</h3>
              <span className="chip accent">{activeBidCount} active</span>
              <div style={{flex:1}}/>
              <button className="btn ghost sm" onClick={()=>window.__go('pipeline')}>View all →</button>
            </div>
            {upcomingBids.length === 0 ? (
              <div style={{padding:'20px 16px',color:'var(--mute)',fontSize:12}}>No active bids. Create one in the Pipeline.</div>
            ) : (
              <table className="wf">
                <thead><tr>
                  <th style={{paddingLeft:16}}>Project</th>
                  <th>Stage</th>
                  <th>Due</th>
                  <th className="num" style={{paddingRight:16}}>Est. Value</th>
                </tr></thead>
                <tbody>
                  {upcomingBids.map(bid => {
                    const due = bid.due_date ? new Date(bid.due_date) : null;
                    const isOverdue = due && due < today;
                    const isDueSoon = due && due >= today && due <= nextWeek;
                    return (
                      <tr key={bid.id} style={{cursor:'pointer'}} onClick={()=>onOpenDetail && onOpenDetail(bid)}>
                        <td style={{paddingLeft:16}}>
                          <div style={{fontWeight:600}}>{bid.name}</div>
                          <div className="muted" style={{fontSize:11.5}}>{bid.gc_name||'—'}</div>
                        </td>
                        <td><span className="chip">{bid.stage}</span></td>
                        <td style={{fontSize:12,color:isOverdue?'var(--bad)':isDueSoon?'var(--warn)':'var(--ink-2)'}}>
                          {due ? due.toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—'}
                        </td>
                        <td className="num tnum" style={{paddingRight:16,fontWeight:600,fontSize:12}}>
                          {bid.estimated_value ? '$'+Number(bid.estimated_value).toLocaleString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Install schedule</h3>
              <div style={{flex:1}}/>
              <button className="btn ghost sm" onClick={()=>window.__go('jobs')}>All jobs →</button>
            </div>
            {scheduledJobs.length === 0 ? (
              <div style={{padding:'20px 16px',color:'var(--mute)',fontSize:12}}>No upcoming installs scheduled.</div>
            ) : (
              <div style={{padding:'4px 0'}}>
                {scheduledJobs.map(job => (
                  <div key={job.id} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'8px 16px',borderBottom:'1px solid var(--line)'}}>
                    <div style={{minWidth:44,textAlign:'center',background:'var(--panel-alt)',borderRadius:'var(--r-sm)',padding:'4px 6px',flexShrink:0}}>
                      <div style={{fontSize:9,textTransform:'uppercase',color:'var(--mute)',letterSpacing:'.06em'}}>
                        {new Date(job.install_start+'T12:00:00').toLocaleDateString('en-US',{month:'short'})}
                      </div>
                      <div style={{fontSize:16,fontWeight:700,fontFamily:'var(--mono)',lineHeight:1.1}}>
                        {new Date(job.install_start+'T12:00:00').getDate()}
                      </div>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:12.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{job.name}</div>
                      <div style={{fontSize:11,color:'var(--ink-3)',marginTop:1}}>
                        {job.pm && <span className={`pm ${job.pm.toLowerCase()}`} style={{marginRight:5}}>{job.pm}</span>}
                        {job.gc_name||''}
                        {job.crew_size>1 && <span style={{marginLeft:5,color:'var(--mute)'}}>· {job.crew_size} crew</span>}
                      </div>
                    </div>
                    <div style={{fontSize:11,fontFamily:'var(--mono)',color:'var(--accent)',flexShrink:0,paddingTop:2}}>
                      {job.contract_value ? '$'+Math.round(job.contract_value).toLocaleString() : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Pipeline kanban ───────────────────────────────────
const STAGE_COLS = [
  { id:'ITB',             label:'Lead / ITB Received' },
  { id:'Takeoff/Pricing', label:'Quantities & Pricing' },
  { id:'Review',          label:'Review / QC' },
  { id:'Submit',          label:'Submitted' },
  { id:'Won',             label:'Won' },
  { id:'Lost',            label:'Lost' },
];

const PipelineView = ({ onOpenDetail }) => {
  const [bids, setBids]             = uS_home(null);
  const [error, setError]           = uS_home(null);
  const [showCreate, setShowCreate] = uS_home(false);
  const [form, setForm]             = uS_home({ gc_name:'', name:'', due_date:'', project_type:'' });
  const [saving, setSaving]         = uS_home(false);

  uE_home(() => {
    let cancelled = false;
    async function load() {
      const { data, error: err } = await window.dbHelpers.getBids();
      if (!cancelled) {
        if (err) setError(err.message);
        else setBids(data || []);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const bidsForStage = uM_home(() => {
    if (!bids) return {};
    const m = {};
    STAGE_COLS.forEach(c => { m[c.id] = []; });
    bids.forEach(b => { if (m[b.stage]) m[b.stage].push(b); });
    return m;
  }, [bids]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.gc_name || !form.name || !form.due_date || !form.project_type) return;
    setSaving(true);
    const { data: newBid, error: err } = await window.dbHelpers.addBid(form);
    setSaving(false);
    if (err) { alert('Error creating bid: ' + err.message); return; }
    setBids(prev => [newBid, ...(prev || [])]);
    setForm({ gc_name:'', name:'', due_date:'', project_type:'' });
    setShowCreate(false);
  }

  async function handleAdvance(bid) {
    const next = window.dbHelpers.STAGE_NEXT[bid.stage];
    if (!next) return;
    const { error: err } = await window.dbHelpers.updateBidStage(bid.id, next);
    if (err) { alert('Error: ' + err.message); return; }
    setBids(prev => prev.map(b => b.id === bid.id ? { ...b, stage: next } : b));
  }

  async function handleTerminal(bid, stage) {
    if (stage === 'Won') {
      const { data: job, error: err } = await window.dbHelpers.markBidWon(bid);
      if (err) { alert('Error: ' + err.message); return; }
      setBids(prev => prev.map(b => b.id === bid.id ? { ...b, stage } : b));
      if (job) {
        window.__activeJob = job;
        window.__go && window.__go('job');
      }
      return;
    }

    const { error: err } = await window.dbHelpers.updateBidStage(bid.id, stage);
    if (err) { alert('Error: ' + err.message); return; }
    setBids(prev => prev.map(b => b.id === bid.id ? { ...b, stage } : b));
  }

  if (bids === null && !error) return <window.Spinner />;
  if (error) return (
    <div style={{padding:40, color:'var(--bad)'}}>
      Something went wrong — check your connection and try again.
      <button className="btn ghost sm" style={{marginLeft:12}} onClick={() => { setError(null); setBids(null); }}>Retry</button>
    </div>
  );

  const totalBids = bids.length;

  return (
    <div className="view active">
      <div className="page-head">
        <div>
          <div className="page-title">Pipeline</div>
          <div className="page-sub">{totalBids} {totalBids === 1 ? 'bid' : 'bids'} tracked</div>
        </div>
        <div className="spacer"></div>
        <div className="actions">
          <button className="btn accent" onClick={() => setShowCreate(true)}><Icon.plus/> New bid</button>
        </div>
      </div>

      <div style={{padding:'16px 20px 40px', overflowX:'auto'}}>
        {totalBids === 0 && !showCreate ? (
          <window.EmptyState
            heading="No bids yet"
            body="Create your first bid to start tracking the pipeline."
            action={{ label:'New Bid', onClick:() => setShowCreate(true) }}
          />
        ) : (
          <div className="kan">
            {STAGE_COLS.map(col => {
              const colBids = bidsForStage[col.id] || [];
              const isITB = col.id === 'ITB';
              return (
                <div className="col" key={col.id}>
                  <div className="col-head">
                    <span>{col.label}</span>
                    <span className="n">{colBids.length}</span>
                    {isITB && <button className="btn ghost sm" style={{marginLeft:'auto',fontSize:11}} onClick={() => setShowCreate(v => !v)}><Icon.plus/></button>}
                  </div>

                  {isITB && showCreate && (
                    <form className="card" style={{padding:'12px 14px',borderColor:'var(--accent)',borderWidth:1.5,marginBottom:8}} onSubmit={handleCreate}>
                      <div style={{fontSize:10.5,fontWeight:700,color:'var(--mute)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:3}}>Client / GC</div>
                      <input required value={form.gc_name} onChange={e=>setForm(f=>({...f,gc_name:e.target.value}))} placeholder="Turner Construction" style={{width:'100%',border:'1px solid var(--line)',borderRadius:'var(--r-sm)',padding:'5px 8px',fontSize:12.5,background:'var(--paper)',marginBottom:6}}/>
                      <div style={{fontSize:10.5,fontWeight:700,color:'var(--mute)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:3}}>Project Name</div>
                      <input required value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Caldwell Medical Center" style={{width:'100%',border:'1px solid var(--line)',borderRadius:'var(--r-sm)',padding:'5px 8px',fontSize:12.5,background:'var(--paper)',marginBottom:6}}/>
                      <div style={{fontSize:10.5,fontWeight:700,color:'var(--mute)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:3}}>Bid Due Date</div>
                      <input required type="date" value={form.due_date} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))} style={{width:'100%',border:'1px solid var(--line)',borderRadius:'var(--r-sm)',padding:'5px 8px',fontSize:12.5,background:'var(--paper)',marginBottom:6}}/>
                      <div style={{fontSize:10.5,fontWeight:700,color:'var(--mute)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:3}}>Project Type</div>
                      <input required value={form.project_type} onChange={e=>setForm(f=>({...f,project_type:e.target.value}))} placeholder="Healthcare TI" style={{width:'100%',border:'1px solid var(--line)',borderRadius:'var(--r-sm)',padding:'5px 8px',fontSize:12.5,background:'var(--paper)',marginBottom:8}}/>
                      <div style={{display:'flex',gap:6}}>
                        <button className="btn accent sm" type="submit" disabled={saving}>{saving?'Saving…':'Create Bid'}</button>
                        <button className="btn ghost sm" type="button" onClick={()=>setShowCreate(false)}>Cancel</button>
                      </div>
                    </form>
                  )}

                  {colBids.map((bid) => {
                    const nextStage = window.dbHelpers.STAGE_NEXT[bid.stage];
                    return (
                      <div key={bid.id} className="card-lead" onClick={() => onOpenDetail && onOpenDetail(bid)} style={{cursor:'pointer'}}>
                        <div style={{fontWeight:600,fontSize:13,marginBottom:2}}>{bid.name}</div>
                        <div className="meta" style={{fontSize:11.5,marginBottom:6}}>{bid.gc_name} · {bid.project_type || '—'}</div>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:4}}>
                          <span className="muted" style={{fontSize:11}}>{bid.due_date ? `Due ${bid.due_date}` : '—'}</span>
                          <div style={{display:'flex',gap:4}} onClick={e => e.stopPropagation()}>
                            {bid.stage !== 'Won' && bid.stage !== 'Lost' && (
                              nextStage
                                ? <button className="btn ghost sm" style={{fontSize:11,padding:'2px 6px'}} onClick={() => handleAdvance(bid)}>→ {nextStage}</button>
                                : <>
                                    <button className="chip ok" style={{cursor:'pointer'}} onClick={() => handleTerminal(bid, 'Won')}>Mark Won</button>
                                    <button className="chip bad" style={{cursor:'pointer'}} onClick={() => handleTerminal(bid, 'Lost')}>Mark Lost</button>
                                  </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {colBids.length === 0 && !isITB && (
                    <div style={{padding:'12px 8px',fontSize:12,color:'var(--mute)',textAlign:'center'}}>—</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

window.Views = Object.assign(window.Views || {}, { home: HomeView, pipeline: PipelineView });
