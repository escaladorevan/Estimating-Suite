# V1 Gameplan — One Lifecycle, No Double Entry

**Date:** 2026-07-06
**Goal:** Get the first live version across the finish line. One record per project, from ITB to PM handoff, entered once.

## North star

> From ITB → bid → award → handoff, every fact about a project is entered **once** and carried forward automatically. Pricing stays in FS Estimator V2 for V1; this app owns the lifecycle record, the files, and the PM handoff.

The measure of done: Evan receives an ITB, and without re-typing anything, the same record becomes a tracked bid, an awarded job, and a PM handoff email with the proposal, planset, and specs attached.

## Scope decisions (locked)

| Decision | Choice |
|---|---|
| Proposal source | **Keep FS Estimator V2.** Price there, attach the finished proposal PDF to the opportunity's proposal slot. The Bid Workbook stays in the app but is not on the critical path. |
| PM handoff | **Both**: files live on the job record, and awarding triggers a notification email to the PM with links. |
| V1 cuts | **Service** and **Analytics** views hidden from nav (code stays; cheap to restore). Calendar, Submittals, and POs stay. |
| Starting data | **Import active pipeline/backlog** from `Estimating_Master_v4.xlsx` so day one has real work in it. |

## The V1 lifecycle path (what must work end to end)

1. **ITB intake** — Create opportunity: client/GC, project, due date. Attach ITB documents (planset, specs) to typed file slots. → Supabase.
2. **Bid** — Track status through Pipeline (Lead/ITB → Pricing → Review/Send → Submitted). Price in Estimator V2. Attach the finished proposal PDF. Record bid value + sent date.
3. **Award** — Convert to job in the opportunity modal: pick PM, job number, contract value, NTP date. Files and contacts carry over automatically (`buildAwardedOpportunityJob` already does this).
4. **Handoff** — "Send to PM" on the job: opens a pre-filled email to the PM with job facts and signed links to the proposal, planset, and specs. Logs an activity event.
5. **Track** — Job cockpit: status, install dates, COs, submittals, POs, notes, files.

## Work plan

### Phase 1 — Verify the spine (highest risk first)
Run the full lifecycle against the real Supabase project (`tapnbdorfxfdjmcwifzj`) using `docs/supabase-workflow-smoke-test.md`, trimmed to the V1 path. Known verification targets:
- File upload on opportunity → persists with real storage path
- Award conversion → job row, carried-over **file rows** persist (the local `job-file-*` ids must be replaced by real rows), estimate link survives
- Refresh + re-login → everything reloads
- Fix whatever breaks. Nothing else proceeds until this passes.

### Phase 2 — Build "Send to PM" handoff (the one new feature)
- Button on the job cockpit: **Send handoff to PM**.
- Generates long-expiry signed URLs for the proposal / planset / specs slots.
- Opens a pre-filled `mailto:` draft in Evan's real mail client (recipient = PM, subject = job number + project, body = job facts + links). Zero infrastructure, and the sent mail lives in the normal Sent folder.
- Writes an `activity_events` row: "Handoff sent to <PM> — proposal, drawings, specs."
- *Post-V1 upgrade path:* real transactional email (e.g. Resend via Supabase Edge Function) if mailto proves clumsy.

### Phase 3 — Cuts and import
- Hide Service + Analytics from the nav (leave routes/components in place).
- Verify the existing Master V4 import (`importMasterWorkbook` / `mapEstimatingMasterRow`) against the real workbook in `project/uploads/`; extend so active/awarded rows create jobs, not just opportunities.
- Import Evan's real active pipeline + backlog.

### Phase 4 — Go live
- Deploy to Vercel (default choice for Next.js — veto if you have other hosting plans), env vars, production schema applied.
- Password sign-in confirmed for Evan; Supabase accounts for each PM (viewer/pm role).
- Live dry run: one real ITB through the full path, one real handoff email to a PM.

## Explicitly deferred (post-V1)
- Bid Workbook as the proposal source (replacing Estimator V2)
- Service view, Analytics view
- Real transactional email for handoff
- Remaining architecture cleanup (`page.tsx` is 3,398 lines; decompose behind a lint gate as a maintenance track, never blocking the release)
- Lodestar Milestone E items (PM dashboard install lists, contract-delta visual, etc.)

## Definition of done for V1
- [ ] Full lifecycle smoke test passes against production Supabase
- [ ] "Send to PM" produces a correct email with working links
- [ ] Service + Analytics hidden
- [ ] Real pipeline/backlog imported
- [ ] Deployed and reachable by Evan + PMs
- [ ] One real project run through the path end to end
