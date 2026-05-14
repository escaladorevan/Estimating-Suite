# Agent Handoff

## Current Direction

Estimating Suite is moving from a high-fidelity prototype into a production Next.js + Supabase app. The important work now is proving the database spine, not adding more isolated UI mockups or patching the old CDN prototype.

## Work In These Files

- `src/app/page.tsx` for current app wiring until feature slices are split out.
- `src/components/BidWorkbook.tsx` for the current React workbook.
- `src/lib/opportunity-repository.ts` for opportunity mapping and persistence.
- `src/lib/estimate-repository.ts` for estimate headers and snapshots.
- `src/lib/job-repository.ts` for jobs, change orders, purchase orders, submittals, PM notes, and activity mapping.
- `src/lib/file-repository.ts` for Supabase Storage paths and file metadata.
- `src/lib/status-constants.ts` for status unions shared by TypeScript and SQL checks.
- `supabase/rebuild-production-schema.sql` for the reset schema of record.

## Do Not Work Here Unless Explicitly Asked

- `index.html`
- `project/supabase.js`
- `project/*.jsx`
- `project/*.js`

Those files are legacy reference material. They can help explain old behavior, but production changes should be ported into `src/`.

## Current Verified State

As of the guardrail pass, `main` had passing:

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
