// Estimate Engine — pure calculation functions extracted from FS_Estimator_v2_1.html.
// Both the iframe V2 and the future native React estimator share this module.
// All functions are parameterized (no global ST dependency).
//
// Verification: open browser console and run:
//   var st = EstimateEngine.defaultState();
//   console.log(EstimateEngine.calcBid(st)); // → { mat:0, ohAmt:0, matOh:0, delAmt:0, insAmt:0, total:0 }

(function() {
  'use strict';

  // ── Helpers ───────────────────────────────────────────────────
  function pct(v) { return parseFloat(v) || 0; }

  function fmt$(n) {
    return '$' + (+(n || 0)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  // ── Default state ─────────────────────────────────────────────
  // Returns a clean empty bid state object.
  // Terms arrays are intentionally empty — the app populates them from the DB.
  function defaultState() {
    return {
      info: {
        id: '', name: '', client: '', address: '', bidDate: '', scope: '',
        architect: '', gc: '', attention: '', shipVia: 'Truck', terms: 'Net 30',
        deliveryDate: '', estimator: 'Evan Ramsey', poNumber: '',
        bidDocs: '', drawingsDated: '', specsDated: '', addendums: '',
        docType: 'Proposal'
      },
      areas: [],
      ohPct: 15, delPct: 5, insPct: 20,
      pricingMode: 'byarea',
      subItems: [],
      altItems: [],
      exclusions: [],
      clarifications: [],
      generalTerms: [],
      warranty: [],
      finishTerms: [],
      hardwareTerms: [],
      fabNote: [],
      sel: { view: 'info', areaId: null, sectionId: null, altIdx: null },
      finishSchedule: null,
      specFindings: [],
      _uid: 1,
    };
  }

  // ── UID generator ─────────────────────────────────────────────
  // Mutates st._uid — pass in the state object.
  function uid(st) {
    return st._uid++;
  }

  // ── Cost calculations ─────────────────────────────────────────
  // All accept plain data objects — no global state dependency.

  function itemTotal(it) {
    // Handle both snake_case (Supabase) and camelCase (V2 iframe) field names
    var cost = it.unit_cost !== undefined ? it.unit_cost : it.unitCost;
    return it.ignore ? 0 : pct(it.qty) * pct(cost);
  }

  function sectionTotal(sec) {
    return sec.ignore ? 0 : (sec.items || []).reduce(function(s, i) { return s + itemTotal(i); }, 0);
  }

  function areaTotal(area) {
    return area.ignore ? 0 : (area.qty || 1) * (area.sections || []).reduce(function(s, sec) { return s + sectionTotal(sec); }, 0);
  }

  function matTotal(areas) {
    return (areas || []).reduce(function(s, a) { return s + areaTotal(a); }, 0);
  }

  // Full bid calculation: mat → OH → del → ins → total
  // Accepts a state object (ST) with { areas, ohPct, delPct, insPct }
  function calcBid(st) {
    var mat    = matTotal(st.areas);
    var ohAmt  = mat * (pct(st.ohPct)  / 100);
    var matOh  = mat + ohAmt;
    var delAmt = matOh * (pct(st.delPct) / 100);
    var insAmt = matOh * (pct(st.insPct) / 100);
    var total  = matOh + delAmt + insAmt;
    return { mat: mat, ohAmt: ohAmt, matOh: matOh, delAmt: delAmt, insAmt: insAmt, total: total };
  }

  // ── Fuzzy matching (ZZTakeoff import) ─────────────────────────
  // Extracted verbatim from V2. Used to match takeoff descriptions against the
  // pricing library. Returns a score 0–1; ≥0.70 = high confidence.

  function wordTokens(s) {
    return (s || '').toLowerCase().split(/\W+/).filter(function(w) { return w.length >= 3; });
  }

  function matchScore(zzDesc, libDesc) {
    var zzW = wordTokens(zzDesc);
    var zzSet = {};
    zzW.forEach(function(w) { zzSet[w] = true; });
    var liW = wordTokens(libDesc);
    if (!zzW.length) return 0;
    var hits = liW.filter(function(w) { return zzSet[w]; }).length;
    return hits / Math.max(zzW.length, liW.length);
  }

  // Finds the best match for `desc` in a library array.
  // library: array of { description, unit_cost, unit, category } (Supabase shape)
  //   OR { desc, cost, uom } (V2 PRICE_LIB shape) — handles both.
  function bestMatch(desc, library) {
    var best = null, bestScore = 0;
    (library || []).forEach(function(it) {
      var libDesc = it.description || it.desc || '';
      var s = matchScore(desc, libDesc);
      if (s > bestScore) { bestScore = s; best = it; }
    });
    return { item: best, score: bestScore };
  }

  // ── Confidence thresholds (matching ZZTakeoff UI in V2) ───────
  var MATCH_HIGH   = 0.70;
  var MATCH_MEDIUM = 0.40;

  function matchConfidence(score) {
    if (score >= MATCH_HIGH)   return 'high';
    if (score >= MATCH_MEDIUM) return 'medium';
    return 'low';
  }

  // ── Public API ────────────────────────────────────────────────
  window.EstimateEngine = {
    defaultState:     defaultState,
    uid:              uid,
    pct:              pct,
    fmt$:             fmt$,
    itemTotal:        itemTotal,
    sectionTotal:     sectionTotal,
    areaTotal:        areaTotal,
    matTotal:         matTotal,
    calcBid:          calcBid,
    wordTokens:       wordTokens,
    matchScore:       matchScore,
    bestMatch:        bestMatch,
    matchConfidence:  matchConfidence,
    MATCH_HIGH:       MATCH_HIGH,
    MATCH_MEDIUM:     MATCH_MEDIUM,
  };

}());
