# Estimating Suite Product Blueprint v1

## Purpose

Estimating Suite is the operating system for a commercial casework fabrication and install subcontractor. It should support the full lifecycle from early opportunity tracking through estimating, proposal generation, award, job execution, change orders, file storage, closeout, and historical reporting.

The product should help the business grow responsibly by answering:

- What needs attention now?
- Which bids are worth chasing?
- What work is already committed?
- Can we take on more work in a given period?
- Are jobs and change orders protecting margin?
- Which GCs, clients, job types, and PM workflows are healthy?

## Core Lifecycle

```text
Opportunity -> Estimate -> Proposal -> Submitted Bid -> Won/Lost/Cold
Won Opportunity -> Job -> Change Orders -> Final Cost -> Historical Analytics
```

The lifecycle is the spine of the app. Each module should either create, advance, support, or report on one of these lifecycle states.

## Core Modules

### Home

Home is a signal board, not a full reporting center.

Estimator/pre-con Home should prioritize:

- bids due soon
- follow-ups due
- active bids
- submitted bids awaiting response
- won/revenue snapshot
- pending awards/NTPs
- urgent CO or job handoff warnings only when action is needed

Home should avoid deep reporting clutter. Forecasting, margin, PM detail, GC/client analysis, and job cost belong in Reports.

### Bid Register

The Bid Register is the long-term opportunity source of truth.

It should support:

- cold bids
- future bids
- submitted bids awaiting win/loss
- won/lost/archive history
- month/year grouping
- value rollups
- follow-up flags
- NTP and initial contract tracking
- links/files
- historical reporting

Submitted bids live here long-term rather than crowding Pipeline.

### Pipeline

Pipeline is for active estimating work only.

Primary stages:

- Lead / ITB
- Pricing
- Review / Send

Once submitted, the opportunity primarily belongs in Bid Register until marked won, lost, cold, or archived.

### Estimator / Proposal

Estimator is a dense workbook-style tool modeled after FS Estimator V2.

It should support:

- areas
- sections
- line items
- pricing library
- supplier/subcontractor items
- alternates
- exclusions and clarifications
- project info/proposal metadata
- IG and NP flags
- row and multi-row copy/paste
- area/section copy/paste with quantity choices
- bid analytics / takeoff summary
- ZZTakeoff import
- proposal PDF generation
- estimate snapshots

The estimator engine should be reusable for base bids and large change orders.

#### Bid Analytics / Takeoff Summary Addendum

The workbook should include a Bid Analytics or Takeoff Summary view that answers quantity questions across the whole estimate before the proposal is submitted.

Example questions:

- Across three hospital floors, how many linear feet of solid surface countertop are included?
- How many linear feet of upper cabinets vs base cabinets are in the bid?
- How many square feet of countertops are carried by area, phase, or floor?
- How much work is tied to supplier/subcontractor categories such as stone, quartz, glass, or metal?

The summary should roll up quantities by:

- item category
- pricing library category
- unit of measure
- area
- section
- phase
- material/type

This likely requires line items to carry a structured category, preferably inherited from the pricing library when a library item is inserted. Manually entered rows should allow category assignment so the analytics remain useful even when the estimator is typing from scratch.

This view belongs inside the workbook near Base Bid Summary, with longer-term reporting available in Reports after estimates become snapshots and historical data.

### Jobs

Jobs are the source of truth after award.

Jobs should support:

- job number by PM/year sequence
- PM ownership
- base contract
- approved CO rollup
- current contract
- install/fab status
- install dates and crew size
- files
- activity log
- contacts
- linked opportunity/proposal/estimate snapshot
- final cost
- closeout and margin history

### Change Orders

Change orders belong to Job Detail as post-award job objects.

Each CO should support:

- draft/priced/sent/pending/approved/rejected/void status
- CO number
- description and added scope
- amount
- cost/margin tracking
- generated CO proposal PDF
- GC approval/additional PO file
- approval date
- files and backup
- activity history

Financial rules:

- Base Contract never changes.
- Approved COs roll into Approved CO Total.
- Current Contract = Base Contract + Approved COs.
- Pending COs show exposure/opportunity but do not increase Current Contract.
- Rejected/Void COs remain in history but do not roll up.

CO pricing should have two paths:

- Quick CO for small changes.
- CO Workbook for large scope additions, using the same pricing library and estimator mechanics as base bids.

### Calendar / Capacity

Calendar/Capacity is required before launch, but it does not need to dominate Home.

It should support:

