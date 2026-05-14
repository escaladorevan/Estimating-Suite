# Persistence Smoke Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make persisted jobs remain the canonical owner for PM notes, linked records, file slots, and CO smoke paths after refresh.

**Architecture:** Add a small pure reconciliation helper for local job ids versus persisted Supabase UUIDs, then call it from job loading and job header saves. Keep Supabase writes in existing repository helpers. Fix hash routing by applying hash-derived views only after mount.

**Tech Stack:** Next.js, React, TypeScript, Vitest, Supabase client helpers.

---

### Task 1: Reconcile Local And Persisted Job Identity

**Files:**
- Create: `src/lib/job-persistence-reconciliation.ts`
- Modify: `src/lib/estimating-suite.test.ts`

- [ ] Write a failing test proving a local `job-g061` and persisted UUID `G26-061` collapse to the persisted job.
- [ ] Include PM notes, selected job id, detail job id, estimate `jobId`, and child job references in the test.
- [ ] Implement a pure helper that returns reconciled jobs, notes, estimates, selected id, detail id, and the local-to-persisted id map.
- [ ] Run the targeted Vitest test and verify it passes.

### Task 2: Wire Reconciliation Into Job Persistence

**Files:**
- Modify: `src/hooks/useJobsPersistence.ts`
- Modify: `src/app/page.tsx`

- [ ] Call the reconciliation helper from `loadPersistedJobs`.
- [ ] Call the same helper after `persistJobHeader` saves a forced-created job.
- [ ] Resolve PM note creation through persisted job number matches before calling `persistPMNote`.
- [ ] Improve local-id PM note failure messages so they include the blocked job number/id.

### Task 3: Fix Hash Route Hydration

**Files:**
- Modify: `src/app/page.tsx`

- [ ] Initialize the current view to `dashboard` without reading `window`.
- [ ] Apply `window.location.hash` inside the existing mount effect and hashchange handler.
- [ ] Verify loading `/#jobs`, `/#dashboard`, and `/#estimator` has no hydration mismatch warning.

### Task 4: Verify

**Commands:**
- `npm.cmd run typecheck`
- `npm.cmd test`
- `npm.cmd run build`

**Manual smoke notes:**
- Rerun signed-in PM note creation on `G26-061`.
- Upload a tiny file to the job `contract` slot and confirm metadata/storage object survives refresh.
- Add one priced CO line item before submit and confirm submitted amount is nonzero, pending CO appears, and current contract changes only after approval.
