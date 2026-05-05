// Shell: topbar, left rail, and view router. Views registered on window.
const { useState, useEffect, useMemo, useRef } = React;

const Icon = {
  pipeline: () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 4h12M2 8h8M2 12h4"/></svg>,
  bids:     () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="2" width="10" height="12" rx="1"/><path d="M5.5 5h5M5.5 8h5M5.5 11h3"/></svg>,
  jobs:     () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="5" width="12" height="9" rx="1"/><path d="M6 5V3.5A1.5 1.5 0 0 1 7.5 2h1A1.5 1.5 0 0 1 10 3.5V5"/></svg>,
  calendar: () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2.5" y="3.5" width="11" height="10" rx="1"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/></svg>,
  library:  () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3v10l2-1 2 1 2-1 2 1 2-1V3l-2 1-2-1-2 1-2-1-2 1z"/></svg>,
  contacts: () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="6" r="2.5"/><path d="M3.5 13c.5-2.2 2.4-3.5 4.5-3.5s4 1.3 4.5 3.5"/></svg>,
  docs:     () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3"/></svg>,
  reports:  () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2.5 13V3.5M13.5 13H2.5"/><path d="M5 11V7M8 11V5M11 11V9"/></svg>,
  margin:   () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="5.5"/><path d="M8 3v5l3 2"/></svg>,
  home:     () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2.5 8L8 3l5.5 5v5.5H10V10H6v3.5H2.5z"/></svg>,
  search:   () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="4"/><path d="M10 10l3 3"/></svg>,
  plus:     () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>,
  ext:      () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 3H3v10h10v-3M9 3h4v4M8 8l5-5"/></svg>,
  chevR:    () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 4l4 4-4 4"/></svg>,
  back:     () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M10 4L6 8l4 4M6 8h7"/></svg>,
  filter:   () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 4h12l-5 6v4l-2-1v-3z"/></svg>,
  dl:       () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 2v9M4 7l4 4 4-4M3 14h10"/></svg>,
  history:  () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 8a5 5 0 1 0 1.5-3.5L3 6"/><path d="M3 3v3h3"/><path d="M8 5v3l2 1.5"/></svg>,
};

const NAV = [
  { id:'home',     label:'Home',           group:'Work' },
  { id:'pipeline', label:'Pipeline',       group:'Work', count:22 },
  { id:'estimator',label:'Bid Workbook',   group:'Work' },
  { id:'jobs',     label:'Jobs',           group:'Work', count:18 },
  { id:'job',      label:'Job · Ada Co.',  group:'Work', hidden:true },
  { id:'co',       label:'Change Orders',  group:'Work', hidden:true },
  { id:'calendar', label:'Calendar',       group:'Work' },
  { id:'library',  label:'Pricing Library',group:'Data', count:1240 },
  { id:'contacts', label:'Contacts',       group:'Data' },
  { id:'docs',     label:'Documents',      group:'Data' },
  { id:'reports',  label:'Reports',        group:'Insight' },
  { id:'margin',   label:'Margin Analysis',group:'Insight' },
  { id:'bidhistory',label:'Bid History',   group:'Insight' },
];

function Spinner() {
  return (
    <div style={{display:'flex', justifyContent:'center', alignItems:'center', padding:'48px 0'}}>
      <div className="spinner" aria-label="Loading…"/>
    </div>
  );
}

