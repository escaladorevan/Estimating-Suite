# E2E Audit Week Plan (Week of 2026-05-05)

## Objective
Get the integrated Estimating Suite to a testable end-to-end audit state by the end of this week, covering:
1. ITB/Bid creation and tracking
2. Estimator workflow
3. Bid -> Won -> Job conversion
4. Job Detail deep view from pipeline cards
5. Change orders with contract value updates
6. Document attach + retrieval on jobs
7. PDF proposal generation using the same jsPDF-based approach as FS Estimator V2

---

## Scope (In This Week)

### Must complete
- Pipeline card click opens full Job Detail module/screen
- Marking a bid as Won creates/links Job record with carried metadata
- Job Detail supports edit fields comparable to existing dashboard usage
- Change Order creation + approval updates current contract value
- Job documents can be attached and displayed by job
- Estimator has Generate PDF action using jsPDF flow compatible with current FS Estimator V2 approach
- 3-job end-to-end audit script passes (Bidding, Won/Active, Old/Reactivated)

### Explicitly deferred
- Advanced analytics and margin segmentation refinement
- Visual polish beyond usability/readability
- Optional workflow automations (email/send integrations)

---

## Workstreams

## 1) Data model alignment (Estimating Master V4 + Dashboard)
- Inventory required fields from current workbook/dashboard usage
- Map fields into bids/jobs/change_orders/documents entities
- Define required vs optional fields and migration defaults
- Ensure long-tail jobs (4-5 month dormant/reactivated) retain history and retrievability

Deliverable: field-map + schema patch + migration notes

## 2) Pipeline -> Job handoff
- Implement transactional helper for mark-won behavior:
  - Update bid stage to Won
  - Insert/Upsert job record from bid snapshot
  - Write activity log entry
- Handle idempotency when job already exists

Deliverable: deterministic mark-won flow with UI confirmation

## 3) Job Detail module deepening
- Route from pipeline card to full job detail
- Fields:
  - Job number/client/description
  - PM, status, contract value
  - GC/contractor
  - Crew size + install window + notes
- Status chip updates and persisted state

Deliverable: production-usable job detail view similar in depth to existing dashboard behavior

## 4) Change Orders + contract math
- Create CO (description, amount, status)
- Approve CO updates current contract value
- Display original contract + CO rollup + current contract
- Keep immutable CO log

Deliverable: auditable contract trail per job

## 5) Documents by job
- Attach job documents
- List docs in Job Detail and Docs view with tags/type/date
- Preserve linkage for historical revisit use case

Deliverable: per-job document continuity

## 6) PDF generation parity track
- Reuse jsPDF strategy from FS Estimator V2 as baseline toolchain
- Add Generate PDF CTA in estimator flow
- Produce proposal filename convention and stable output
- Match key output structure used by existing workflow

Deliverable: single-click proposal PDF export usable in current sending workflow

---

## Execution sequence (day-by-day)

### Day 1 (Tue)
- Data map freeze + schema deltas
- Gap checklist from current app state

### Day 2 (Wed)
- Implement Pipeline -> Job handoff + routing from card to Job Detail

### Day 3 (Thu)
- Complete Job Detail edit/status module
- Implement CO create/approve and contract rollup

### Day 4 (Fri)
- Document attach/list by job
- Estimator Generate PDF using jsPDF integration path

### Day 5 (Buffer / QA)
- Run 3-project E2E audit script
- Fix blockers
- Capture release notes and unresolved items

---

## Acceptance criteria for this week
- A pipeline item can become a won job without re-entry
- A user can navigate from Kanban card to full Job Detail context
- CO approvals reflect immediately in displayed contract totals
- Job documents persist and are visible when reopening old jobs
- Estimator exports a proposal PDF using jsPDF-based flow
- E2E audit script passes on 3 representative projects

---

## Open dependencies / decisions
- Confirm exact Estimating Master V4 columns to preserve in v1 schema
- Confirm required PDF template fidelity checkpoints versus FS Estimator V2 output
- Confirm final route behavior preference (modal vs dedicated page) for Job Detail

---

## Source references
- Existing project roadmap and phase mapping
- Existing FS Estimator V2 jsPDF implementation in upload assets
