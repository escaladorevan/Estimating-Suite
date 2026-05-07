// FS Proposal PDF generator — ported from FS_Estimator_v2_1.html exportPDF()
// window.generateProposalPDF(bid, areas, alts, { download: true })
// Returns a blob URL when download=false (preview mode), otherwise triggers save.

(function () {
  'use strict';

  const LM = 19, RM = 192, CW = RM - LM, BM = 275;
  const cDesc = LM, cRef = LM + 96, cQty = LM + 124, cUnit = LM + 136, cPrice = RM;

  function fmt$(n) { return '$' + Math.round(+(n || 0)).toLocaleString('en-US'); }
  function pct(v)  { return parseFloat(v) || 0; }

  function itemCost(item) {
    return item.ignore ? 0 : (+(item.qty) || 0) * (+(item.unit_cost) || 0);
  }
  function sectionCost(sec) {
    return sec.ignore ? 0 : (sec.items || []).reduce((s, i) => s + itemCost(i), 0);
  }
  function areaBase(area) {
    return area.ignore ? 0 : (area.qty || 1) * (area.sections || []).reduce((s, sec) => s + sectionCost(sec), 0);
  }

  function generateProposalPDF(bid, areas, alts, { download = true } = {}) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
    const ohFactor = 1 + pct(bid.oh_pct ?? 15) / 100;
    const totals = window.EstimateEngine.calcBid({
      areas, ohPct: bid.oh_pct ?? 15, delPct: bid.del_pct ?? 5, insPct: bid.ins_pct ?? 20,
    });
    let y = 15;

    function txt(x, yy, str, opts = {}) {
      if (str === null || str === undefined || str === '') return;
      doc.setFontSize(opts.size || 8.5);
      doc.setFont('helvetica', opts.bold && opts.italic ? 'bolditalic' : opts.bold ? 'bold' : opts.italic ? 'italic' : 'normal');
      doc.setTextColor(...(opts.color || [0, 0, 0]));
      if (opts.align === 'right') doc.text(String(str), x, yy, { align: 'right' });
      else doc.text(String(str), x, yy, opts.maxWidth ? { maxWidth: opts.maxWidth } : undefined);
    }
    function hline(yy, x0, x1, lw, gray) {
      doc.setDrawColor(gray ? 153 : 0); doc.setLineWidth(lw || 0.3);
      doc.line(x0 ?? LM, yy, x1 ?? RM, yy);
    }
    function fillRect(x, yy, w, h, r, g, b) {
      doc.setFillColor(r ?? 217, g ?? 217, b ?? 217); doc.rect(x, yy, w, h, 'F');
    }
    function checkY(space) {
      if (y + space > BM) {
        doc.addPage(); y = 15;
        txt(LM, y, 'Form and Structure, Inc.  ' + (bid.doc_type || 'Proposal'), { bold: true, size: 9.5 }); y += 4.5;
        txt(LM, y, (bid.number ? bid.number + ' — ' : '') + (bid.name || ''), { size: 8.5 });
        txt(RM, y, 'Continued…', { size: 8.5, align: 'right' }); y += 4.5;
        txt(LM, y, bid.gc_name || '', { size: 8.5 }); y += 3.5;
        hline(y, LM, RM, 0.5); y += 5.5;
      }
    }

    // ── PAGE 1 ──────────────────────────────────────────────────────────────────
    // Logo + company block
    if (window.LOGO_B64) {
      const logoW = 56, logoH = logoW * (219 / 800);
      doc.addImage('data:image/jpeg;base64,' + window.LOGO_B64, 'JPEG', LM, y, logoW, logoH);
      const ax = RM, ay = y + 1;
      [{ t: 'Form and Structure, Inc.', b: true }, { t: '10708 NE 2nd Ave' },
       { t: 'Portland, OR 97211' }, { t: 'Tel: (503) 289-9204' }, { t: 'CCB# 52938' }]
        .forEach((l, i) => txt(ax, ay + i * 3.8, l.t, { size: 7.5, bold: !!l.b, align: 'right' }));
      y += Math.max(logoH, 18) + 3;
    }

    // Doc type + date
    const rawDate = bid.due_date || bid.submitted_date || '';
    const bidDate = rawDate ? new Date(rawDate + 'T12:00:00').toLocaleDateString('en-US') : '';
    txt(LM, y, bid.doc_type || 'Proposal', { size: 16, bold: true });
    txt(RM, y, 'Date  ' + bidDate, { size: 9, align: 'right' });
    y += 5; hline(y, LM, RM, 0.5); y += 5;

    // To: block
    txt(LM, y, 'To:', { bold: true, size: 9 });
    const tx = LM + 7;
    txt(tx, y, bid.gc_name || '', { bold: true, size: 9 }); y += 4.5;
    if (bid.address) {
      bid.address.split('\n').filter(Boolean).forEach(line => { txt(tx, y, line.trim(), { size: 9 }); y += 4.5; });
    }
    y += 2; hline(y, LM, RM, 0.25, true); y += 4.5;

    // Info grid
    const c1l = LM, c1v = LM + 26, c2l = LM + CW / 2, c2v = LM + CW / 2 + 26;
    [['Attention :', bid.attention || '', 'Project Id :', bid.number || ''],
     ['Project :', bid.name || '', 'Ship Via :', bid.ship_via || 'Installed by F&S'],
     ['Terms :', bid.terms || 'Net 30', 'P.O. Number :', bid.po_number || 'n/a'],
     ['Delivery Date :', bid.delivery_date || '', 'Estimator :', bid.estimator || '']]
      .forEach(([l1, v1, l2, v2]) => {
        txt(c1l, y, l1, { bold: true, size: 7.5 }); txt(c1v, y, v1, { size: 7.5 });
        txt(c2l, y, l2, { bold: true, size: 7.5 }); txt(c2v, y, v2, { size: 7.5 });
        y += 4.5;
      });
    y += 2; hline(y, LM, RM, 0.5); y += 5;

    // Column headers row
    fillRect(LM, y - 3.2, CW, 5.2);
    [{ x: cDesc, t: 'Description', a: 'left' }, { x: cRef, t: 'Drawing Ref', a: 'left' },
     { x: cQty, t: 'Qty', a: 'right' }, { x: cUnit, t: 'Unit', a: 'left' }, { x: cPrice, t: 'Price', a: 'right' }]
      .forEach(c => txt(c.x, y, c.t, { bold: true, size: 7.5, align: c.a }));
    y += 5.2; hline(y, LM, RM, 0.4); y += 3;

    // Bid document references
    [[bid.name ? bid.name.toUpperCase() : '', 'PROJECT:'],
     [bid.bid_docs, 'Bid Documents:'], [bid.architect, 'Architect:'],
     [bid.drawings_dated, 'Drawings Dated:'], [bid.specs_dated, 'Specifications Dated:']]
      .forEach(([v, l]) => { if (!v) return; txt(cDesc, y, l, { bold: true, size: 7.5 }); txt(cDesc + 38, y, v, { size: 7.5 }); y += 4; });

    if (bid.addendums) {
      txt(cDesc, y, 'The following addendums have been received and acknowledged:', { bold: true, size: 7.5 }); y += 4;
      txt(cDesc + 4, y, bid.addendums, { size: 7.5, maxWidth: CW - 4 }); y += 4;
    }
    y += 2;

    // ── LINE ITEMS ──────────────────────────────────────────────────────────────
    const mode = bid.pricing_mode || 'byarea';
    const printAreas = (areas || []).filter(a => !a.no_print && !a.ignore);

    if (mode === 'lumpsum') {
      checkY(6);
      txt(cDesc, y, bid.name || 'Base Scope of Work', { size: 8.5 });
      txt(cQty, y, '1', { size: 8.5, align: 'right' });
      txt(cUnit, y, 'lump sum', { size: 8.5 });
      txt(cPrice, y, fmt$(totals.total), { size: 8.5, align: 'right' });
      y += 5;

    } else if (mode === 'byarea') {
      printAreas.forEach(area => {
        checkY(8);
        const aT = areaBase(area) * ohFactor;
        const aQty = area.qty || 1;
        txt(cDesc, y, area.name || 'Area', { bold: true, size: 8.5 });
        txt(cQty, y, String(aQty), { size: 8.5, align: 'right' });
        txt(cUnit, y, aQty > 1 ? 'rooms' : 'lump sum', { size: 8.5 });
        txt(cPrice, y, fmt$(aT), { size: 8.5, align: 'right' });
        y += 5;
      });

    } else {
      // Itemized
      printAreas.forEach(area => {
        checkY(10);
        txt(cDesc, y, area.name || 'Area', { bold: true, size: 8.5 }); y += 4.5;
        (area.sections || []).filter(s => !s.no_print && !s.ignore).forEach(sec => {
          (sec.items || []).filter(i => !i.no_print && !i.ignore).forEach(item => {
            checkY(5);
            txt(cDesc, y, '  ' + (item.description || '—'), { size: 7.5, maxWidth: 90 });
            if (item.drawing_ref) txt(cRef, y, item.drawing_ref, { size: 7.5, maxWidth: 28 });
            txt(cQty, y, String(item.qty || 1), { size: 7.5, align: 'right' });
            txt(cUnit, y, item.unit || '', { size: 7.5 });
            txt(cPrice, y, fmt$(itemCost(item) * ohFactor), { size: 7.5, align: 'right' });
            y += 4.2;
          });
        });
        txt(cDesc, y, '  ' + area.name + ' Subtotal', { italic: true, size: 7.5 });
        txt(cPrice, y, fmt$(areaBase(area) * ohFactor), { italic: true, size: 7.5, align: 'right' });
        y += 4.2; y += 2;
      });
    }

    hline(y, LM, RM, 0.25, true); y += 4.5;

    // D&I line
    const diTotal = totals.delAmt + totals.insAmt;
    if (diTotal > 0) {
      const lbl = totals.delAmt > 0 && totals.insAmt > 0 ? 'Delivery & Installation' : totals.delAmt > 0 ? 'Delivery' : 'Installation';
      txt(cDesc, y, lbl, { size: 8.5 });
      txt(cQty,  y, '1', { size: 8.5, align: 'right' });
      txt(cUnit, y, 'job', { size: 8.5 });
      txt(cPrice, y, fmt$(diTotal), { size: 8.5, align: 'right' });
      y += 4.8;
    }
    hline(y, LM, RM, 0.5); y += 4.5;

    // Base Bid total
    txt(cDesc, y, 'Base Bid', { bold: true, size: 10 });
    txt(cQty,  y, '1', { bold: true, size: 10, align: 'right' });
    txt(cUnit, y, '$',  { bold: true, size: 10 });
    txt(cPrice, y, fmt$(totals.total), { bold: true, size: 10, align: 'right' });
    y += 6; hline(y, LM, RM, 0.8); y += 6;

    // Alternates
    if ((alts || []).length > 0) {
      txt(LM, y, 'ALTERNATES', { bold: true, size: 8.5 }); y += 4.5;
      alts.forEach((alt, i) => {
        checkY(6);
        txt(cDesc, y, 'Alternate No. ' + (i + 1) + ':  ' + (alt.description || ''), { size: 8.5 });
        txt(cQty,  y, String(alt.qty || 1), { size: 8.5, align: 'right' });
        txt(cUnit, y, alt.unit || 'lump sum', { size: 8.5 });
        txt(cPrice, y, fmt$((alt.price || 0) * (alt.qty || 1)), { size: 8.5, align: 'right' });
        y += 5;
      });
      y += 3;
    }

    // Exclusions (end of page 1)
    const excl = (bid.exclusions || []).filter(e => e.active);
    if (excl.length) {
      checkY(8); txt(LM, y, 'EXCLUSIONS', { bold: true, size: 8.5 }); y += 4.5;
      excl.forEach(({ text: line }) => { if (!line) return; checkY(4); txt(LM + 3, y, line, { size: 7.5, maxWidth: CW - 3 }); y += 3.8; });
    }

    // ── PAGE 2 ──────────────────────────────────────────────────────────────────
    doc.addPage(); y = 15;
    txt(LM, y, 'Form and Structure, Inc.  ' + (bid.doc_type || 'Proposal'), { bold: true, size: 9.5 }); y += 4.5;
    txt(LM, y, (bid.number ? bid.number + ' — ' : '') + (bid.name || ''), { size: 8.5 });
    txt(RM, y, 'Page No. 2 of 2 Pages', { size: 8.5, align: 'right' }); y += 4.5;
    txt(LM, y, bid.gc_name || '', { size: 8.5 }); y += 3.5;
    hline(y, LM, RM, 0.5); y += 5.5;

    function section(title, lines) {
      const active = lines.filter(Boolean);
      if (!active.length) return;
      checkY(8); txt(LM, y, title, { bold: true, size: 8.5 }); y += 4.5;
      active.forEach(line => { checkY(4); txt(LM + 3, y, line.replace(/\\'/g, '’'), { size: 7.5, maxWidth: CW - 3 }); y += 3.8; });
      y += 3;
    }

    section('CLARIFICATIONS:', (bid.clarifications || []).filter(e => e.active).map(e => e.text));
    section('GENERAL TERMS:', (bid.general_terms || []).filter(e => e.active).map(e => e.text));
    section('WARRANTY AND FABRICATION:', (bid.warranty || []).filter(e => e.active).map(e => e.text));
    section('FINISH MATERIALS:', (bid.finish_terms || []).filter(e => e.active).map(e => e.text));
    section('HARDWARE ASSUMPTIONS:', (bid.hardware_terms || []).filter(e => e.active).map(e => e.text));
    section('FABRICATION NOTE:', (bid.fab_note || []).filter(e => e.active).map(e => e.text));

    y += 4;
    txt(LM, y, 'Please Note: Prices valid for 30 days.', { italic: true, size: 7.5 }); y += 7;
    hline(y, LM, LM + 64, 0.4); y += 4;
    txt(LM, y, 'Authorized Signature', { size: 7.5 });

    // ── Output ──────────────────────────────────────────────────────────────────
    if (download) {
      const slug = s => (s || '').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
      const dp = bidDate.split('/');
      const dateStr = dp.length >= 2 ? parseInt(dp[0], 10) + '.' + dp[1] : bidDate;
      doc.save(`${slug(bid.gc_name) || 'Client'}_${slug(bid.name) || 'Proposal'}_${dateStr}.pdf`);
      return null;
    }
    return doc.output('bloburl');
  }

  window.generateProposalPDF = generateProposalPDF;
}());
