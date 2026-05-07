// Proposal preview modal — renders the PDF blob in an iframe and provides a Download button.
// window.ProposalPreviewModal = ProposalPreviewModal

const { useState: uSpv, useEffect: uEpv } = React;

const OVL = {position:'fixed',inset:0,background:'rgba(0,0,0,.65)',zIndex:950,
  display:'flex',flexDirection:'column',alignItems:'stretch'};

function ProposalPreviewModal({ bid, areas, alts, onClose }) {
  const [blobUrl, setBlobUrl] = uSpv(null);
  const [err,     setErr]     = uSpv(null);
  const [loading, setLoading] = uSpv(true);

  uEpv(() => {
    let url = null;
    try {
      url = window.generateProposalPDF(bid, areas, alts, { download: false });
      setBlobUrl(url);
    } catch(ex) {
      setErr(ex.message);
    } finally {
      setLoading(false);
    }
    return () => { if (url) URL.revokeObjectURL(url); };
  }, []);

  function download() {
    try {
      window.generateProposalPDF(bid, areas, alts, { download: true });
    } catch(ex) {
      alert('PDF error: ' + ex.message);
    }
  }

  return (
    <div style={OVL}>
      {/* Header bar */}
      <div style={{display:'flex',alignItems:'center',padding:'8px 16px',background:'#22201B',
        color:'#fff',gap:10,flexShrink:0}}>
        <div style={{flex:1,fontSize:13,fontWeight:600}}>
          Proposal Preview — {bid.name || 'Untitled'}
          <span style={{color:'#746B60',fontFamily:'var(--mono)',fontSize:11,marginLeft:8}}>{bid.number}</span>
        </div>
        <button className="btn accent sm" onClick={download}>⬇ Download PDF</button>
        <button style={{background:'rgba(255,255,255,.1)',border:'none',cursor:'pointer',color:'#fff',
          borderRadius:4,padding:'5px 12px',fontSize:12}} onClick={onClose}>Close</button>
      </div>

      {/* Content */}
      <div style={{flex:1,background:'#555',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
        {loading && (
          <div style={{color:'#fff',fontSize:13}}>Generating PDF…</div>
        )}
        {err && (
          <div style={{color:'#fbb',fontSize:13,padding:32,textAlign:'center'}}>
            <strong>PDF generation failed</strong><br/>
            <span style={{fontSize:11,opacity:.8}}>{err}</span>
          </div>
        )}
        {blobUrl && !err && (
          <iframe src={blobUrl} style={{width:'100%',height:'100%',border:'none'}} title="Proposal Preview" />
        )}
      </div>
    </div>
  );
}

window.ProposalPreviewModal = ProposalPreviewModal;
