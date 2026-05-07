// Pricing Library Import Utility
// Reads Casework_Pricing_Library.xlsx and upserts all rows into Supabase library_items.
//
// Usage from browser console (after logging in to the app):
//   importLibrary()          → dry run: logs columns, row count, and first 3 rows
//   importLibrary(false)     → executes full import to Supabase
//
// Safe to run multiple times — uses INSERT, not upsert, so run once on a fresh table.
// To re-import: clear existing rows via Supabase dashboard first.

window.importLibrary = async function(dryRun) {
  if (dryRun === undefined) dryRun = true;

  if (!window.XLSX)     { console.error('[importLibrary] XLSX not loaded'); return; }
  if (!window.sb)       { console.error('[importLibrary] Supabase not initialized'); return; }

  // ── Fetch the Excel file ──
  console.log('[importLibrary] Fetching Casework_Pricing_Library.xlsx...');
  let resp;
  try { resp = await fetch('project/uploads/Casework_Pricing_Library.xlsx'); }
  catch (e) { console.error('[importLibrary] Fetch error:', e); return; }
  if (!resp.ok) { console.error('[importLibrary] HTTP', resp.status, resp.statusText); return; }

  const buf = await resp.arrayBuffer();
  const wb  = window.XLSX.read(buf, { type: 'array' });

  console.log('[importLibrary] Sheets found:', wb.SheetNames);

  // Use first sheet
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(ws, { defval: '' });

  if (!rows.length) { console.warn('[importLibrary] Sheet is empty'); return; }

  const headers = Object.keys(rows[0]);
  console.log('[importLibrary] Column headers:', headers);
  console.log('[importLibrary] Row count:', rows.length);
  console.log('[importLibrary] First 3 rows:', rows.slice(0, 3));

  if (dryRun) {
    console.log('[importLibrary] ── DRY RUN complete ──');
    console.log('[importLibrary] Call importLibrary(false) to execute the import.');
    return;
  }

  // ── Auto-detect column names ──
  const find = function() {
    var candidates = Array.prototype.slice.call(arguments);
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      var match = headers.find(function(h) {
        return h.toLowerCase().replace(/[\s_]/g, '').includes(c.toLowerCase().replace(/[\s_]/g, ''));
      });
      if (match) return match;
    }
    return null;
  };

  var colCat  = find('category', 'cat', 'section', 'type', 'group');
  var colCode = find('code', 'itemno', 'sku', 'part', 'id');
  var colDesc = find('description', 'desc', 'item', 'name', 'title');
  var colUnit = find('unit', 'uom', 'measure');
  var colCost = find('unitcost', 'unit_cost', 'cost', 'price', 'rate', 'amount');
  var colMat  = find('material', 'matcost', 'mat');
  var colLab  = find('labor', 'labcost', 'lab', 'install');

  console.log('[importLibrary] Detected columns:', {
    category: colCat, code: colCode, description: colDesc,
    unit: colUnit, unit_cost: colCost,
    material_cost: colMat, labor_cost: colLab
  });

  if (!colDesc) {
    console.error('[importLibrary] Could not detect description column. Review headers above and adjust column names in your Excel file.');
    return;
  }
  if (!colCost) {
    console.error('[importLibrary] Could not detect cost column. Review headers above.');
    return;
  }

  // ── Build items array ──
  var items = [];
  for (var r = 0; r < rows.length; r++) {
    var row  = rows[r];
    var desc = String(row[colDesc] || '').trim();
    var cost = parseFloat(row[colCost]);
    if (!desc || isNaN(cost)) continue;

    var item = { description: desc, unit_cost: cost };
    if (colCat  && row[colCat])  item.category      = String(row[colCat]).trim();
    if (colCode && row[colCode]) item.code           = String(row[colCode]).trim() || null;
    if (colUnit && row[colUnit]) item.unit           = String(row[colUnit]).trim() || 'EA';
    if (colMat  && row[colMat])  { var m = parseFloat(row[colMat]); if (!isNaN(m)) item.material_cost = m; }
    if (colLab  && row[colLab])  { var l = parseFloat(row[colLab]); if (!isNaN(l)) item.labor_cost = l; }
    items.push(item);
  }

  console.log('[importLibrary] Items to import:', items.length);
  if (!items.length) { console.warn('[importLibrary] No valid items found'); return; }

  // ── Insert in batches of 50 ──
  var BATCH_SIZE = 50;
  var imported = 0, errors = 0;

  for (var i = 0; i < items.length; i += BATCH_SIZE) {
    var batch  = items.slice(i, i + BATCH_SIZE);
    var result = await window.sb.from('library_items').insert(batch);
    if (result.error) {
      console.error('[importLibrary] Batch', Math.floor(i / BATCH_SIZE) + 1, 'error:', result.error.message);
      errors += batch.length;
    } else {
      imported += batch.length;
      console.log('[importLibrary] Progress:', imported, '/', items.length);
    }
  }

  console.log('[importLibrary] ── Import complete ──');
  console.log('[importLibrary] Imported:', imported, ' | Errors:', errors);
  if (errors === 0) {
    console.log('[importLibrary] All items imported. Reload the Pricing Library view to confirm.');
  }
};
