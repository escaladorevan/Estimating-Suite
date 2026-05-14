# Production Schema Reset Implementation Plan

> Historical plan note: this plan records the completed Supabase reset work from 2026-05-13. For current implementation direction, use `README.md` and `docs/agent-handoff.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mixed prototype Supabase database with a clean production-ready schema for opportunities, estimating, jobs, contacts, files, PM work, and reporting.

**Status on 2026-05-13:** Reset executed against Supabase project `tapnbdorfxfdjmcwifzj`. Old rows were sample data and have been cleared. The production tables, RLS policies, private `project-files` storage bucket, and admin profile for `escalador.evan@gmail.com` are in place. A follow-up hardening migration, `supabase/20260513_harden_private_rls_helpers.sql`, moved role helper functions into `app_private` so they are not exposed through the public API schema.

**Architecture:** Treat the existing Supabase data as disposable sample data. Create one deliberate reset SQL script that drops old prototype tables, creates the canonical rebuild model, enables RLS, adds internal role-aware policies, and prepares private Supabase Storage for project files.

**Tech Stack:** Supabase Postgres, Supabase Auth, Supabase Storage, SQL migrations, Next.js app integration later.

---

### Task 1: Review Reset SQL

**Files:**
- Create: `supabase/rebuild-production-schema.sql`
- Review: `supabase/schema.sql`
- Review: `supabase/rebuild-schema.sql`
- Review: `src/types.ts`

- [x] **Step 1: Confirm old data is disposable**

User has confirmed existing Supabase rows are sample data only.

- [x] **Step 2: Review destructive drop list**

The reset script drops old and partial rebuild tables:

```sql
drop table if exists public.bid_alternates cascade;
drop table if exists public.line_items cascade;
drop table if exists public.sections cascade;
drop table if exists public.areas cascade;
drop table if exists public.documents cascade;
drop table if exists public.activity_log cascade;
drop table if exists public.library_items cascade;
drop table if exists public.bids cascade;
drop table if exists public.change_orders cascade;
drop table if exists public.files cascade;
drop table if exists public.activity_events cascade;
drop table if exists public.estimate_snapshots cascade;
drop table if exists public.historical_results cascade;
drop table if exists public.estimate_items cascade;
drop table if exists public.estimate_sections cascade;
drop table if exists public.estimate_areas cascade;
drop table if exists public.estimate_alternates cascade;
drop table if exists public.estimate_subcontractor_items cascade;
drop table if exists public.estimates cascade;
drop table if exists public.pricing_library_items cascade;
drop table if exists public.purchase_orders cascade;
drop table if exists public.submittals cascade;
drop table if exists public.pm_notes cascade;
drop table if exists public.job_contacts cascade;
drop table if exists public.opportunity_contacts cascade;
drop table if exists public.contacts cascade;
drop table if exists public.companies cascade;
drop table if exists public.jobs cascade;
drop table if exists public.opportunities cascade;
drop table if exists public.app_user_profiles cascade;
```

- [x] **Step 3: Confirm canonical table list**

The reset creates these production tables:

```text
app_user_profiles
companies
contacts
opportunities
opportunity_contacts
estimates
estimate_areas
estimate_sections
estimate_items
estimate_subcontractor_items
estimate_alternates
jobs
job_contacts
change_orders
purchase_orders
submittals
files
pm_notes
activity_events
estimate_snapshots
historical_results
pricing_library_items
```

- [x] **Step 4: Confirm initial RLS posture**

Authenticated users can read shared business records. Mutations are limited to roles in `app_user_profiles`:

```text
admin: full access
estimator: estimating, opportunities, contacts, files, snapshots, reports
pm: jobs, COs, POs, submittals, notes, files, activity, contacts
viewer: read-only
accounting: read-only initially
```

- [x] **Step 5: Run review-only checks locally**

Run:

```powershell
rg -n "drop table|create table|enable row level|create policy|storage.buckets" supabase/rebuild-production-schema.sql
```

Expected: The script includes explicit drops, creates, RLS enablement, policies, and bucket setup.

### Task 2: Apply Reset Manually In Supabase

**Files:**
- Use: `supabase/rebuild-production-schema.sql`

- [x] **Step 1: Open Supabase SQL editor**

Open the `Estimating Suite` project and create a new SQL query.

- [x] **Step 2: Paste the full reset SQL**

Use the contents of `supabase/rebuild-production-schema.sql`.

- [x] **Step 3: Run the SQL once**

Expected: All old prototype tables are dropped, new tables are created, RLS is enabled, policies are created, and a private `project-files` bucket exists.

- [x] **Step 4: Confirm the first admin profile**

The reset script automatically promotes the existing Supabase auth user with email `escalador.evan@gmail.com` to admin:

```sql
insert into public.app_user_profiles (id, full_name, role, active)
select id, coalesce(raw_user_meta_data->>'full_name', email, 'Evan Ramsey'), 'admin', true
from auth.users
where lower(email) = 'escalador.evan@gmail.com'
on conflict (id) do update
set full_name = excluded.full_name,
    role = 'admin',
    active = true,
    updated_at = now();
```

- [x] **Step 5: Re-run Supabase security advisor**

Expected: No public business tables should have RLS disabled.

Actual verification:

```text
public business tables: RLS enabled
storage bucket: project-files exists and is private
admin profiles: 1
sample workflow rows after cleanup: 0
security advisor: only Auth leaked-password protection warning remains
```

### Task 2A: Harden Public Helper Functions

**Files:**
- Create: `supabase/20260513_harden_private_rls_helpers.sql`

- [x] **Step 1: Move helper functions to a private schema**

The reset originally created role helper functions in `public`. The hardening migration creates `app_private`, recreates helpers there, rewires triggers and policies, and drops the exposed public helper functions.

- [x] **Step 2: Verify private helper placement**

Confirmed helper functions now exist only under `app_private`.

- [x] **Step 3: Re-run security advisor**

Confirmed no exposed-schema security-definer helper warnings remain.

### Task 2B: Prove Persistence

- [x] **Step 1: Simulate a signed-in admin**

Used the admin profile and authenticated role context to exercise RLS-backed writes.

- [x] **Step 2: Insert and read a full workflow chain**

Verified inserts and reads across company, contact, opportunity, estimate, estimate area/section/item, job, change order, purchase order, submittal, file metadata, PM note, activity event, estimate snapshot, historical result, and pricing library item.

Fresh smoke-test readback inserted 17 linked records and read back one record from each key module:

```text
opportunity, job, estimate, estimate item, change order, purchase order,
submittal, file metadata, PM note, activity event, estimate snapshot,
historical result, pricing library item
```

- [x] **Step 3: Clean up smoke-test rows**

Final verification shows all smoke-test records removed. Only the admin profile remains.

Post-cleanup counts:

```text
app_user_profiles: 1
all workflow/business smoke-test tables: 0
```

### Task 3: Wire The First Vertical Slice Later

**Files:**
- Modify later: `src/app/page.tsx`
- Use: `src/lib/opportunity-repository.ts`
- Use: `src/lib/estimate-repository.ts`
- Use: `src/lib/job-repository.ts`
- Use: `src/lib/file-repository.ts`

- [ ] **Step 1: Do not wire all tables at once**

Start with one workflow:

```text
Opportunity -> Estimate -> Mark Won/NTP -> Job
```

- [ ] **Step 2: Keep sample data fallback until persistence is proven**

The app can continue rendering sample data while the first Supabase slice is built and tested.

- [ ] **Step 3: Add persistence tests before broad rollout**

Test database mapping, workflow mutations, and security assumptions before replacing every local-state action.
