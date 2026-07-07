# Functional Specification — FS Estimator v2.1

Source: `project/uploads/FS_Estimator_v2_1.html` (single-file app; jsPDF + SheetJS). Verified against real outputs `NOR_Archies_Proposal_Update(1)_4.26.pdf` and `NOR_NW_Windermere_IFC_Proposal4.26.pdf`, the ZZTakeoff sample CSV, and `Casework_Pricing_Library.xlsx`. Extracted 2026-07-06 as the spec of record for the Estimator surface and proposal PDF of the rebuild.

---

## 1. Data model (one document per estimate)

### 1.1 `info` (project header)
`id` (Project Id, e.g. "Q-121-4-26"), `name`, `client`, `address` (split on commas into PDF lines), `bidDate`, `scope` (internal, never printed), `architect`, `gc` (collected, not printed), `attention`, `shipVia` ('Truck'), `terms` ('Net 30'), `deliveryDate`, `estimator` ('Evan Ramsey'), `poNumber` (prints "n/a" if empty), `bidDocs`, `drawingsDated`, `specsDated`, `addendums`, `docType` ('Proposal' | Quote | Bid | Budget | Change Order).

### 1.2 Estimate tree
- **Area** `{id, name, qty:1, ignore:false, noPrint:false, sections:[]}` — `qty` is a room/floor multiplier for the whole area.
- **Section** `{id, name, ignore, noPrint, items:[]}` (import creates a single section named `'Casework'`).
- **Item** `{id, desc, qty:1, unit:'ea.', unitCost:0, drawingRef:'', ignore, noPrint}`.

### 1.3 Pricing params
`ohPct: 15`, `delPct: 5`, `insPct: 20`, `pricingMode: 'byarea' | 'lumpsum' | 'itemized'`.

### 1.4 Subcontractor items
`{desc, cost, markupPct:10}` — price = `cost × (1 + markupPct/100)`; always "1 lump sum" on the PDF. **Markup only — no OH/delivery/install applied.**

### 1.5 Alternates
`{desc, qty:1, unit:'lump sum', price}` — total = qty × price. **Never added to the base bid.**

### 1.6 Terms collections
Arrays of `{text, active:true, sub:boolean}` (sub = indented child line): `exclusions` (15 defaults), `clarifications` (3), `generalTerms` (6), `warranty` (4), `finishTerms` (4), `hardwareTerms` (6), `fabNote` (3). Default texts live in the source HTML lines 685–739 and are reproduced verbatim on the real PDFs' page 2. Each supports toggle/edit/delete/add/All On/All Off/Reset.

### 1.7 Contacts (address book)
`{company (required), attention, address, phone, email}` — picking one fills `info.client/attention/address`.

## 2. Takeoff import (ZZTakeoff export)

Columns: `Name, Measurement 1, Units 1, Qty, Units, SKU, Description, Cost Each, Cost Total, Markup %, Markup Each, Markup Total, Price Each, Price Total, Created By, Created At, Updated By, Updated At, Layer`. Hierarchy by leading spaces in `Name` (2 per level).

- **Area/group row** (no indent): `Cost Each` empty, rolled-up totals.
- **Item row** (2-space): `Measurement 1` + `Units 1` (FT/EA/LF), `Cost Each` set, `Units` empty → *skip; its 4-space child carries the real qty/unit.*
- **Pricing child row** (4-space): `Measurement 1`/`Units 1` empty, `Qty` + `Units` + `Cost Each` set → item `{qty: Qty, unit: Units, unitCost: Cost Each}`.
- **Simple row**: `Units 1` and `Units` both set and equal → item `{qty: Measurement 1 || Qty, unit: Units 1, unitCost: Cost Each}`.

Header detection: scan first rows for `name|group` + `/measurement.?1/`; Format A (priced) when a Cost Each column exists; Format B (measured-only) otherwise — items import with `unitCost: 0` for hand/library pricing. Rows with no cost start a new Area (nested groups flatten — rebuild should preserve nesting or at least not create phantom areas from unpriced condition rows). Areas with zero items discarded.

**Preview modal:** area/item checkboxes with computed totals; import is **additive** (appends areas, single 'Casework' section each). Imported unit costs come straight from the export; library fuzzy-match was dead code in v2.1 (optional assist in rebuild, never altering imported costs by default).

## 3. Pricing math (exact)

```
itemTotal   = ignore ? 0 : qty × unitCost
sectionTotal= ignore ? 0 : Σ itemTotal          // noPrint does NOT affect math
areaTotal   = ignore ? 0 : (area.qty||1) × Σ sectionTotal
mat         = Σ areaTotal
ohAmt  = mat × ohPct/100          matOh = mat + ohAmt
delAmt = matOh × delPct/100       insAmt = matOh × insPct/100     // on material+OH
baseBid = matOh + delAmt + insAmt
subTotal = Σ cost × (1 + markupPct/100)
printed Base Bid = baseBid + subTotal
ohFactor = 1 + ohPct/100          // used to gross up printed line prices
```
Money display: whole dollars (`toLocaleString`, 0 fraction digits), rounding at display time.

