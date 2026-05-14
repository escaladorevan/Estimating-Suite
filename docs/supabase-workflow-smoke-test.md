# Supabase Workflow Smoke Test

Use this checklist after schema changes, repository changes, or any refactor that touches persistence. The goal is to prove that the app is no longer just holding business actions in browser memory.

## Current Automation Status

This workflow is intentionally manual for now because the app uses magic-link auth. The local build can be verified automatically, but the full browser path needs a signed-in admin session until we add a deterministic test login or local Supabase auth fixture.

## Preconditions

- Production reset schema has been applied to the target Supabase project.
- `.env.local` points at the target Supabase URL and anon key.
- The signed-in test user has an `app_user_profiles` row with the `admin` role.
- Supabase Storage has the project file bucket created by the schema.
- Local app is running with `npm run dev`.

## Test Record Convention

Use a unique marker in every field that accepts text:

- Opportunity project: `Smoke Workflow <YYYY-MM-DD HHMM>`
- Client / GC: `Smoke GC`
- Job number: any generated job number is acceptable, but record it in the notes.
- PM note: `Smoke PM reminder <timestamp>`
- File name: `smoke-storage-proof.txt`

## Browser Workflow

1. Sign in as the admin estimator profile.
2. Create a new opportunity from Pipeline or Bid Register.
3. Confirm the opportunity receives a persisted `Q-YY-NNN` Opportunity ID after save.
4. Open the opportunity modal and attach at least one file to a typed slot such as Drawings or Proposal.
5. Open the estimate/workbook from the opportunity.
6. Edit project info, add an area, add a section, add at least one priced line item, and save a snapshot if available.
7. Mark the opportunity won / award it to a job.
8. Confirm a job is created with a PM-style job number such as `G26-002` and that the linked estimate remains reachable.
9. Open Job Detail and update at least one header field: status, install start, install end, PM, or crew size.
10. Add a PM note tied to the job.
11. Add or edit a submittal package and mark it submitted, then approved or needs revision.
12. Add a purchase order with vendor, scope, committed amount, needed-by date, and status.
13. Attach a file to the job-level slot and, if possible, to the PO or submittal record.
14. Start a change order from the job and confirm the workbook opens as a change-order estimate with base contract context.
15. Submit the CO back to the job and verify pending/approved CO totals update the job financial summary according to status.
16. Refresh the browser.
17. Sign out and sign back in if the session is available.
18. Confirm the opportunity, estimate link, job, PM note, submittal, PO, CO, activity entries, and file metadata reload from Supabase.

## Database Spot Checks

Run read-only checks against the Supabase project for the unique smoke marker:

- `opportunities`: one row with the smoke project name and expected status.
- `estimates`: one linked row with the opportunity id, and job id once awarded.
- `jobs`: one row linked back to the opportunity.
- `change_orders`: one row linked to the job after CO submission.
- `pm_notes`: one row with the smoke note text.
- `submittals`: one row linked to the job.
- `purchase_orders`: one row linked to the job.
- `files`: rows for opportunity/job/PO/submittal uploads as applicable, with storage paths.
- `activity_events`: rows for award, CO, file, PO, or submittal actions as applicable.

## Pass Criteria

- Refresh does not erase the smoke workflow.
- Job conversion keeps the opportunity, estimate, and job linked.
- Approved COs change current contract value; draft/submitted/pending COs do not.
- File rows have real storage paths, not just browser `File` objects.
- No console errors appear during the workflow.
- A user without the right role cannot write estimating-only or PM-only records.

## Known Follow-Up Gates

- Add an automated role-matrix test for RLS policies.
- Add repository integration tests that map each table row into the TypeScript domain types.
- Add a browser automation path once auth can use a deterministic local test session.
