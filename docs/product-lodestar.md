# Product Lodestar

Estimating Suite should not become generic construction management software. It should become the commercial memory and decision engine for a commercial casework subcontractor: a calm, dense, beautiful operating system that helps estimators and PMs see what matters, act quickly, protect margin, and learn from history.

Use this document when making product, UX, automation, and integration decisions. The product blueprint explains the modules. The production roadmap explains the build sequence. This lodestar explains the kind of product we are trying to create.

## North Star

- The estimate is not a dead document. It seeds the proposal, job, change orders, purchasing, margin story, and future pricing decisions.
- PMs are busy. The app should reduce digging, memory burden, and computer chores.
- The app should surface the next useful action rather than force users to hunt through tabs.
- Historical data should become leverage: what was bid, what was won, what changed, what made money, what hurt, and what should happen differently next time.
- The experience should feel modern, professional, and specific to casework fabrication and install, not like Procore-lite or generic SaaS.

## Signature Surfaces

### Estimator Command Surface

The workbook should feel like a professional instrument: a Vista/Sage/ProjectPak/Excel/Notion hybrid. It should be dense, keyboard-friendly, fast, and trustworthy.

It should support pricing library insertion, assemblies, alternates, phases, IG/NP controls, ZZTakeoff import, BOM/takeoff summaries, proposal metadata, PDF output, and large change orders using the same pricing brain as base bids.

### PM Morning Board

The PM surface should act like the digital version of the sticky notes beside the keyboard. It should immediately show what needs attention today:

- call or follow-up reminders
- missing contracts, drawings, shops, POs, or approvals
- install dates approaching
- submittals due, rejected, or blocking release
- COs pending or aging
- jobs with capacity or procurement risk

Manual notes matter, but the strongest version also generates useful reminders from job data.

### Job Detail Cockpit

Job Detail should be the PM operating surface. It should answer, at a glance:

- What is this job and who owns it?
- What is the base contract, approved CO total, pending CO exposure, and current contract?
- When does it install and how much crew/shop capacity does it need?
- Are shop drawings/submittals approved?
- Are materials, quartz/stone, or other subcontracted items ordered?
- What files matter right now?
- What is blocking release, install, billing, or closeout?

It should feel like picking the needed information off the page, not digging for it.

### Backlog And Capacity Map

The app should help the business grow responsibly. It should make committed backlog, likely awards, install windows, PM load, shop capacity, and overbooked periods visible.

The goal is to answer: Can we take more work in August? Should we push this client to September? Are we selling work into a bottleneck?

### Historical Intelligence

The system should remember what humans cannot reasonably track manually:

- bid volume, value, win rate, and follow-up history by GC/client/job type
- estimate value vs final cost and margin
- base contract vs CO growth
- quantity history by category, material, unit, area, phase, and job type
- which GCs, job types, and PM workflows are healthy or risky

Reports should turn history into practical judgment, not decorative charts.

## Future Integrations

Build integrations only after the core workflow is reliable, but design with these eventual bridges in mind:

- Email ingest for ITBs, addenda, NTPs, CO responses, approvals, and project correspondence.
- Calendar sync for bid due dates, install windows, submittal dates, PM reminders, and capacity planning.
- OneDrive/SharePoint bridge for durable company file workflows while keeping Supabase as the app persistence source.
- Accounting export inspired by Vista/QuickBooks workflows for jobs, contracts, approved COs, POs, billing milestones, and closeout.
- Supplier/sub quote intake for quartz, stone, glass, metal, hardware, and other outside scope.
- PDF parsing for project metadata, proposal intake, drawing/spec issue dates, addenda, and eventually quantity hints.

## Automation Philosophy

Automation should remove follow-up burden and protect margin. It should be practical, explainable, and easy to override.

Prioritize automations that say:

- This submitted bid is stale and needs follow-up.
- This won job is missing contract, drawings, proposal, or handoff files.
- This job has quartz/stone scope but no PO or subcontract.
- This submittal is due, rejected, or blocking release.
- This CO is pending too long or has contract impact.
- This install window collides with other booked work.
- This estimate carries major quantities that should inform purchasing or capacity.
- This job is financially healthy, at risk, or drifting from the original estimate.

## UX And Design Taste

- Dense where work is dense: workbook, bid register, job logs, CO logs.
- Calm and scannable where decisions are needed: Home, PM board, Job Detail, Reports.
- Tables can be beautiful. Cards should be purposeful, not decorative clutter.
- Use a grounded Pacific Northwest palette with colorblind-safe status treatment.
- Avoid walls of text, nested card piles, generic dashboard chrome, and oversized empty surfaces.
- Make files, contacts, activity, and financial context available where the work happens.
- Prefer smart summaries and next actions over forcing users to interpret raw data.

## What To Avoid

- Do not build Procore-lite.
- Do not build generic SaaS with construction labels.
- Do not bury PMs in forms.
- Do not make saved-looking actions that are not actually persisted.
- Do not scatter business logic across UI components.
- Do not add dashboards that look impressive but do not change a decision.
- Do not optimize for demo polish over workflow trust.
- Do not let every page become a wall of cards.

## Decision Filter

When choosing between two implementations, prefer the one that:

- preserves the shared source of truth
- makes the next action clearer
- reduces manual memory burden
- protects margin or schedule confidence
- keeps the workbook fast and trustworthy
- makes PM job information easier to find
- turns historical data into better decisions