## 4. Pricing modes (print-only differences; totals identical)

| Mode | Line rows on page 1 |
|---|---|
| `lumpsum` | One row: project name (or "Base Scope of Work"), Qty 1, "lump sum", Price = matOh |
| `byarea` (default) | One bold row per area (skip noPrint): area name, Qty = area.qty, Unit = qty>1 ? "rooms" : "lump sum", Price = areaTotal × ohFactor |
| `itemized` | Per area: bold area name row; each item (skip noPrint): indented desc, drawingRef, qty, unit, Price = itemTotal × ohFactor; italic "\<area\> Subtotal" row = areaTotal × ohFactor |

After mode rows (all modes): sub items → thin rule → **Delivery & Installation** row (`1 / job / delAmt+insAmt`; label collapses if only one pct > 0; omitted if 0) → heavy rule → **Base Bid** row (bold, `1 / $ / baseBid + subTotal`).

## 5. Pricing library

356 items `{cat, desc, cost, uom}` (uom: ea., lin. ft, sq. ft., hr., set, pair); 42 categories `"<Group> - <Subgroup>"`. Mirrors `Casework_Pricing_Library.xlsx` sheet "Item Library" (`Category | Item Description | Unit Cost | Unit of Measure`, 355 rows). Runtime: search + category filter panel; click appends `{desc, qty:1, unit:uom, unitCost:cost}` to the target section; CRUD editor with reset-to-defaults.

## 6. Proposal PDF (format of record)

Letter portrait, mm units, margins LM=19 RM=192 BM=275. Columns: Description=19, Drawing Ref=115, Qty=143(R), Unit=154, Price=192(R). Body 8.5pt Helvetica (7.5pt items in itemized). Filename `<Client-slug>_<Name-slug>_<M.DD>.pdf`.

**Page 1:** logo top-left (56mm) · company block top-right ("Form and Structure, Inc. / 10708 NE 2nd Ave / Portland, OR 97211 / Tel: (503) 289-9204 / CCB# 52938") · `docType` 16pt bold + Date right · heavy rule · **To:** block (client bold, address lines) · thin rule · **info table** 2×4 (Attention/Project Id, Project Desc./Ship Via, Terms/P.O. Number, Delivery Date/Estimator) · heavy rule · gray column-header band (Description | Drawing Ref | Qty | Unit | Price) · **PROJECT:** block (name uppercased; Bid Documents / Architect / Drawings Dated / Specifications Dated / Addendums if present) · mode-specific line rows (§4) · subs · D&I · **Base Bid** · ALTERNATES (if any: `Alternate No. N: <desc>` / qty / unit / total) · **Exclusions / Clarifications** heading + EXCLUSIONS list (active lines, sub-items indented). Continuation pages get a header ("Form and Structure, Inc. <docType>" / id-name-date / "Continued…" / client / rule).

**Page 2** (always fresh page): header + "Page No. N of N Pages" (fix: real count, not hardcoded "2 of 2") · sections in order: CLARIFICATIONS: (always) · GENERAL TERMS: · WARRANTY AND FABRICATION: · FINISH MATERIALS: · HARDWARE ASSUMPTIONS: · FABRICATION NOTE: · footer italic "Please Note: Prices valid for 30 days." + 64mm signature rule + "Authorized Signature".

## 7. Rebuild-critical fixes (bugs in v2.1 to fix deliberately)

1. Exclusions overflowing page 1 are silently dropped → must paginate.
2. Library fuzzy-match on import is dead code (references undefined var).
3. Sub items print in Base Bid but are excluded from on-screen totals → screen must match PDF.
4. Sub items get markup only — no OH/D&I (correct; keep, but document).
5. Delivery/Install percentages compound on material+overhead, not raw material (keep; it's the real math).
6. `noPrint` hides from PDF but cost still prints inside Base Bid (keep; only `ignore` removes cost).
7. "Page No. 2 of 2 Pages" hardcoded → real page numbers.
8. ZZ import flattens nested groups into sibling areas and can create phantom areas from unpriced rows → handle deliberately.

## 8. Workflow features to preserve
Autosave (45s in source → DB-backed autosave in rebuild), undo stack (40 snapshots) for structural edits, Enter/Tab grid navigation appending rows, drag-reorder items within/between sections, keyboard Ctrl+S/N/Z. Deferred: AI finish-schedule/spec ingestion (exists in v2.1; port post-V1), explicit revision history.
