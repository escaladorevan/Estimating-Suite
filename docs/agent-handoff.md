# Agent Handoff

## Current Direction

Estimating Suite is a production-bound Next.js + Supabase app. The important work now is proving the database spine, not adding more isolated UI mockups.

Before starting production work, read `docs/product-lodestar.md` and `docs/production-app-roadmap.md`, identify the roadmap slice being advanced, and check the completed work against that slice's acceptance criteria.

## Work In These Files

- `src/app/page.tsx` for current app wiring until feature slices are split out.
- `src/components/BidWorkbook.tsx` for the current React workbook.
- `src/lib/opportunity-repository.ts` for opportunity mapping and persistence.
- `src/lib/estimate-repository.ts` for estimate headers and snapshots.
- `src/lib/job-repository.ts` for jobs, change orders, purchase orders, submittals, PM notes, and activity mapping.
- `src/lib/file-repository.ts` for Supabase Storage paths and file metadata.
- `src/lib/status-constants.ts` for status unions shared by TypeScript and SQL checks.
- `supabase/rebuild-production-schema.sql` for the reset schema of record.
- `docs/product-lodestar.md` for product taste, north star, and future integration intent.
- `docs/production-app-roadmap.md` for production sequencing and agent checkpoints.

## Removed Legacy Surface

The old CDN prototype files have been deleted. Do not recreate these as production surfaces:

- `index.html`
- `project/supabase.js`
- `project/*.jsx`
- `project/*.js`

The only remaining `project/` content should be `project/uploads/`, which stores reference workbooks, PDFs, and old standalone tools for import mapping or behavior comparison. If old behavior is useful, port the concept into `src/`.

## Current Verified State

As of the latest guardrail pass, `main` should be verified with:

- `npm.cmd test`
- `npm.cmd run typecheck`
- `npm.cmd run build`

## Recommended Next Step

Finish the remaining persistence surface before new feature polish:

1. Persist PM notes end to end.
2. Persist job file uploads and file metadata through Supabase Storage.
3. Persist activity events for important workflow actions.
4. Add role-matrix tests for RLS expectations.
5. Browser-smoke the opportunity to estimate to job to CO path with Supabase enabled.

In the next handoff or final summary, name the roadmap slice advanced by the work.
