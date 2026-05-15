# Production App Roadmap

This roadmap is the working checklist for turning Estimating Suite from a high-fidelity Next/Supabase prototype into a production app. Use it with the product blueprint, not instead of it.

## How To Use This Plan

- Before starting production work, identify which roadmap slice the task advances.
- Do not add isolated UI behavior unless the data model, persistence path, and verification story are clear.
- Check completed work against the acceptance criteria in the relevant slice before committing.
- Update this roadmap when scope, order, or acceptance criteria change.

## Current State

- The active app is the Next.js, React, TypeScript, and Supabase stack.
- The old CDN prototype has been removed; `project/uploads/` remains reference material only.
- The product shape is strong, but major app state still lives in `src/app/page.tsx`.
- Supabase schema and repository helpers exist, but full end-to-end persistence is incomplete.
- The next production work should strengthen the database-backed app spine before more UI polish.

## Production Definition Of Done

- Auth and RLS protect real bid, job, contract, pricing, and file data.
- Opportunities, estimates, jobs, files, COs, POs, submittals, PM notes, activity, contacts, and reports persist through Supabase.
- Refresh never loses saved work.
- UI actions have clear success, failure, loading, and local-only states.
- Core workflows pass automated tests and browser smoke tests.

## Roadmap Slices

### Slice 1: Persistence Spine Hardening

Finish reliable reads and writes for jobs, PM notes, job files, activity events, COs, POs, and submittals. Replace scattered local-only mutations with repository-backed save/load paths.

Acceptance: a signed-in browser refresh preserves job detail data.

### Slice 2: Job Detail Data Boundary

Create one clear job detail load/save path for overview, files, COs, POs, submittals, PM notes, activity, and contacts. Move job detail logic out of `src/app/page.tsx` into focused hooks/modules where practical.

Acceptance: opening a job detail page shows persisted child records from Supabase, not only local sample state.

### Slice 3: Opportunity To Estimate To Job Conversion

Make New ITB, opportunity modal, estimate creation, award/NTP, and job creation one persistent workflow. Preserve `Q-YY-NNN` opportunity IDs and PM job numbers like `G26-042`.

Acceptance: create opportunity, open estimate, award job, refresh, and all links remain intact.

### Slice 4: Workbook Productionization

Persist estimate areas, sections, items, alternates, subcontractor items, snapshots, proposal metadata, and BOM/takeoff data. Keep estimate math centralized so UI, PDFs, dashboards, and snapshots agree.

Acceptance: workbook totals, proposal snapshots, and CO workbook totals survive refresh and match tests.

### Slice 5: Files And Storage

Route all bid, job, and CO file slots through Supabase Storage plus `files` metadata. Support upload, replace, open/download, slot labels, and owner links.

Acceptance: upload a contract, drawing, spec, or proposal file, refresh, and file metadata plus storage path remain available.

### Slice 6: Contacts

Add companies, people, and project contact roles to opportunities and jobs. Use contacts to autofill proposal, job, and CO context.

Acceptance: attach a GC PM, superintendent, or other project contact to a job, refresh, and the contact appears in job detail.

### Slice 7: Calendar, Capacity, And PM Home

Make install calendar and capacity read from persisted jobs. Add role-aware Home surfaces for estimator, PM, and admin.

Acceptance: a PM can see active jobs, installs, missing dates, submittal/CO alerts, and reminders from persisted data.

### Slice 8: Reports And Forecasting

Build reports from persisted records and snapshots. Include backlog, revenue forecast, bid win/loss, GC/client performance, CO exposure, job cost, and margin.

Acceptance: reports distinguish base contract, approved COs, pending COs, final cost, and projected margin.

### Slice 9: Production QA And Operations

Add role-matrix RLS tests, import validation, backup/export paths, empty/error states, and browser smoke coverage.

Acceptance: typecheck, tests, build, and documented smoke tests pass before release.

## Agent Rules

- Work only in the Next/Supabase stack.
- Do not recreate legacy CDN files or browser-global app code.
- Prefer repository helpers and shared domain modules over direct scattered Supabase calls.
- Add or update tests with every production slice.
- Name the roadmap slice advanced by the work in handoff notes, PR descriptions, or final summaries.
- Update this roadmap when the production sequence or acceptance criteria change.
