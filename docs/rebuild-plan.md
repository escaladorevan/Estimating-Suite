# Rebuild Plan — Three Tools, One App

**Date:** 2026-07-06
**Decision:** Fresh rebuild. The spec is not a product vision — it is the three tools Evan already uses daily: the **Estimating Master V4** workbook, **FS Estimator v2.1**, and the **FS Job Dashboard**. The app is those three, connected, and nothing else.

Full functional specs extracted from the actual tools live alongside this plan (`docs/spec-estimator.md`, `docs/spec-job-dashboard.md`). The Master V4 sheets are the data model of record for tracking.

## What V1 is

Four surfaces, one database:

1. **Bid Tracker** — the `2026 Bid Tracker` sheet as a live table. Its 23 columns are the opportunity model (Job ID, Month, Client, Project, Due Date, Drawing Stage, Bid Type, Sent, Method, Status, Win?, Job Type, Est. Value, doc links, Notes, Feedback, NTP, Final Cost…). New ITBs are created here. Row click opens the record; "Open Estimate" and "Award to Job" live on it.
2. **Estimator** — FS Estimator v2.1 rebuilt: project info block, Area → Section → Item grid, pricing library panel, subcontractor items, alternates, the seven terms collections with their exact default texts, ZZTakeoff import (Excel *and* CSV) with the preview/checkbox modal, and the three pricing modes.
3. **Proposal PDF** — matches the v2.1 output format exactly (verified against the Archies and Windermere PDFs): logo + company block, To/info table, gray column band, mode-specific line rows, subs, D&I line, Base Bid, alternates, exclusions, page-2 terms sections, signature block.
4. **Jobs** — the FS Job Dashboard: stat cards + "Installing ≤21 days" + "In Progress" lists, the jobs table (Job #, Client, Project, PM, Status, Value with `+N CO` pill, Install Window, Crew, Docs), the crew-capacity install calendar, and the **one-scroll job detail**: 8-field overview grid → notes callout → status buttons → six document slots (Drawings, Specs, Schedule, PO/Contract, Proposal, Other) → change orders with Original → Current math and inline add/approve → activity log with quick-post. This is exactly the PM view: planset, contract/PO, install date, contract value, CO list.

**Connecting them (the double-entry cuts that come free):**
- Bid Tracker row → "Open Estimate" creates/opens the estimate pre-filled with client/project/id.
- Finished proposal PDF auto-attaches to the record's Proposal slot.
- "Award to Job" creates the job from the tracker row + estimate value; files carry to the job's slots.
- "Send to PM" (already built this session — ported) emails the PM links to the slots.

Anything beyond this — pipeline kanban, analytics, service tickets, capacity readouts, submittal workflows, PO tracking, contact directory as a surface — **is not in V1.**

## Schema (redesigned, lean)

~9 tables instead of 22:

| Table | Source of truth |
|---|---|
| `opportunities` | 2026 Bid Tracker columns, 1:1 |
| `estimates` | **One JSONB `document` column** holding the whole estimator state (the `.fse` file format: info, areas tree, pricing params, subs, alternates, terms) + generated columns for id/name/total. Save = one atomic write — eliminates the delete-then-insert line-item fragility entirely. |
| `jobs` | Current Jobs sheet columns (Job #, PM, Client, Project, Contract, Bid Ref, Fab/Install/Invoice Status, Install window, Crew, Notes) |
| `change_orders` | Change Order sheet columns (CO #, Job, Description, Submitted, Amount, Status submitted/approved, Approved Date, Notes) |
| `files` | six fixed slots per owner (opportunity or job), Supabase Storage |
| `activity_events` | job activity log |
| `pricing_library_items` | the 356-row Casework Pricing Library (Category, Description, Unit Cost, UOM) |
| `contacts` | the estimator's address book (Company, Attention, Address, Phone, Email) |
| `app_user_profiles` | roles: admin / estimator / pm |

Existing test data is wiped; the schema of record is replaced. Real data arrives via the (already fixed) Master V4 import — now covering the Current Jobs and Change Order sheets too, so day one has your real backlog.

## Pricing math (spec of record, from v2.1)

```
mat      = Σ areas: area.qty × Σ sections: Σ items: qty × unitCost   (ignore flags zero out)
matOh    = mat × (1 + ohPct/100)                                      (default OH 15%)
delAmt   = matOh × delPct/100        insAmt = matOh × insPct/100      (defaults 5% / 20%)
baseBid  = matOh + delAmt + insAmt
subs     = Σ cost × (1 + markupPct/100)                               (markup only, no OH/D&I)
printed Base Bid = baseBid + subs
```
Alternates never enter totals. `noPrint` hides from PDF only; `ignore` removes from math.

Deliberate fixes over v2.1 (bugs found in the source): exclusions paginate instead of silently truncating; on-screen totals include subs so screen matches PDF; real page counts on page 2; nested takeoff groups don't flatten into phantom areas.

## Structural guardrails (from day one, non-negotiable)

- ESLint gate in the first commit: 400-line file cap (error), 200-line function warn. The cap is a build-blocker this time.
- One directory per surface (`src/tracker`, `src/estimator`, `src/jobs`), shared `src/lib` for math/PDF/repositories, one hook per domain. `page.tsx` composes routes and nothing else.
- The estimator document model is pure and unit-tested (math, takeoff mapping, PDF layout data) before any UI exists.

## Build order (each phase gated on tests + a browser screenshot)

1. **Scaffold + schema** — new branch, fresh `src/`, ESLint gate, new schema applied, auth gate + profiles, repositories.
2. **Bid Tracker** — table + record modal + Master V4 import (all three sheets).
3. **Estimator engine** — document model, pricing math, takeoff import mapping, pricing library: all pure, all unit-tested against the real Archies CSV and known totals.
4. **Estimator UI** — tree grid, library panel, terms editors, info form.
5. **Proposal PDF** — format-matched; verified side-by-side against the Archies PDF.
6. **Jobs dashboard** — cards, table, calendar, one-scroll job detail with COs/slots/activity.
7. **Connect** — Open Estimate, proposal auto-attach, Award to Job, Send to PM (ported).
8. **Deploy** — Vercel + import real workbook + PM accounts.

## Deferred (explicitly)
Finish-schedule/spec AI ingestion (exists in v2.1 — port later), revision history for estimates, kanban/analytics/service, role-based dashboards, transactional email.
