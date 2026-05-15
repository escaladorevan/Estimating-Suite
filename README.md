# Estimating Suite

Estimating Suite is the Form & Structure operating system for estimating, proposals, bid tracking, job management, change orders, files, service work, and historical margin analysis.

The active app is the **Next.js + React + TypeScript + Supabase** stack. Production work belongs in `src/`, `supabase/`, `public/data/`, and `docs/`.

## Important Guardrail

The old CDN prototype has been removed. Do not recreate or edit production behavior in `index.html`, browser-global scripts, or `project/*.jsx` / `project/*.js` files.

The only remaining `project/` content should be reference uploads under `project/uploads/`, such as source workbooks, PDFs, and old standalone HTML tools used for comparison or import mapping.

## What This App Is For

- Track long-range opportunities with `Q-YY-NNN` opportunity IDs.
- Keep active pursuit work in Pipeline without crowding the long-term Bid Register.
- Build proposals, quotes, budgets, service quotes, and change orders in the Bid Workbook.
- Convert won opportunities into jobs with PM/job-number nomenclature like `G26-042`.
- Manage job execution: status, install dates, shop drawings, submittals, files, purchase orders, change orders, PM notes, and activity.
- Store bid/job files in Supabase Storage.
- Preserve historical values for forecasting, backlog, win/loss, margin, and job-cost analysis.

## Canonical Code Paths

- App shell and feature UI: `src/app/page.tsx`
- Bid workbook UI: `src/components/BidWorkbook.tsx`
- Shared domain types: `src/types.ts`
- Shared status contracts: `src/lib/status-constants.ts`
- Opportunity persistence: `src/lib/opportunity-repository.ts`
- Estimate persistence: `src/lib/estimate-repository.ts`
- Job, CO, PO, submittal persistence: `src/lib/job-repository.ts`
- File metadata/storage helpers: `src/lib/file-repository.ts`
- Production database reset: `supabase/rebuild-production-schema.sql`
- Product blueprint: `docs/product-blueprint-v1.md`
- Agent handoff guardrails: `docs/agent-handoff.md`

## Supabase Schema

For a clean production reset, run:

```text
supabase/rebuild-production-schema.sql
```

That is the schema of record. It includes the production tables, storage bucket policies, role helpers, RLS policies, PM/job workflow tables, purchase orders, submittals, files, activity, estimate snapshots, and pricing library structure.

The older files `supabase/schema.sql` and `supabase/rebuild-schema.sql` are deprecated prototype schemas. Do not use them for production resets.

## Local Setup

```bash
npm install
npm run dev
```

On Windows PowerShell, if scripts are blocked, use:

```powershell
npm.cmd run dev
```

Optional local Supabase environment:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Without those variables the app runs as a local prototype. With them, repository helpers can read and write Supabase data subject to Auth/RLS.

## Verification

Run these before committing:

```bash
npm test
npm run typecheck
npm run build
```

On Windows PowerShell, use the `.cmd` shim if needed:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

## Near-Term Production Focus

1. Keep all new work in the Next/Supabase stack.
2. Finish end-to-end persistence for job detail data: files, PM notes, activity events, COs, POs, and submittals.
3. Split the large client page into feature slices once the current persistence spine is proven.
4. Add RLS role-matrix tests for admin, estimator, PM, viewer, and accounting.
5. Expand browser smoke tests around opportunity to estimate to job to CO workflows.
