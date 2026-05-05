// Jobs list + Job detail + Change Orders
const { useState: uS_jobs, useEffect: uE_jobs } = React;

function JobsView() {
  const [jobs, setJobs]   = uS_jobs(null);
  const [error, setError] = uS_jobs(null);

  uE_jobs(() => {
    let cancelled = false;
    async function load() {
      const { data, error: err } = await window.dbHelpers.getJobs();
      if (!cancelled) {
        if (err) setError(err.message);
        else setJobs(data || []);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const fmt = n => '$' + Number(n || 0).toLocaleString();

  const statusChip = (s) => {
    const m = { 'Shop':'warn', 'Installing':'accent', 'Ready':'', 'Held':'bad', 'Installed':'ok' };
    return <span className={`chip ${m[s]||''}`}>{s}</span>;
  };

  if (jobs === null && !error) return <window.Spinner />;

  if (error) return (
    <div style={{padding:40, color:'var(--bad)'}}>
      Something went wrong — check your connection and try again.
      <button className="btn ghost sm" style={{marginLeft:12}} onClick={() => { setError(null); setJobs(null); }}>Retry</button>
    </div>
  );

  return (
    <div className="view active">
      <div className="page-head">
        <div>
          <div className="page-title">Jobs</div>
          <div className="page-sub">{jobs.length} active {jobs.length === 1 ? 'job' : 'jobs'}</div>
        </div>
        <div className="spacer"></div>
        <div className="actions">
          <button className="btn ghost sm"><Icon.filter/> Filter</button>
        </div>
      </div>

      <div style={{padding:'16px 24px 40px'}}>
        {jobs.length === 0 ? (
          <window.EmptyState
            heading="No active jobs"
            body="Jobs appear here when bids are marked as Won."
          />
        ) : (
          <div className="card">
            <div className="card-head">
              <h3>Active jobs</h3>
              <div style={{flex:1}}></div>
            </div>
            <table className="wf">
              <thead><tr>
                <th style={{paddingLeft:16, width:80}}>Job #</th>
                <th>Project</th>
                <th style={{width:110}}>Status</th>
                <th className="num" style={{width:120}}>Value</th>
                <th style={{width:180}}>Install Window</th>
                <th style={{width:110, paddingRight:16}}>GC</th>
              </tr></thead>
              <tbody>
                {jobs.map((r) => (
                  <tr key={r.id} style={{cursor:'pointer'}} onClick={() => { window.__activeJob = r; window.__go && window.__go('job'); }}>
                    <td style={{paddingLeft:16}} className="tnum"><b>{r.number}</b></td>
                    <td>
                      <div style={{fontWeight:600}}>{r.name}</div>
                      {r.address && <div className="muted" style={{fontSize:11.5}}>{r.address}</div>}
                    </td>
                    <td>{statusChip(r.status)}</td>
                    <td className="num tnum" style={{fontWeight:600}}>{r.contract_value ? fmt(r.contract_value) : '—'}</td>
                    <td style={{fontSize:12}}>
                      {r.install_start
                        ? `${r.install_start}${r.install_end ? ' → ' + r.install_end : ''}`
                        : <span className="muted">TBD</span>}
                    </td>
                    <td className="muted" style={{fontSize:12, paddingRight:16}}>{r.gc_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── JOB DETAIL ─────────────────────────────────────────
function JobView() {
  const job = window.__activeJob || {};
  const [editing, setEditing] = uS_jobs(false);
  const [savingJob, setSavingJob] = uS_jobs(false);
  const [jobDraft, setJobDraft] = uS_jobs({
    status: job.status || 'Ready',
    gc_name: job.gc_name || '',
    install_start: job.install_start || '',
    install_end: job.install_end || '',
    notes: job.notes || '',
    contract_value: job.contract_value || ''
  });

  const [coDraft, setCoDraft] = uS_jobs({ description:'', amount:'', status:'Submitted' });
  const fmtV = n => n ? '$' + Number(n).toLocaleString(undefined, {maximumFractionDigits:0}) : '—';
  const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, {month:'short',day:'numeric',year:'numeric'}) : 'TBD';

  const [cos, setCos] = uS_jobs(null);
  uE_jobs(() => {
    setJobDraft({
      status: job.status || 'Ready',
      gc_name: job.gc_name || '',
      install_start: job.install_start || '',
      install_end: job.install_end || '',
      notes: job.notes || '',
      contract_value: job.contract_value || ''
    });
  }, [job.id]);
  uE_jobs(() => {
    if (!job.id) { setCos([]); return; }
    let cancelled = false;
    async function load() {
      const { data } = await window.sb.from('change_orders').select('*').eq('job_id', job.id).order('created_at');
      if (!cancelled) setCos(data || []);
    }
    load();
    return () => { cancelled = true; };
  }, [job.id]);

  const approvedCOs = (cos || []).filter(c => c.status === 'APV' || c.status === 'Approved');
  const netCOs = approvedCOs.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const netValue = Number(job.contract_value || 0) + netCOs;
  const installWindow = job.install_start
    ? `${fmtDate(job.install_start)}${job.install_end ? ' → ' + fmtDate(job.install_end) : ''}`
    : 'TBD';



  async function saveJob() {
    setSavingJob(true);
    const payload = { ...jobDraft, contract_value: jobDraft.contract_value === '' ? null : Number(jobDraft.contract_value) };
    const { data, error } = await window.dbHelpers.updateJob(job.id, payload);
    setSavingJob(false);
    if (error) return alert('Failed to save job: ' + error.message);
    window.__activeJob = data;
    setEditing(false);
  }

  async function addCO(e) {
    e.preventDefault();
    if (!coDraft.description || coDraft.amount === '') return;
    const { data, error } = await window.dbHelpers.addChangeOrder({
      job_id: job.id,
      description: coDraft.description,
      amount: Number(coDraft.amount),
      status: coDraft.status
    });
    if (error) return alert('Failed to add CO: ' + error.message);
    setCos(prev => ([...(prev||[]), data]));
    setCoDraft({ description:'', amount:'', status:'Submitted' });
  }

  async function setCOStatus(co, status) {
    const { data, error } = await window.dbHelpers.updateChangeOrder(co.id, { status });
    if (error) return alert('Failed to update CO: ' + error.message);
    setCos(prev => (prev||[]).map(c => c.id === co.id ? data : c));
  }

  if (!job.id) return (
    <div className="view active" style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}>
      <window.EmptyState heading="No job selected" body="Select a job from the Jobs list." />
    </div>
  );

  return (
    <div className="view active">
      <div className="page-head">
        <div>
          <div className="eyebrow">Job {job.number}{job.gc_name ? ' · ' + job.gc_name : ''}{job.address ? ' · ' + job.address : ''}</div>
          <div className="page-title">{job.name}</div>
          <div className="page-sub">Install: <b>{installWindow}</b></div>
        </div>
        <div className="spacer"></div>
        <div className="actions">
          <button className="btn ghost sm" onClick={() => window.__go && window.__go('jobs')}><Icon.back/> Jobs</button>
          <div className="bid-totals" style={{marginLeft:12}}>
            <div className="t"><span className="l">Contract</span><span className="v">{fmtV(job.contract_value)}</span></div>
            {netCOs !== 0 && (<><div className="divider"></div>
            <div className="t"><span className="l">Net COs</span><span className="v" style={{color:netCOs>=0?'var(--ok)':'var(--bad)'}}>{netCOs>=0?'+':''}{fmtV(netCOs)}</span></div></>)}
            <div className="divider"></div>
            <div className="t main"><span className="l">Net value</span><span className="v">{fmtV(netValue)}</span></div>
          </div>
        </div>
      </div>

      <div style={{padding:'18px 24px 40px'}}>
        <div className="card pad">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}><h3 style={{margin:0,fontSize:13}}>Job details</h3><button className='btn ghost sm' onClick={()=>setEditing(v=>!v)}>{editing?'Cancel':'Edit Job'}</button></div>
          {!editing ? <><div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>
            <div><div className="muted" style={{fontSize:11,textTransform:'uppercase'}}>Status</div><div style={{marginTop:4}}><span className={`chip ${({Shop:'warn',Installing:'accent',Held:'bad',Installed:'ok',Ready:''})[job.status]||''}`}>{job.status}</span></div></div>
            <div><div className="muted" style={{fontSize:11,textTransform:'uppercase'}}>GC</div><div style={{marginTop:4}}>{job.gc_name || '—'}</div></div>
            <div><div className="muted" style={{fontSize:11,textTransform:'uppercase'}}>Install window</div><div style={{marginTop:4,fontSize:12}}>{installWindow}</div></div>
          </div>
          {job.notes && <div style={{marginTop:12,fontSize:12,color:'var(--ink-2)'}}>{job.notes}</div>}</> : <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <label className='muted' style={{fontSize:12}}>Status<select value={jobDraft.status} onChange={e=>setJobDraft(d=>({...d,status:e.target.value}))}><option>Ready</option><option>Shop</option><option>Installing</option><option>Held</option><option>Installed</option></select></label>
            <label className='muted' style={{fontSize:12}}>GC<input value={jobDraft.gc_name} onChange={e=>setJobDraft(d=>({...d,gc_name:e.target.value}))}/></label>
            <label className='muted' style={{fontSize:12}}>Install Start<input type='date' value={jobDraft.install_start||''} onChange={e=>setJobDraft(d=>({...d,install_start:e.target.value}))}/></label>
            <label className='muted' style={{fontSize:12}}>Install End<input type='date' value={jobDraft.install_end||''} onChange={e=>setJobDraft(d=>({...d,install_end:e.target.value}))}/></label>
            <label className='muted' style={{fontSize:12}}>Contract Value<input type='number' value={jobDraft.contract_value??''} onChange={e=>setJobDraft(d=>({...d,contract_value:e.target.value}))}/></label>
            <label className='muted' style={{fontSize:12,gridColumn:'1 / span 2'}}>Notes<textarea value={jobDraft.notes||''} onChange={e=>setJobDraft(d=>({...d,notes:e.target.value}))}/></label>
            <div><button className='btn accent sm' onClick={saveJob} disabled={savingJob}>{savingJob?'Saving…':'Save Job'}</button></div>
          </div>}
        </div>

        {cos === null ? <window.Spinner /> : cos.length > 0 && (
          <div className="card" style={{marginTop:14}}>
            <div className="card-head"><h3>Change orders</h3></div>
            <table className="wf">
              <thead><tr>
                <th style={{paddingLeft:16}}>Description</th>
                <th style={{width:100}}>Status</th>
                <th className="num" style={{width:130,paddingRight:16}}>Amount</th>
              </tr></thead>
              <tbody>
                {cos.map(c => (
                  <tr key={c.id}>
                    <td style={{paddingLeft:16}}>{c.description || c.title || '—'}</td>
                    <td><span className={`chip ${c.status==='APV'||c.status==='Approved'?'ok':'warn'}`}>{c.status}</span><div style={{marginTop:4,display:'flex',gap:4}}><button className='btn ghost sm' onClick={()=>setCOStatus(c,'Approved')}>Approve</button><button className='btn ghost sm' onClick={()=>setCOStatus(c,'Rejected')}>Reject</button></div></td>
                    <td className="num tnum" style={{paddingRight:16,color:Number(c.amount||0)>=0?'var(--ok)':'var(--bad)'}}>
                      {Number(c.amount||0)>=0?'+':''}{fmtV(c.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="card pad" style={{marginTop:14}}>
          <div className="muted" style={{fontSize:12}}>Full timeline, documents, and activity log will be available in Phase 5 (Cross-View Workflow).</div>
        </div>
      </div>
    </div>
  );
}

// ── CHANGE ORDERS ──────────────────────────────────────
function COView() {
  const [draftOpen, setDraftOpen] = useState(false);
  const cos = [
    { id:'CO-01', t:'Add (3) FH file cabs, L2 corridor', reason:'Owner request', status:'APV',   days:'+1d', amt:+8420,  margin:'24%' },
    { id:'CO-02', t:'Upgrade lab counters to epoxy resin', reason:'Spec ASI-03',  status:'APV',   days:'+2d', amt:+16380, margin:'18%' },
    { id:'CO-03', t:'Delete break-room uppers (VE)',       reason:'VE · RFI-11',  status:'DRAFT', days:'0d',  amt:-3200,  margin:'—' },
    { id:'CO-04', t:'Add corner guards, rooms 201-208',    reason:'Owner email',  status:'DRAFT', days:'+2d', amt:+1136,  margin:'31%' },
  ];
  const fmt = n => (n>=0?'+':'−')+'$'+Math.abs(n).toLocaleString();

  return (
    <div className="view active">
      <div className="page-head">
        <div>
          <div className="eyebrow">Job 26-040 · Ada Co. Courthouse</div>
          <div className="page-title">Change orders</div>
          <div className="page-sub">4 orders · 2 approved · 2 draft · <b>net +$22,736</b> open</div>
        </div>
        <div className="spacer"></div>
        <div className="actions">
          <button className="btn ghost sm" onClick={()=>window.__go('job')}><Icon.back/> Back to job</button>
          <button className="btn">From email</button>
          <button className="btn accent" onClick={()=>setDraftOpen(true)}><Icon.plus/> New CO</button>
        </div>
      </div>

      <div style={{padding:'18px 24px 40px'}}>
        <div className="g3 mb">
          <div className="card kpi"><div className="lbl">Original contract</div><div className="val tnum">$648,200</div><div className="sub">Turner · signed Mar 20</div></div>
          <div className="card kpi" style={{borderColor:'var(--ok)',background:'#f0f2e3'}}><div className="lbl">Net COs (open)</div><div className="val tnum" style={{color:'var(--ok)'}}>+$24,800</div><div className="sub">2 approved · 2 draft pending</div></div>
          <div className="card kpi" style={{borderColor:'var(--accent)'}}><div className="lbl">Current contract</div><div className="val tnum" style={{color:'var(--accent)'}}>$673,000</div><div className="sub">margin 21.4% → 22.1%</div></div>
        </div>

        <div className="card">
          <div className="card-head"><h3>CO log</h3><div style={{flex:1}}></div><span className="chip">by date</span><span className="chip">by status</span></div>
          <table className="wf">
            <thead><tr>
              <th style={{paddingLeft:16,width:70}}>#</th>
              <th>Description</th>
              <th style={{width:140}}>Reason</th>
              <th style={{width:100}}>Status</th>
              <th style={{width:70}} className="ctr">Days</th>
              <th style={{width:70}} className="ctr">Margin</th>
              <th className="num" style={{width:120,paddingRight:16}}>Amount</th>
            </tr></thead>
            <tbody>
              {cos.map((c,i)=>(
                <tr key={i} className={c.status==='DRAFT'?'':''} style={c.status==='DRAFT'?{background:'#fbf4df'}:{}}>
                  <td style={{paddingLeft:16}} className="tnum"><b>{c.id}</b></td>
                  <td><div style={{fontWeight:600}}>{c.t}</div></td>
                  <td className="muted" style={{fontSize:12}}>{c.reason}</td>
                  <td><span className={`chip ${c.status==='APV'?'ok':'warn'}`}>{c.status}</span></td>
                  <td className="ctr muted tnum" style={{fontSize:11.5}}>{c.days}</td>
                  <td className="ctr muted tnum" style={{fontSize:11.5}}>{c.margin}</td>
                  <td className="num tnum" style={{paddingRight:16,fontWeight:700,color:c.amt>=0?'var(--ok)':'var(--bad)'}}>{fmt(c.amt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="g2 mt">
          <div className="card pad has-annot">
            <h3 style={{margin:'0 0 10px',fontSize:13}}>Draft CO-05 · quick entry</h3>
            <div className="stack">
              <div className="field"><label>Description</label><input defaultValue="Add power strips at 8 lab benches"/></div>
              <div className="g2">
                <div className="field"><label>Reason</label><input defaultValue="Owner add via RFI-12"/></div>
                <div className="field"><label>Schedule impact</label><input defaultValue="+0 days"/></div>
              </div>
              <div className="field"><label>Line items (from library)</label>
                <div className="card tight" style={{padding:'8px 10px'}}>
                  <div className="row" style={{justifyContent:'space-between'}}><span>Power strip, 6-outlet lab grade · 8 × $94</span><b className="tnum">$752</b></div>
                </div>
              </div>
              <div className="row gap-sm mt-sm">
                <button className="btn sm">Attach RFI-12</button>
                <button className="btn sm">Preview PDF</button>
                <div style={{flex:1}}></div>
                <button className="btn ghost sm">Save draft</button>
                <button className="btn accent sm">Send for signature</button>
              </div>
            </div>
            <span className="annot" style={{top:10,right:14}}>pulls from SAME<br/>pricing library</span>
          </div>

          <div className="card pad">
            <h3 style={{margin:'0 0 10px',fontSize:13}}>Impact if all drafts approve</h3>
            <div className="row-list"><div className="flex">Contract</div><div className="tnum">$648,200</div></div>
            <div className="row-list"><div className="flex" style={{color:'var(--ok)'}}>+ CO-01, CO-02 (approved)</div><div className="tnum" style={{color:'var(--ok)'}}>+$24,800</div></div>
            <div className="row-list"><div className="flex" style={{color:'var(--bad)'}}>+ CO-03 (draft, VE)</div><div className="tnum" style={{color:'var(--bad)'}}>−$3,200</div></div>
            <div className="row-list"><div className="flex" style={{color:'var(--ok)'}}>+ CO-04 (draft)</div><div className="tnum" style={{color:'var(--ok)'}}>+$1,136</div></div>
            <div className="row-list"><div className="flex"><b>If all sign</b></div><div className="tnum" style={{fontWeight:700,fontSize:14,color:'var(--accent)'}}>$670,936</div></div>
            <hr className="rule"/>
            <div className="muted" style={{fontSize:11.5}}>Schedule impact: +3 days total · crew P<br/>Margin on CO portfolio: 21.8% vs 22% target</div>
          </div>
        </div>
      </div>

      {/* Drawer stub — not fully wired, just shows on click */}
      <div className={`scrim ${draftOpen?'open':''}`} onClick={()=>setDraftOpen(false)}></div>
      <div className={`drawer ${draftOpen?'open':''}`}>
        <div className="drawer-head">
          <h2>New change order</h2>
          <div style={{flex:1}}></div>
          <button className="btn ghost sm" onClick={()=>setDraftOpen(false)}>✕</button>
        </div>
        <div className="drawer-body">
          <div className="stack" style={{gap:14}}>
            <div className="field"><label>Title</label><input placeholder="One-line description"/></div>
            <div className="g2">
              <div className="field"><label>Reason</label><select><option>Owner request</option><option>Spec revision</option><option>VE</option><option>Site condition</option></select></div>
              <div className="field"><label>Source</label><select><option>Email</option><option>RFI response</option><option>ASI</option><option>Verbal</option></select></div>
            </div>
            <div className="field"><label>Line items</label><textarea rows="4" placeholder="Type or paste from library…"></textarea></div>
            <div className="g2">
              <div className="field"><label>Schedule impact (days)</label><input type="number" defaultValue={0}/></div>
              <div className="field"><label>Attachments</label><input type="text" placeholder="📎 drop files…"/></div>
            </div>
          </div>
        </div>
        <div className="drawer-foot">
          <button className="btn" onClick={()=>setDraftOpen(false)}>Cancel</button>
          <button className="btn ghost">Save draft</button>
          <button className="btn accent">Create &amp; send for sig</button>
        </div>
      </div>
    </div>
  );
}

window.Views = Object.assign(window.Views || {}, { jobs: JobsView, job: JobView, co: COView });