function EmptyState({ heading, body, action }) {
  return (
    <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'48px 0', maxWidth:360, margin:'0 auto', textAlign:'center'}}>
      <div style={{fontSize:14, fontWeight:600, color:'var(--ink-2)'}}>{heading}</div>
      {body && <div style={{fontSize:13, color:'var(--ink-3)', marginTop:6}}>{body}</div>}
      {action && (
        <button className="btn accent sm" style={{marginTop:16}} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

function Rail({ active, onGo, railOpen, setRailOpen }) {
  const groups = {};
  NAV.forEach(n => { (groups[n.group] ||= []).push(n); });
  const iconFor = (id) => {
    const map = { home:Icon.home, pipeline:Icon.pipeline, estimator:Icon.bids, jobs:Icon.jobs, job:Icon.jobs, co:Icon.bids,
      calendar:Icon.calendar, library:Icon.library, contacts:Icon.contacts, docs:Icon.docs, reports:Icon.reports, margin:Icon.margin, bidhistory:Icon.history };
    return (map[id] || Icon.bids)();
  };
  return (
    <nav id="rail">
      {Object.entries(groups).map(([g, items]) => (
        <React.Fragment key={g}>
          <div className="rail-sec">{g}</div>
          {items.filter(i => !i.hidden).map(it => (
            <div key={it.id} className={`rail-item ${active === it.id ? 'active' : ''}`} onClick={() => onGo(it.id)}>
              {iconFor(it.id)}
              <span>{it.label}</span>
              {it.count != null && <span className="count">{it.count}</span>}
            </div>
          ))}
        </React.Fragment>
      ))}
      <div className="rail-foot">
        {railOpen && <><span className="dot"></span><span>Synced · OneDrive</span></>}
        <button className="rail-toggle" onClick={() => setRailOpen(p => !p)} title={railOpen ? 'Collapse nav' : 'Expand nav'}>
          {railOpen ? '‹' : '›'}
        </button>
      </div>
    </nav>
  );
}

function Topbar({ crumb, actions, initials, onLogout }) {
  const [showMenu, setShowMenu] = useState(false);
  return (
    <header id="topbar">
      <div className="brand">
        <div className="monogram">F&amp;S</div>
        <div className="name">Estimating Suite <em>v1</em></div>
      </div>
      <span className="sep">/</span>
      <div className="crumb">{crumb}</div>
      <div className="spacer"></div>
      <div className="search">
        <Icon.search /> <span>Search bids, jobs, contacts, items…</span>
        <span className="kbd">⌘K</span>
      </div>
      {actions}
      <div className="avatar-wrap">
        <div className="avatar" title={initials} onClick={() => setShowMenu(v => !v)}>
          {initials}
        </div>
        {showMenu && (
          <div className="avatar-menu">
            <button className="avatar-menu-item" onClick={() => { setShowMenu(false); onLogout(); }}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function AuthenticatedApp({ session }) {
  const [active, setActive] = useState(() => {
    try { return localStorage.getItem('fs-view') || 'home'; } catch { return 'home'; }
  });
  const go = (id) => { setActive(id); try { localStorage.setItem('fs-view', id); } catch {} };
  useEffect(() => { window.__go = go; }, []);

  const [activeBidId, setActiveBidId] = useState(() => {
    try { return localStorage.getItem('fs-active-bid') || null; } catch { return null; }
  });
  const [activeBidName, setActiveBidName] = useState('');
  const [railOpen, setRailOpen] = useState(true);

  const openBid = (bidId, bidName) => {
    setActiveBidId(bidId);
    setActiveBidName(bidName || '');
    try { localStorage.setItem('fs-active-bid', bidId); } catch {}
    go('estimator');
  };

  const openBidContext = async (bid) => {
    if (!bid?.id) return;
    if (bid.stage === 'Won') {
      const { data: job, error } = await window.dbHelpers.getJobByBidId(bid.id);
      if (!error && job) {
        window.__activeJob = job;
        go('job');
        return;
      }
    }
    openBid(bid.id, bid.name);
  };

  // Derive initials from email (e.g. "evan.pruitt@fs.com" → "EP")
  const initials = useMemo(() => {
    const email = session?.user?.email || '';
    const parts = email.split('@')[0].split(/[._-]/);
    return parts.slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || 'U';
  }, [session]);

  const crumb = useMemo(() => {
    switch (active) {
      case 'home': return <><b>Home</b> <span className="sep">/</span> <span>Pipeline overview</span></>;
      case 'pipeline': return <><b>Pipeline</b> <span className="sep">/</span> <span>All stages</span></>;
      case 'estimator': return <><span>Bids</span> <span className="sep">/</span> <b>{activeBidName || 'Bid Workbook'}</b></>;
      case 'jobs': return <><b>Jobs</b> <span className="sep">/</span> <span>Active · 2026</span></>;
      case 'job': return <><span>Jobs</span> <span className="sep">/</span> <b>Ada Co. Courthouse · 26-040</b></>;
      case 'co': return <><span>Jobs</span> <span className="sep">/</span> <span>Ada Co. Courthouse</span> <span className="sep">/</span> <b>Change Orders</b></>;
      case 'bidhistory': return <><span>Insight</span> <span className="sep">/</span> <b>Bid History &amp; Comparison</b></>;
      default: return <b>{NAV.find(n=>n.id===active)?.label || 'Home'}</b>;
    }
  }, [active, activeBidName]);

  const actions = useMemo(() => {
    switch (active) {
      case 'home':
      case 'pipeline':
        return <>
          <button className="btn ghost" onClick={()=>go('pipeline')}>Ingest ITB</button>
          <button className="btn primary" onClick={()=>go('estimator')}><Icon.plus /> New bid</button>
        </>;
      case 'estimator':
        return <>
          <button className="btn ghost">History</button>
          <button className="btn">Compare</button>
          <button className="btn accent">Build proposal →</button>
        </>;
      case 'jobs':
        return <>
          <button className="btn ghost">Import from awarded</button>
          <button className="btn primary"><Icon.plus /> New job</button>
        </>;
      case 'job':
        return <>
          <button className="btn ghost">Open files</button>
          <button className="btn">Edit scope</button>
          <button className="btn accent">+ Change order</button>
        </>;
      case 'co':
        return <>
          <button className="btn ghost" onClick={()=>go('job')}><Icon.back /> Job</button>
          <button className="btn accent">+ New CO</button>
        </>;
      default: return null;
    }
  }, [active]);

  async function handleLogout() {
    await window.sb.auth.signOut();
  }

  return (
    <div id="app">
      <Topbar crumb={crumb} actions={actions} initials={initials} onLogout={handleLogout} />
      <div id="main" className={railOpen ? '' : 'rail-collapsed'}>
        <Rail active={active} onGo={go} railOpen={railOpen} setRailOpen={setRailOpen} />
        <main id="content">
          {(() => {
            if (!window.Views) return <div style={{padding:40}}>Loading…</div>;
            switch (active) {
              case 'pipeline': {
                const PV = window.Views.pipeline;
                return PV ? <PV go={go} onOpenBid={openBidContext} /> : null;
              }
              case 'estimator': {
                const EV = window.Views.estimator;
                return EV ? <EV go={go} activeBidId={activeBidId} /> : null;
              }
              default: {
                const V = window.Views[active] || window.Views.home;
                return V ? <V go={go} /> : <div style={{padding:40}}>Loading…</div>;
              }
            }
          })()}
        </main>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    const { data: { subscription } } = window.sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  if (!session) return <LoginView />;
  return <AuthenticatedApp session={session} />;
}

window.Spinner = Spinner;
window.EmptyState = EmptyState;
window.App = App;
window.Icon = Icon;
