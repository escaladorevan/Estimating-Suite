// Home + Pipeline views
const { useState: uS_home, useEffect: uE_home, useMemo: uM_home } = React;

const HomeView = () => {
  const kpis = [
    { l:'Active bids',      v:'12',      sub:'3 due this week', accent:true },
    { l:'Win rate (L90D)',  v:'38%',     delta:'+4 pts',   up:true },
    { l:'Avg gross margin', v:'22.4%',   delta:'−0.6 pts', up:false },
    { l:'Awarded backlog',  v:'$8.4M',   sub:'22 jobs'    },
  ];
  const dueSoon = [
    { co:'Ada County', name:'Courthouse HVAC retrofit', due:'Thu 11:00a', owner:'EP', val:'$1.24M', status:'accent', note:'RFI pending' },
    { co:'TriState Mechanical', name:'Denver Regional Lab', due:'Fri 2:00p', owner:'GR', val:'$2.80M', status:'warn', note:'Pricing open' },
    { co:'Sundial Dev.', name:'Fairfax Apartments — Ph.2', due:'Mon Dec 9', owner:'JM', val:'$640k', status:'ok', note:'Ready to review' },
    { co:'Boise School Dist.', name:'West Middle School — Reroof', due:'Tue Dec 10', owner:'PN', val:'$390k', status:'ok', note:'Submit package' },
  ];
  const activity = [
    { who:'GR', html:<><b>Gabe</b> changed unit price on <b>03-310 Conc. footing</b> (+6%) on Denver Regional Lab.</>, when:'12 min ago' },
    { who:'PN', html:<><b>Paula</b> added 2 addenda to <b>West Middle School</b> bid package.</>, when:'48 min ago' },
    { who:'EP', html:<><b>Evan</b> marked <b>Ada County Courthouse</b> as <i>awaiting RFI response</i>.</>, when:'2h ago' },
    { who:'JM', html:<><b>Jordan</b> converted <b>Fairfax Apts. — Ph.1</b> to an awarded job. Estimator → Jobs.</>, when:'Yesterday' },
    { who:'SYS', html:<>A pricing sync from <b>Ferguson</b> updated 412 items (avg +2.1%).</>, when:'Yesterday' },
  ];

  return (
    <div className="view active">
      <div className="page-head">
        <div>
          <div className="eyebrow">Tue · Dec 3 · 2026 · 8:14 am MT</div>
          <div className="page-title">Morning, Evan.</div>
          <div className="page-sub">You have <b style={{color:'var(--accent)'}}>2 bids due before Friday</b> and 4 awarded jobs waiting for kickoff.</div>
        </div>
      </div>
      <div style={{padding:'18px 28px 40px'}}>

        {/* KPIs */}
        <div className="g4 mb-lg">
          {kpis.map((k,i)=>(
            <div className="card kpi" key={i} style={k.accent?{borderColor:'var(--accent)',boxShadow:'0 0 0 2px rgba(176,80,40,.08)'}:{}}>
              <div className="lbl">{k.l}</div>
              <div className="val tnum">{k.v}</div>
              <div className="sub">
                {k.delta && <span className={`delta ${k.up?'up':'dn'}`}>{k.delta}</span>}
                {k.sub}
              </div>
            </div>
          ))}
        </div>

        {/* row: due soon + activity */}
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:14}}>
          <div className="card">
            <div className="card-head">
              <h3>Due this week</h3>
              <span className="chip accent">4 bids · $5.07M</span>
              <div style={{flex:1}}></div>
              <button className="btn ghost sm" onClick={()=>window.__go('pipeline')}>View pipeline →</button>
            </div>
            <table className="wf">
              <thead><tr>
                <th style={{paddingLeft:16}}>Project</th>
                <th>Owner</th>
                <th>Due</th>
                <th>Status</th>
                <th className="num" style={{paddingRight:16}}>Value</th>
              </tr></thead>
              <tbody>
                {dueSoon.map((r,i)=>(
                  <tr key={i} style={{cursor:'pointer'}} onClick={()=>window.__go('estimator')}>
                    <td style={{paddingLeft:16}}>
                      <div style={{fontWeight:600}}>{r.name}</div>
                      <div className="muted" style={{fontSize:11.5}}>{r.co} · <span>{r.note}</span></div>
                    </td>
                    <td><span className={`pm ${r.owner[0].toLowerCase()}`}>{r.owner}</span></td>
                    <td className="tnum" style={{fontSize:12}}>{r.due}</td>
                    <td><span className={`chip ${r.status}`}>{r.status==='accent'?'RFI open':r.status==='warn'?'Pricing':r.status==='ok'?'Ready':'—'}</span></td>
                    <td className="num tnum" style={{paddingRight:16,fontWeight:600}}>{r.val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-head"><h3>Activity</h3><span className="muted" style={{fontSize:11.5,marginLeft:'auto'}}>last 24h</span></div>
            <div style={{padding:'4px 16px 10px'}}>
              {activity.map((a,i)=>(
                <div className="act" key={i}>
                  <div className="who">{a.who}</div>
                  <div className="body">
                    <div>{a.html}</div>
                    <div className="when">{a.when}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* row 2: capacity + win snapshot */}
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:14,marginTop:14}}>
          <div className="card pad has-annot">
            <div className="row mb-sm" style={{alignItems:'center'}}>
              <div>
                <h3 style={{margin:0,fontSize:13}}>Estimator capacity · this week</h3>
                <div className="muted" style={{fontSize:11.5,marginTop:2}}>Hours planned vs. bid load. Hover cells for detail.</div>
              </div>
              <div style={{flex:1}}></div>
              <div className="row gap-sm">
                <span className="chip"><span className="dot" style={{background:'#f4ead7'}}></span>Light</span>
                <span className="chip"><span className="dot" style={{background:'#e2b079'}}></span>Heavy</span>
                <span className="chip bad"><span className="dot"></span>Overbooked</span>
              </div>
            </div>
            <div className="cal">
              {['Mon 12/1','Tue 12/2','Wed 12/3','Thu 12/4','Fri 12/5','Sat','Sun'].map(h=>(
                <div className="hd" key={h}>{h}</div>
              ))}
              {/* Row 1: Gabe */}
              <div className="d c2"><span className="n">GR</span><span className="pill g">Denver Lab · qty</span></div>
              <div className="d c3"><span className="n">GR</span><span className="pill g">Denver Lab · price</span></div>
              <div className="d today c4"><span className="n">3</span><span className="pill g">Denver Lab</span><span className="pill p">ITB review</span></div>
              <div className="d c3"><span className="n">4</span><span className="pill g">Denver Lab · QC</span></div>
              <div className="d c2"><span className="n">5</span><span className="pill g">Submit</span></div>
              <div className="d om"><span className="n">6</span></div>
              <div className="d om"><span className="n">7</span></div>

              {/* Row 2 */}
              <div className="d c1"><span className="n">PN</span><span className="pill p">W.Middle · plans</span></div>
              <div className="d c2"><span className="n">PN</span><span className="pill p">W.Middle · qty</span></div>
              <div className="d c3"><span className="n">PN</span><span className="pill p">W.Middle · price</span></div>
              <div className="d c2"><span className="n">PN</span><span className="pill p">W.Middle · QC</span></div>
              <div className="d c2"><span className="n">PN</span><span className="pill j">Ada Co · RFI</span></div>
              <div className="d om"></div><div className="d om"></div>

              {/* Row 3 */}
              <div className="d c3"><span className="n">JM</span><span className="pill j">Fairfax · review</span></div>
              <div className="d c2"><span className="n">JM</span><span className="pill j">Fairfax · QC</span></div>
              <div className="d c2"><span className="n">JM</span><span className="pill j">Submit</span></div>
              <div className="d c4"><span className="n">JM</span><span className="pill p">Linden MOB · qty</span></div>
              <div className="d c4"><span className="n">JM</span><span className="pill p">Linden MOB · qty</span></div>
              <div className="d om"></div><div className="d om"></div>
            </div>
            <span className="annot" style={{top:44,right:120}}>Paula is maxed<br/>Fri — shift Linden?</span>
          </div>

          <div className="card pad">
            <h3 style={{margin:0,fontSize:13}}>Win snapshot · by sector</h3>
            <div className="muted" style={{fontSize:11.5,marginTop:2,marginBottom:12}}>Last 90 days, by award $</div>
            {[
              { n:'Civic / Muni', pct:62, v:'$3.1M', cls:'ok' },
              { n:'Education',    pct:41, v:'$1.2M', cls:'accent' },
              { n:'Healthcare',   pct:33, v:'$0.9M', cls:'' },
              { n:'Multifamily',  pct:28, v:'$0.7M', cls:'warn' },
              { n:'Industrial',   pct:18, v:'$0.3M', cls:'' },
            ].map((s,i)=>(
              <div className="sbar" key={i}>
                <div className="n">{s.n}</div>
                <div className={`bar ${s.cls}`}><span style={{width:`${s.pct}%`}}></span></div>
                <div className="v">{s.v} <span className="muted">· {s.pct}%</span></div>
              </div>
            ))}
            <hr className="rule"/>
            <div className="row gap-sm" style={{fontSize:11.5}}>
              <span className="muted">Losses most often to:</span>
              <span className="chip">Mtn. West Builders · 6×</span>
              <span className="chip">Pacific Summit · 3×</span>
            </div>
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

const PipelineView = ({ onOpenBid }) => {
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
                      <div key={bid.id} className="card-lead" onClick={() => onOpenBid && onOpenBid(bid.id, bid.name)} style={{cursor:'pointer'}}>
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
