const { useEffect, useRef, useCallback } = React;

function EstimatorView({ activeBidId }) {
  const iframeRef    = useRef(null);
  const loadedBidRef = useRef(null);

  useEffect(() => {
    if (!activeBidId || !iframeRef.current) return;
    if (loadedBidRef.current === activeBidId) return;

    async function loadBid() {
      const { data, error } = await window.dbHelpers.getEstimateData(activeBidId);
      if (error) { console.error('getEstimateData failed:', error); return; }
      if (data) {
        iframeRef.current.contentWindow.postMessage({ type: 'fs-load', data }, '*');
        loadedBidRef.current = activeBidId;
      }
      // No estimate_data yet → V2 opens with defaultState() which is correct for new bids
    }

    const iframe = iframeRef.current;
    if (iframe.contentDocument?.readyState === 'complete') {
      loadBid();
    } else {
      iframe.addEventListener('load', loadBid, { once: true });
    }
  }, [activeBidId]);

  const handleMessage = useCallback(async (e) => {
    if (!e.data || e.data.type !== 'fs-save') return;
    if (!activeBidId) return;
    const { error } = await window.dbHelpers.saveEstimateData(activeBidId, e.data.data);
    if (error) console.error('saveEstimateData failed:', error);
  }, [activeBidId]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  if (!activeBidId) {
    return (
      <div style={{
        padding: 48, textAlign: 'center', background: '#f6f1e6',
        color: '#7a6a5a', fontFamily: 'Inter, sans-serif', minHeight: '100vh',
      }}>
        No bid selected. Open a bid from the Bid Board.
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      src="project/uploads/FS_Estimator_v2_1.html"
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block', background: '#f6f1e6' }}
      title="F&S Estimator"
    />
  );
}

window.Views = Object.assign(window.Views || {}, { estimator: EstimatorView });