- bid due calendar
- awarded job install calendar
- install crew demand
- fabrication/install load by week/month
- jobs missing dates
- forecasted workload from likely awards
- overbooked or underbooked period warnings

This module helps pre-con understand when to bid aggressively and when to set client expectations.

### Contacts

Contacts are a core shared module and should act as the internal rolodex.

Contacts should support companies and people.

Company fields:

- company name
- type: GC, architect, owner, supplier, subcontractor, vendor, consultant
- main address
- billing address
- website
- phone
- notes
- tags
- active/inactive

Person fields:

- name
- company
- title/role
- email
- phone
- mobile
- notes
- tags
- active/inactive

Project-specific contact roles should be linkable to opportunities and jobs:

- GC PM
- superintendent
- project engineer
- estimator
- owner contact
- architect
- purchasing/AP
- supplier rep
- internal PM

Contacts should autofill intake, proposal To blocks, job handoff, CO documents, and PM job detail.

### Files

Files are shared infrastructure and should surface where they are useful.

File slots should exist at opportunity, estimate, job, and CO level:

- drawings
- specs
- schedule
- proposal
- contract
- submittals
- CO docs
- approval / PO
- photos
- invoices
- miscellaneous

Files should be visible from related owner records, not only a standalone Files page.

### Reports

Reports are where the deeper business intelligence lives.

Report groups:

- Forecasting
- Bid Performance
- GC / Client Reports
- Job Cost
- PM Detail
- Change Orders
- Historical Pricing
- Margin Analysis
- Bid Analytics / Takeoff Summary

Useful report examples:

- backlog by month
- booked vs probable vs capacity
- revenue forecast by month/quarter/year
- submitted bid weighted forecast
- win rate by GC/client/job type
- bid value vs won value
- jobs by GC
- approved/pending CO value
- estimate vs final cost
- base contract vs COs vs final cost
- margin by GC/client/job type/PM
- quantity history by category, unit, client, job type, and material

## Role-Based Home

The app should keep one shared architecture and one shared source of truth, but Home should adapt by role.

### Estimator / Pre-Con Home

Focus:

- active bids
- due dates
- follow-ups
- proposal tasks
- submitted waiting
- awards/NTPs
- forecasting signals

### PM Home

Focus:

- my active jobs
- upcoming installs
- jobs missing schedule dates
- COs pending
- files/submittals needing action
- billing status
- current contract value under management
- PM workload

### Leadership / Admin Home

Focus:

- backlog
- revenue forecast
- margin
- capacity risk
- PM workload
- GC/client performance
- aging COs

## PM Role Experience

The future PM module should be a role experience, not a disconnected second app.

PM work should be built mostly from:

- Jobs
- Calendar/Capacity
- Change Orders
- Files
- Contacts
- Reports

Job Detail is the primary PM operating surface.

PM Job Detail should include:

- overview
- schedule
- install crew size/dates
- files
- change orders
- contacts
- financials
- notes/activity
- submittal/material/procurement status
- closeout
- final cost

The estimator-to-PM handoff should include:

- opportunity record
- final proposal
- estimate snapshot
- inclusions/exclusions
- alternates accepted/rejected
- bid documents
- drawings/specs/schedule
- client/GC contacts
- NTP/award info
- initial contract amount
- known risk notes

## Design Principles

- Dense where work is dense: estimator, register, job logs, CO logs.
- Calm and scannable where decisions are needed: Home, Jobs, Reports.
- Proposal output should feel like Form and Structure's existing professional document style, not a generic SaaS report.
- Files, contacts, and activity should be available in context.
- Manual reliability comes before automation.
- Historical data must remain stable through snapshots, even when pricing changes later.
- The app should support growth into multiple roles without splitting truth across disconnected tools.

## Release Shape

### V1

- Home signal board
- Bid Register
- Pipeline
- Estimator/Proposal workbook
- Jobs list and Job Detail
- Change Order log and basic CO workflow
- Contacts core module
- Calendar/Capacity
- file slots
- manual reports foundation

### V2

- Supabase persistence
- Auth and role-based Home
- Supabase Storage
- estimate snapshots
- CO workbook pricing
- improved proposal and CO PDF QA
- import validation

### V3

- forecasting reports
- GC/client intelligence
- job cost and margin analysis
- historical pricing
- PM detail reports
- weighted pipeline/capacity forecasting

### V4

- deeper PM role experience
- procurement/submittal tracking
- closeout workflows
- richer calendar/capacity planning
- notifications and reminders

### V5

- integrations such as email, calendar, QuickBooks/Vista-style accounting exports, cloud drive automation, and external notifications.
