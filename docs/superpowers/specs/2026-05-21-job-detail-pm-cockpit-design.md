# Job Detail PM Cockpit Design

## Purpose

Replace the current Job Detail modal with a full-page PM cockpit. The page should help a commercial casework PM answer the operational questions that matter without digging through a long modal:

- What is the job and contract value?
- When does it install?
- Are shop drawings and submittals handled?
- Are materials, subcontractors, and POs handled?
- Are there open or approved change orders?
- Are core documents attached?
- What needs action next?

This advances the production roadmap around the Job Detail data boundary while also moving the PM experience toward the product lodestar: dense, beautiful, fast, and useful for someone managing many projects at once.

## Route And Navigation

Job Detail becomes its own app route/view:

```text
#job/G26-042
```

The route should resolve by job number first because PMs think in job numbers. Internally, the app should still use the persisted job UUID whenever it is available. If a job number lookup fails, the route may fall back to resolving by UUID in a later hardening pass.

Entry points that should open this route:

- Jobs list row click.
- Calendar job click.
- PM note/job reference click.
- Future files, CO, PO, and alert links.

The page should show a breadcrumb:

```text
Jobs / G26-042 / Project Name
```

When entering a job route, the main app sidebar should auto-collapse to preserve workspace width. It should remain visible and usable. When leaving the job route, the app should restore the user's prior sidebar collapsed/expanded state.

## Layout

### Sticky Job Command Header

The job page starts with a sticky command header. It should be full-width, compact, and mature, closer to a professional PM suite than a modal.

Show:

- Job number.
- Project name.
- GC/client.
- PM.
- Current contract value.
- Install start/end.
- Backlog/status.
- High-signal quick actions:
  - New CO.
  - New PO.
  - Add File.
  - Add Note.
  - Edit Job.

The header should avoid side scrolling. Long names should truncate cleanly with tooltips or secondary text, not push other data off page.

### PM Alert Strip

Below the command header, show compact alerts/actions for missing or urgent items:

- Missing contract.
- Missing drawings/specs/schedule.
- Shop drawings due or not approved.
- Draft PO or missing material/subcontract review.
- Pending COs.
- Missing install dates.
- Open PM notes.

Each alert should link to the relevant job section.

### Dewey-Style Job Tabs

Use top card tabs, not a side panel, for job-specific navigation. The main app sidebar is collapsed; job navigation lives inside the page.

Initial tab set:

```text
00 Overview
10 Schedule
20 Submittals
30 COs
40 POs
50 Files
60 Notes
70 Activity
```

Later extension:

```text
80 Job Cost
```

The numbering is intentional. It creates muscle memory, allows future insertion, and makes the job page feel organized rather than crowded.

## Section Behavior

### 00 Overview

Default landing section. It should show a compact operating summary:

- Install status and date window.
- Submittal status.
- PO/material status.
- CO summary.
- File completeness.
- PM notes/reminders.
- Current contract and margin indicators when available.

This section should be usable without scrolling on a normal desktop monitor as much as practical.

### 10 Schedule

Initial implementation can be modest:

- Install start.
- Install end.
- Crew size.
- Fabrication start/expected completion.
- Status fields.

Future implementation will connect this to calendar events, manual PM events, site visits, service calls, and Outlook overlay/sync.

### 20 Submittals

Show shop drawings and other packages as modern package cards:

- Package name/type.
- Due date.
- Submitted checkbox/date.
- Approved / needs revision state.
- Resubmitted date when needed.
- Linked package files.

The UI should avoid the current clunky stacked feel.

### 30 COs

Change orders should be individually visible and actionable:

- Open each CO detail.
- Revise/amend where status allows.
- Approve, reject, or void individual COs.
- Show pending, approved, rejected, and voided totals.
- Approved COs update current contract value; submitted/pending/rejected/void do not.

Creating a CO should continue routing through the Bid Workbook because pricing belongs there.

### 40 POs

POs should support quartz/stone subcontracting and other vendor commitments:

- PO number.
- Vendor/subcontractor.
- Scope.
- Status.
- Committed amount.
- Needed by/promised date.
- Linked files.

Future slice: generate a PO PDF/document, similar in spirit to proposal generation but with PO-specific fields and terms.

### 50 Files

Show job-level and linked child files:

- Contract.
- Drawings.
- Specs.
- Schedule.
- Proposal.
- Submittals.
- CO docs.
- PO/subcontract docs.
- Photos/invoices/misc.

Files should use the current private Supabase Storage plus signed URL approach. Uploads should produce activity events.

### 60 Notes

PM notes should act like a digital version of the desk sticky-note system:

- Add note.
- Edit note.
- Delete note.
- Mark open/waiting/done.
- Link to job automatically when created inside this page.

Future slice: manual calendar events can originate from notes when useful.

### 70 Activity

Chronological job log:

- Job created from opportunity.
- Files attached.
- CO submitted/approved/rejected/voided.
- PO created/updated.
- Submittals changed.
- Notes completed.
- Header/status changes where useful.

Activity should be readable, not noisy. Important financial and document actions matter more than every field edit.

## Data Boundary

This slice must not be only a visual refactor. It should strengthen the production data boundary:

- Job detail view loads from `getJobDetailData` and persisted job detail refresh paths.
- Edits use existing repository-backed persistence helpers where available.
- Child records remain owned by the persisted job UUID in Supabase.
- Local-only states should still show clear messaging when the user is not signed in or an owner ID is not persisted.
- The old Job Detail modal should be removed or reduced to small task modals only.

Existing task modals may remain for:

- Add/edit PO.
- Add/edit submittal package.
- Add/edit PM note.
- Upload file.
- Edit job header/status.
- CO detail review/action.

## Out Of Scope For This Slice

- Full Outlook calendar integration.
- Full manual calendar event creation.
- PO PDF generation.
- Full Job Cost tab.
- Major redesign of the workbook.
- Rewriting the Supabase schema.

These should be planned as later slices once the full-page job cockpit is stable.

## Acceptance Criteria

- Clicking a job from Jobs, Calendar, or PM surfaces opens `#job/G26-042`.
- Main app sidebar auto-collapses on the job route.
- The old large Job Detail modal no longer opens as the primary job experience.
- Job page shows sticky command header, PM alert strip, and Dewey-style tabs.
- Install dates, crew, status, files, notes, COs, POs, and submittals remain reachable without side scrolling.
- Existing persisted job detail data appears after refresh.
- Editing install dates/crew/status persists.
- Adding a PM note persists and reloads.
- Adding a job file persists metadata/storage and reloads.
- Updating a CO status persists and reloads.
- Creating/editing a PO persists and reloads.
- Automated tests cover route resolution and job detail boundary behavior.
- Browser smoke verifies job route load, tab navigation, and no runtime overlay.

## Implementation Notes

- Prefer extracting focused components from `src/app/page.tsx` rather than growing it further.
- Keep data mutations in shared helper modules or persistence hooks.
- Use the existing `job-detail-data.ts`, `job-detail-tabs.ts`, and `useJobsPersistence.ts` boundaries as starting points.
- Keep typography compact and information-dense.
- Avoid nested cards. Use section bands, grids, package cards, and tables.
- Preserve the current sidebar collapse affordance, but make job route auto-collapse behavior explicit and reversible.

