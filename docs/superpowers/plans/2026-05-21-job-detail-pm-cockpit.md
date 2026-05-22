# Job Detail PM Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the large Job Detail modal with a full-page PM cockpit at routes like `#job/G26-042`, with Dewey-style top tabs and the existing persisted job detail actions preserved.

**Architecture:** Add a small route resolver for job-number hash routes, then render a `JobDetailPage` component instead of the modal when a job route is active. Reuse existing mutation callbacks and job detail persistence helpers, while extracting focused job-detail UI components out of `src/app/page.tsx` enough to keep the route implementation readable.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Supabase repositories/hooks, Vitest, existing hash-router state.

---

## Scope Guard

This plan implements the approved spec in `docs/superpowers/specs/2026-05-21-job-detail-pm-cockpit-design.md`.

Do not include:

- Outlook integration.
- Manual calendar events.
- PO PDF generation.
- Full Job Cost tab.
- Supabase schema rewrites.
- Workbook redesign.

Keep the current dirty working tree in mind. At the time this plan was written, unrelated uncommitted code changes already existed in:

- `src/app/globals.css`
- `src/app/page.tsx`
- `src/components/BidWorkbook.tsx`
- `src/hooks/useJobsPersistence.ts`
- `src/lib/estimating-suite.test.ts`
- `src/lib/opportunity-workflow.ts`
- `src/lib/schedule-capacity.ts`

Before implementation, inspect `git status --short --branch` and do not revert user or prior-agent work.

## File Structure

Create:

- `src/lib/job-route.ts`
  - Owns job hash parsing, building `#job/<jobNumber>` routes, and resolving route params to jobs.

- `src/components/job-detail/JobDetailPage.tsx`
  - Full-page PM cockpit shell.
  - Sticky command header, alert strip, Dewey tabs, and section rendering.
  - Receives callbacks from `src/app/page.tsx`; does not call Supabase directly.

- `src/components/job-detail/job-detail-page-types.ts`
  - Shared prop type for `JobDetailPage`, so `page.tsx` and future extracted section components do not duplicate long callback signatures.

Modify:

- `src/lib/job-detail-tabs.ts`
  - Replace old modal tab ids with Dewey-style route/page section ids.

- `src/lib/job-detail-data.ts`
  - Add route-friendly job lookup helpers if needed.

- `src/lib/estimating-suite.test.ts`
  - Add unit coverage for job route parsing/resolution and tab metadata.

- `src/app/page.tsx`
  - Recognize `#job/G26-042` routes.
  - Auto-collapse main nav while on job route and restore prior nav state when leaving.
  - Replace primary `JobDetailModal` rendering with `JobDetailPage`.
  - Route Jobs list, Calendar, Home/PM action job opens to `#job/<jobNumber>`.

- `src/app/globals.css`
  - Add full-page cockpit layout styles.
  - Keep dense, no side-scroll behavior.

---

### Task 1: Add Job Route Helpers

**Files:**

- Create: `src/lib/job-route.ts`
- Modify: `src/lib/estimating-suite.test.ts`

- [ ] **Step 1: Write failing route helper tests**

Add this import to `src/lib/estimating-suite.test.ts` near other lib imports:

```ts
import { buildJobRouteHash, parseJobRouteHash, resolveJobRoute } from "./job-route";
```

Add this describe block near the job detail data tests:

```ts
describe("job route helpers", () => {
  const jobs = [
    {
      id: "50f42d9f-b53f-4a97-b711-dc8b1cd13384",
      jobNumber: "G26-042",
      projectName: "Norwest",
      client: "Layton"
    },
    {
      id: "local-job",
      jobNumber: "P26-043",
      projectName: "Lab Renovation",
      client: "McCarthy"
    }
  ];

  it("builds human-readable job route hashes", () => {
    expect(buildJobRouteHash({ jobNumber: "G26-042" })).toBe("#job/G26-042");
    expect(buildJobRouteHash({ jobNumber: "G 26-042" })).toBe("#job/G26-042");
  });

  it("parses job route hashes by job number", () => {
    expect(parseJobRouteHash("#job/G26-042")).toEqual({ jobNumber: "G26-042" });
    expect(parseJobRouteHash("job/P26-043")).toEqual({ jobNumber: "P26-043" });
    expect(parseJobRouteHash("#jobs")).toBeNull();
  });

  it("resolves a job route by job number first", () => {
    expect(resolveJobRoute("#job/g26-042", jobs)?.id).toBe("50f42d9f-b53f-4a97-b711-dc8b1cd13384");
  });

  it("falls back to UUID route values when no job number matches", () => {
    expect(resolveJobRoute("#job/50f42d9f-b53f-4a97-b711-dc8b1cd13384", jobs)?.jobNumber).toBe("G26-042");
  });
});
```

- [ ] **Step 2: Run route helper tests and verify they fail**

Run:

```powershell
npx.cmd vitest run --root . src/lib/estimating-suite.test.ts --globals --environment node -t "job route helpers"
```

Expected:

```text
FAIL src/lib/estimating-suite.test.ts
buildJobRouteHash is not a function
```

- [ ] **Step 3: Implement route helpers**

Create `src/lib/job-route.ts`:

```ts
type JobRouteLike = {
  id?: string;
  jobNumber?: string;
};

export type JobRouteParam = {
  jobNumber: string;
};

export function buildJobRouteHash(job: JobRouteLike): string {
  const token = normalizeJobRouteToken(job.jobNumber || job.id || "");
  return token ? `#job/${token}` : "#jobs";
}

export function parseJobRouteHash(hash: string): JobRouteParam | null {
  const cleaned = hash.trim().replace(/^#/, "");
  const match = cleaned.match(/^job\/(.+)$/i);
  if (!match) return null;
  const jobNumber = normalizeJobRouteToken(decodeURIComponent(match[1] ?? ""));
  return jobNumber ? { jobNumber } : null;
}

export function resolveJobRoute<T extends JobRouteLike>(hash: string, jobs: T[]): T | null {
  const route = parseJobRouteHash(hash);
  if (!route) return null;
  const normalizedRoute = normalizeComparable(route.jobNumber);
  return (
    jobs.find((job) => normalizeComparable(job.jobNumber ?? "") === normalizedRoute) ??
    jobs.find((job) => normalizeComparable(job.id ?? "") === normalizedRoute) ??
    null
  );
}

function normalizeJobRouteToken(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function normalizeComparable(value: string): string {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}
```

- [ ] **Step 4: Run route helper tests and verify they pass**

Run:

```powershell
npx.cmd vitest run --root . src/lib/estimating-suite.test.ts --globals --environment node -t "job route helpers"
```

Expected:

```text
1 passed
```

- [ ] **Step 5: Commit Task 1**

Run:

```powershell
git add src/lib/job-route.ts src/lib/estimating-suite.test.ts
git commit -m "Add job route helpers"
```

---

### Task 2: Define Dewey Job Tabs

**Files:**

- Modify: `src/lib/job-detail-tabs.ts`
- Modify: `src/lib/estimating-suite.test.ts`

- [ ] **Step 1: Write failing tab metadata test**

Replace the old job detail tab expectation in `src/lib/estimating-suite.test.ts` with:

```ts
it("defines Dewey-style job detail cockpit tabs", () => {
  expect(jobDetailTabs).toEqual([
    { id: "overview", code: "00", label: "Overview" },
    { id: "schedule", code: "10", label: "Schedule" },
    { id: "submittals", code: "20", label: "Submittals" },
    { id: "change-orders", code: "30", label: "COs" },
    { id: "purchase-orders", code: "40", label: "POs" },
    { id: "files", code: "50", label: "Files" },
    { id: "notes", code: "60", label: "Notes" },
    { id: "activity", code: "70", label: "Activity" }
  ]);
});
```

- [ ] **Step 2: Run the focused tab test and verify it fails**

Run:

```powershell
npx.cmd vitest run --root . src/lib/estimating-suite.test.ts --globals --environment node -t "Dewey-style job detail cockpit tabs"
```

Expected:

```text
FAIL expected old tab ids/actions/financials
```

- [ ] **Step 3: Update tab definitions**

Replace `src/lib/job-detail-tabs.ts` with:

```ts
export type JobDetailTabId =
  | "overview"
  | "schedule"
  | "submittals"
  | "change-orders"
  | "purchase-orders"
  | "files"
  | "notes"
  | "activity";

export type JobDetailTab = {
  id: JobDetailTabId;
  code: string;
  label: string;
};

export const jobDetailTabs: JobDetailTab[] = [
  { id: "overview", code: "00", label: "Overview" },
  { id: "schedule", code: "10", label: "Schedule" },
  { id: "submittals", code: "20", label: "Submittals" },
  { id: "change-orders", code: "30", label: "COs" },
  { id: "purchase-orders", code: "40", label: "POs" },
  { id: "files", code: "50", label: "Files" },
  { id: "notes", code: "60", label: "Notes" },
  { id: "activity", code: "70", label: "Activity" }
];
```

- [ ] **Step 4: Run tab test and verify it passes**

Run:

```powershell
npx.cmd vitest run --root . src/lib/estimating-suite.test.ts --globals --environment node -t "Dewey-style job detail cockpit tabs"
```

Expected:

```text
PASS
```

- [ ] **Step 5: Commit Task 2**

Run:

```powershell
git add src/lib/job-detail-tabs.ts src/lib/estimating-suite.test.ts
git commit -m "Define job cockpit tabs"
```

---

### Task 3: Create Job Detail Page Types

**Files:**

- Create: `src/components/job-detail/job-detail-page-types.ts`

- [ ] **Step 1: Create shared prop type file**

Create `src/components/job-detail/job-detail-page-types.ts`:

```ts
import type { FormEvent } from "react";
import type {
  ChangeOrderStatus,
  Contact,
  Job,
  PMNote,
  ProjectFile,
  PurchaseOrder,
  PurchaseOrderScope,
  PurchaseOrderStatus,
  SubmittalPackage
} from "@/types";
import type { SubmittalAction, UpdateSubmittalInput, setSubmittalChecklistState } from "@/lib/submittals";

export type JobDetailPageProps = {
  job: Job;
  pmNotes: PMNote[];
  contacts: Contact[];
  canEditHeader?: boolean;
  onBackToJobs: () => void;
  onApproveCos: (id: string) => void;
  onUpdateCoStatus: (jobId: string, coId: string, status: ChangeOrderStatus) => void;
  onCreatePurchaseOrder: (jobId: string, input: Omit<PurchaseOrder, "id" | "jobId">) => void;
  onCreatePmNote: (text: string, jobId?: string) => void;
  onCreateSubmittal: (jobId: string, input: Omit<SubmittalPackage, "id" | "jobId" | "status" | "revision">) => void;
  onEditPurchaseOrder: (jobId: string, poId: string, updates: Partial<PurchaseOrder>) => void;
  onEditSubmittal: (jobId: string, submittalId: string, updates: UpdateSubmittalInput) => void;
  onJobFile: (jobId: string, slot: string, file: File | undefined) => void;
  onPurchaseOrderFile: (jobId: string, poId: string, file: File | undefined) => void;
  onStartChangeOrder: (jobId: string) => void;
  onUpdateJob: (jobId: string, updates: Partial<Job>) => void;
  onDeletePmNote: (noteId: string) => void;
  onUpdatePmNoteStatus: (noteId: string, status: PMNote["status"]) => void;
  onUpdatePmNoteText: (noteId: string, text: string) => void;
  onSubmittalChecklist: (jobId: string, submittalId: string, updates: Parameters<typeof setSubmittalChecklistState>[1]) => void;
  onSubmittalFile: (jobId: string, submittalId: string, file: File | undefined) => void;
  onSubmittalAction: (jobId: string, submittalId: string, action: SubmittalAction) => void;
  onAddContact: (jobId: string, contactId: string) => void;
  onRemoveContact: (jobId: string, joinId: string) => void;
};

export type PurchaseOrderDraft = {
  poNumber: string;
  vendor: string;
  scope: PurchaseOrderScope;
  description: string;
  status: PurchaseOrderStatus;
  committedAmount: string;
  neededBy: string;
  promisedDate: string;
  owner: string;
  notes: string;
};

export type SubmittalDraft = {
  name: string;
  type: SubmittalPackage["type"];
  dueDate: string;
  owner: string;
  releaseBlocker: boolean;
  notes: string;
};

export type SubmitHandler = (event: FormEvent<HTMLFormElement>) => void;
```

- [ ] **Step 2: Run typecheck**

Run:

```powershell
npm.cmd run typecheck
```

Expected:

```text
tsc --noEmit
```

No errors.

- [ ] **Step 3: Commit Task 3**

Run:

```powershell
git add src/components/job-detail/job-detail-page-types.ts
git commit -m "Add job detail page prop types"
```

---

### Task 4: Create Job Detail Page Component

**Files:**

- Create: `src/components/job-detail/JobDetailPage.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create the page component shell**

Create `src/components/job-detail/JobDetailPage.tsx`.

Start with this import block:

```tsx
"use client";

import { BriefcaseBusiness, CalendarDays, CheckCircle2, ClipboardList, FileArchive, StickyNote, WalletCards } from "lucide-react";
import { useState } from "react";
import { buildPmActionItems } from "@/lib/pm-actions";
import { currentContractValue, jobCostSummary, summarizeChangeOrders, summarizePurchaseOrders } from "@/lib/job-financials";
import { jobDetailTabs, type JobDetailTabId } from "@/lib/job-detail-tabs";
import { fileSlots } from "@/lib/sample-data";
import { summarizeSubmittals, type SubmittalAction } from "@/lib/submittals";
import type { Job, PMNote, PurchaseOrderScope, PurchaseOrderStatus, SubmittalPackage } from "@/types";
import type { JobDetailPageProps, PurchaseOrderDraft, SubmittalDraft } from "./job-detail-page-types";
```

Copy these helper constants/functions from `src/app/page.tsx` if they are not exported:

```tsx
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const today = "2026-05-09";
const primaryDocumentSlots = ["drawings", "specs", "schedule", "contract", "proposal", "submittals"];
const submittalTypes: SubmittalPackage["type"][] = ["Shop Drawings", "Finish Samples", "Hardware", "Engineering", "Other"];
const purchaseOrderScopes: PurchaseOrderScope[] = ["Stone / Quartz", "Cambria", "Solid Surface", "Glass", "Metal", "Install Labor", "Other"];
const purchaseOrderStatuses: PurchaseOrderStatus[] = ["Draft", "Issued", "Acknowledged", "In Progress", "Complete", "Closed", "Void"];

function installDuration(start: string, end: string) {
  if (!start) return "TBD";
  if (!end || start === end) return "Same day";
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
  return `${days} days`;
}
```

Add minimal local display helpers so this component can stand alone:

```tsx
function Status({ value }: { value: string }) {
  return <span className={`status ${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{value}</span>;
}

function FileLink({ file }: { file: { name: string; url?: string } }) {
  return file.url ? <a href={file.url} rel="noreferrer" target="_blank">{file.name}</a> : <span>{file.name}</span>;
}
```

- [ ] **Step 2: Implement `JobDetailPage` skeleton**

Add this component body first. It gives the route a real page before all sections are migrated:

```tsx
export function JobDetailPage(props: JobDetailPageProps) {
  const {
    job,
    pmNotes,
    contacts,
    canEditHeader = true,
    onBackToJobs,
    onCreatePmNote,
    onStartChangeOrder,
    onUpdateJob
  } = props;
  const [activeTab, setActiveTab] = useState<JobDetailTabId>("overview");
  const coSummary = summarizeChangeOrders(job.changeOrders);
  const currentValue = currentContractValue(job.baseContract, job.changeOrders);
  const poSummary = summarizePurchaseOrders(job.purchaseOrders, today);
  const costSummary = jobCostSummary(job, today);
  const submittalSummary = summarizeSubmittals(job.submittals, today);
  const jobNotes = pmNotes.filter((note) => note.jobId === job.id);
  const documentCount = primaryDocumentSlots.filter((slot) => job.files.some((file) => file.slot === slot)).length;
  const shopDrawingPackage = job.submittals.find((item) => item.type === "Shop Drawings" || item.name.toLowerCase().includes("shop"));
  const materialStatus = job.purchaseOrders.length === 0
    ? "Needs PO review"
    : job.purchaseOrders.some((po) => po.status === "Draft")
      ? "PO needs issue"
      : "Ordered / tracking";

  return (
    <div className="job-page">
      <div className="job-breadcrumb">
        <button onClick={onBackToJobs} type="button">Jobs</button>
        <span>/</span>
        <strong>{job.jobNumber}</strong>
        <span>/</span>
        <span>{job.projectName}</span>
      </div>

      <header className="job-command-header">
        <div className="job-command-title">
          <span className="eyebrow">{job.jobNumber} - {job.pm}</span>
          <h2>{job.projectName}</h2>
          <p>{job.client} - GC {job.gc || "TBD"} - Bid ref {job.bidRef || "TBD"}</p>
        </div>
        <div className="job-command-facts">
          <article><span>Contract</span><strong>{money.format(currentValue)}</strong></article>
          <article><span>Install</span><strong>{job.installStart || "TBD"}</strong><small>{installDuration(job.installStart, job.installEnd)}</small></article>
          <article><span>Status</span><Status value={job.backlogStatus} /></article>
        </div>
        <div className="job-command-actions">
          <button className="primary" onClick={() => onStartChangeOrder(job.id)} type="button">New CO</button>
          <button className="primary muted-action" onClick={() => setActiveTab("purchase-orders")} type="button">New PO</button>
          <button className="primary muted-action" onClick={() => setActiveTab("files")} type="button">Add File</button>
          <button className="primary muted-action" onClick={() => onCreatePmNote(`Follow up on ${job.jobNumber}`, job.id)} type="button">Add Note</button>
        </div>
      </header>

      <section className="job-alert-strip">
        {!job.installStart ? <button onClick={() => setActiveTab("schedule")} type="button">Missing install dates</button> : null}
        {documentCount < primaryDocumentSlots.length ? <button onClick={() => setActiveTab("files")} type="button">Core docs missing</button> : null}
        {shopDrawingPackage && !["Approved", "Approved as Noted"].includes(shopDrawingPackage.status) ? <button onClick={() => setActiveTab("submittals")} type="button">Shop drawings need review</button> : null}
        {poSummary.lateCount || materialStatus !== "Ordered / tracking" ? <button onClick={() => setActiveTab("purchase-orders")} type="button">{materialStatus}</button> : null}
        {coSummary.submitted ? <button onClick={() => setActiveTab("change-orders")} type="button">{money.format(coSummary.submitted)} pending COs</button> : null}
        {jobNotes.filter((note) => note.status !== "Done").length ? <button onClick={() => setActiveTab("notes")} type="button">{jobNotes.filter((note) => note.status !== "Done").length} open notes</button> : null}
      </section>

      <nav className="job-dewey-tabs" aria-label="Job detail sections">
        {jobDetailTabs.map((tab) => (
          <button className={activeTab === tab.id ? "active" : ""} key={tab.id} onClick={() => setActiveTab(tab.id)} type="button">
            <span>{tab.code}</span>
            <strong>{tab.label}</strong>
          </button>
        ))}
      </nav>

      {activeTab === "overview" ? (
        <section className="job-page-section">
          <div className="job-overview-grid">
            <article><span>Install</span><strong>{job.installStart || "TBD"}</strong><small>{installDuration(job.installStart, job.installEnd)} - crew {job.crewSize}</small></article>
            <article><span>Submittals</span><strong>{submittalSummary.label}</strong><small>{submittalSummary.releaseState}</small></article>
            <article><span>Materials / POs</span><strong>{materialStatus}</strong><small>{poSummary.count} purchase order{poSummary.count === 1 ? "" : "s"}</small></article>
            <article><span>Change orders</span><strong>{money.format(coSummary.approved)}</strong><small>{money.format(coSummary.submitted)} pending</small></article>
            <article><span>Files</span><strong>{documentCount} / {primaryDocumentSlots.length}</strong><small>core documents</small></article>
            <article><span>Margin</span><strong>{costSummary.projectedMarginPct == null ? "TBD" : `${costSummary.projectedMarginPct}%`}</strong><small>projected</small></article>
          </div>
        </section>
      ) : null}

      {activeTab === "schedule" ? (
        <section className="job-page-section">
          <h3>10 Schedule</h3>
          <div className="job-header-edit-grid">
            <label><span>Install start</span><input disabled={!canEditHeader} onChange={(e) => onUpdateJob(job.id, { installStart: e.target.value })} type="date" value={job.installStart} /></label>
            <label><span>Install end</span><input disabled={!canEditHeader} onChange={(e) => onUpdateJob(job.id, { installEnd: e.target.value })} type="date" value={job.installEnd} /></label>
            <label><span>Crew size</span><input disabled={!canEditHeader} min="0" onChange={(e) => onUpdateJob(job.id, { crewSize: Number(e.target.value) || 0 })} type="number" value={job.crewSize} /></label>
            <label><span>Backlog status</span><select disabled={!canEditHeader} onChange={(e) => onUpdateJob(job.id, { backlogStatus: e.target.value as Job["backlogStatus"] })} value={job.backlogStatus}>{["Awarded / Waiting", "Submittals", "Release Pending", "In Fabrication", "Ready to Install", "Installing", "Installed", "Closeout", "Complete", "Void"].map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          </div>
        </section>
      ) : null}

      {activeTab !== "overview" && activeTab !== "schedule" ? (
        <JobDetailSectionRouter activeTab={activeTab} props={props} />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Add placeholder router inside the same file**

Add this below `JobDetailPage`. Later tasks replace the placeholder content with migrated modal sections:

```tsx
function JobDetailSectionRouter({
  activeTab,
  props
}: {
  activeTab: JobDetailTabId;
  props: JobDetailPageProps;
}) {
  if (activeTab === "submittals") return <section className="job-page-section"><h3>20 Submittals</h3><p>Submittal package cards move here in Task 7.</p></section>;
  if (activeTab === "change-orders") return <section className="job-page-section"><h3>30 COs</h3><p>Change order cards move here in Task 8.</p></section>;
  if (activeTab === "purchase-orders") return <section className="job-page-section"><h3>40 POs</h3><p>Purchase order cards move here in Task 8.</p></section>;
  if (activeTab === "files") return <section className="job-page-section"><h3>50 Files</h3><p>File slots move here in Task 9.</p></section>;
  if (activeTab === "notes") return <section className="job-page-section"><h3>60 Notes</h3><p>PM notes move here in Task 9.</p></section>;
  if (activeTab === "activity") return <section className="job-page-section"><h3>70 Activity</h3>{props.job.activity.map((event) => <p className="activity" key={event.id}><strong>{event.author}</strong> {event.message} <span>{event.createdAt}</span></p>)}</section>;
  return null;
}
```

- [ ] **Step 4: Import `JobDetailPage` in `src/app/page.tsx`**

Add:

```ts
import { JobDetailPage } from "@/components/job-detail/JobDetailPage";
```

- [ ] **Step 5: Run typecheck and fix compile issues**

Run:

```powershell
npm.cmd run typecheck
```

Expected:

```text
No TypeScript errors.
```

- [ ] **Step 6: Commit Task 4**

Run:

```powershell
git add src/components/job-detail/JobDetailPage.tsx src/app/page.tsx
git commit -m "Add job detail cockpit page shell"
```

---

### Task 5: Wire Job Hash Routing And Sidebar Auto-Collapse

**Files:**

- Modify: `src/app/page.tsx`
- Modify: `src/lib/estimating-suite.test.ts` if helper expectations need small updates.

- [ ] **Step 1: Add route helper import**

In `src/app/page.tsx`, add:

```ts
import { buildJobRouteHash, parseJobRouteHash, resolveJobRoute } from "@/lib/job-route";
```

- [ ] **Step 2: Add job route state**

Near existing app state:

```ts
const [activeJobRoute, setActiveJobRoute] = useState<string | null>(null);
const [preJobNavCollapsed, setPreJobNavCollapsed] = useState<boolean | null>(null);
```

Replace:

```ts
const detailJobData = getJobDetailData({ jobs, pmNotes, jobId: detailJobId });
```

with:

```ts
const routedJob = activeJobRoute ? resolveJobRoute(activeJobRoute, jobs) : null;
const activeJobId = routedJob?.id ?? detailJobId;
const detailJobData = getJobDetailData({ jobs, pmNotes, jobId: activeJobId });
const isJobRoute = Boolean(activeJobRoute);
```

- [ ] **Step 3: Update hash sync effect**

In the `syncViewFromHash` function around the current hash handling, replace the logic with:

```ts
const hash = window.location.hash.replace("#", "");
const jobRoute = parseJobRouteHash(window.location.hash);

if (jobRoute) {
  setActiveJobRoute(window.location.hash);
  setView("jobs");
  return;
}

setActiveJobRoute(null);
if (viewIds.includes(hash as View)) {
  setView(hash as View);
}
```

- [ ] **Step 4: Add sidebar auto-collapse effect**

Add this effect after the hash sync effect:

```ts
useEffect(() => {
  if (!hasMounted) return;
  if (isJobRoute) {
    setPreJobNavCollapsed((current) => current ?? mainNavCollapsed);
    setMainNavCollapsed(true);
    return;
  }

  if (preJobNavCollapsed !== null) {
    setMainNavCollapsed(preJobNavCollapsed);
    setPreJobNavCollapsed(null);
  }
}, [hasMounted, isJobRoute, mainNavCollapsed, preJobNavCollapsed]);
```

- [ ] **Step 5: Add a job opener function**

Near `goToView`, add:

```ts
function openJobRoute(jobId: string) {
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job) return;
  setDetailJobId(job.id);
  setActiveJobRoute(buildJobRouteHash(job));
  window.location.hash = buildJobRouteHash(job);
}
```

- [ ] **Step 6: Update job entry points**

Replace callback uses:

```tsx
onOpenJob={setDetailJobId}
```

with:

```tsx
onOpenJob={openJobRoute}
```

Do this for:

- `HomeDashboard`
- `JobsView`
- `CalendarCapacityView`
- `InstallDayModal` via `CalendarCapacityView`

- [ ] **Step 7: Render `JobDetailPage` as the primary job route**

Replace the unconditional `JobDetailModal` block with:

```tsx
        {detailJobData && isJobRoute ? (
          <JobDetailPage
            job={detailJobData.job}
            contacts={contacts}
            pmNotes={detailJobData.notes}
            canEditHeader={canWrite("pm")}
            onBackToJobs={() => {
              setActiveJobRoute(null);
              setDetailJobId(null);
              goToView("jobs");
            }}
            onApproveCos={approveSubmittedCo}
            onUpdateCoStatus={updateChangeOrderStatus}
            onCreatePurchaseOrder={createPurchaseOrder}
            onCreatePmNote={createPmNote}
            onCreateSubmittal={createSubmittal}
            onEditPurchaseOrder={editPurchaseOrder}
            onEditSubmittal={editSubmittal}
            onJobFile={attachJobFile}
            onPurchaseOrderFile={attachPurchaseOrderFile}
            onStartChangeOrder={startChangeOrderFromJob}
            onUpdateJob={updateJobHeader}
            onDeletePmNote={(noteId) => void deletePmNote(noteId)}
            onUpdatePmNoteStatus={(noteId, status) => void updatePmNoteStatus(noteId, status)}
            onUpdatePmNoteText={(noteId, text) => void updatePmNoteText(noteId, text)}
            onSubmittalChecklist={updateSubmittalChecklist}
            onSubmittalFile={attachSubmittalFile}
            onSubmittalAction={applySubmittalStatusAction}
            onAddContact={(jobId, contactId) => void linkContactToJob(jobId, contactId)}
            onRemoveContact={(jobId, joinId) => void unlinkContactFromJob(jobId, joinId)}
          />
        ) : null}
```

Keep the old `JobDetailModal` temporarily behind non-route local state only if needed for compile stability:

```tsx
        {detailJobData && !isJobRoute ? (
          <JobDetailModal ...existing props... />
        ) : null}
```

Then remove that fallback in Task 10.

- [ ] **Step 8: Run typecheck**

Run:

```powershell
npm.cmd run typecheck
```

Expected:

```text
No TypeScript errors.
```

- [ ] **Step 9: Commit Task 5**

Run:

```powershell
git add src/app/page.tsx
git commit -m "Route jobs to cockpit page"
```

---

### Task 6: Add Cockpit Page Styles

**Files:**

- Modify: `src/app/globals.css`

- [ ] **Step 1: Add base cockpit styles**

Append this CSS near existing job modal styles:

```css
.job-page {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.job-breadcrumb {
  align-items: center;
  color: var(--ink-3);
  display: flex;
  gap: 8px;
  font-size: 12px;
  font-weight: 750;
}

.job-breadcrumb button {
  background: transparent;
  border: 0;
  color: var(--accent-2);
  cursor: pointer;
  font-weight: 850;
  padding: 0;
}

.job-command-header {
  align-items: stretch;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r);
  box-shadow: var(--shadow);
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(260px, 1.4fr) minmax(360px, 1fr) auto;
  padding: 14px;
  position: sticky;
  top: 0;
  z-index: 20;
}

.job-command-title {
  min-width: 0;
}

.job-command-title h2 {
  font-size: 22px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-command-title p {
  color: var(--ink-3);
  margin: 4px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-command-facts {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.job-command-facts article,
.job-overview-grid article {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  min-width: 0;
  padding: 9px 10px;
}

.job-command-facts span,
.job-overview-grid span {
  color: var(--ink-3);
  display: block;
  font-size: 10px;
  font-weight: 850;
  text-transform: uppercase;
}

.job-command-facts strong,
.job-overview-grid strong {
  color: var(--ink);
  display: block;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-command-facts small,
.job-overview-grid small {
  color: var(--ink-3);
  display: block;
  font-size: 11px;
  margin-top: 2px;
}

.job-command-actions {
  align-content: center;
  display: grid;
  gap: 7px;
  grid-template-columns: repeat(2, minmax(88px, 1fr));
}

.job-alert-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.job-alert-strip button {
  background: var(--warn-soft);
  border: 1px solid var(--warn);
  border-radius: 999px;
  color: var(--ink);
  cursor: pointer;
  font-size: 12px;
  font-weight: 850;
  padding: 7px 10px;
}

.job-dewey-tabs {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r);
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  padding: 7px;
  position: sticky;
  top: 96px;
  z-index: 18;
}

.job-dewey-tabs button {
  background: var(--panel);
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  color: var(--ink-2);
  cursor: pointer;
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 8px;
  text-align: left;
}

.job-dewey-tabs button span {
  color: var(--accent-2);
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 10px;
  font-weight: 900;
}

.job-dewey-tabs button strong {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-dewey-tabs button.active {
  background: var(--jun-soft);
  border-color: var(--jun);
  color: var(--ink);
}

.job-page-section {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r);
  box-shadow: var(--shadow-soft);
  min-width: 0;
  padding: 14px;
}

.job-overview-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

@media (max-width: 1100px) {
  .job-command-header {
    grid-template-columns: 1fr;
  }

  .job-dewey-tabs {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    position: static;
  }

  .job-overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

- [ ] **Step 2: Run build to catch CSS warnings**

Run:

```powershell
npm.cmd run build
```

Expected:

```text
Compiled successfully
```

No new CSS warnings.

- [ ] **Step 3: Commit Task 6**

Run:

```powershell
git add src/app/globals.css
git commit -m "Style job cockpit route"
```

---

### Task 7: Migrate Submittals Section

**Files:**

- Modify: `src/components/job-detail/JobDetailPage.tsx`
- Modify: `src/app/page.tsx` only if imports become unused.

- [ ] **Step 1: Move submittal draft state and submit handler**

Inside `JobDetailPage`, add the current submittal draft state from the modal:

```tsx
const [submittalDraft, setSubmittalDraft] = useState<SubmittalDraft>({
  name: "",
  type: "Shop Drawings",
  dueDate: "",
  owner: job.pm,
  releaseBlocker: true,
  notes: ""
});

function addSubmittal(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!submittalDraft.name.trim()) return;

  props.onCreateSubmittal(job.id, {
    name: submittalDraft.name,
    type: submittalDraft.type,
    dueDate: submittalDraft.dueDate,
    owner: submittalDraft.owner,
    releaseBlocker: submittalDraft.releaseBlocker,
    notes: submittalDraft.notes
  });
  setSubmittalDraft((current) => ({ ...current, name: "", dueDate: "", notes: "" }));
}
```

- [ ] **Step 2: Replace submittals placeholder**

In `JobDetailSectionRouter`, replace the `activeTab === "submittals"` placeholder with a `SubmittalsSection` call:

```tsx
if (activeTab === "submittals") {
  return (
    <SubmittalsSection
      job={props.job}
      draft={submittalDraft}
      setDraft={setSubmittalDraft}
      onSubmit={addSubmittal}
      onEditSubmittal={props.onEditSubmittal}
      onSubmittalAction={props.onSubmittalAction}
      onSubmittalChecklist={props.onSubmittalChecklist}
      onSubmittalFile={props.onSubmittalFile}
    />
  );
}
```

If `JobDetailSectionRouter` cannot see `submittalDraft`, move it inside `JobDetailPage` render instead of keeping `JobDetailSectionRouter` as a separate function.

- [ ] **Step 3: Add `SubmittalsSection` component**

Use the existing JSX from the `JobDetailModal` `activeTab === "submittals"` block and wrap it as:

```tsx
function SubmittalsSection({
  job,
  draft,
  setDraft,
  onSubmit,
  onEditSubmittal,
  onSubmittalAction,
  onSubmittalChecklist,
  onSubmittalFile
}: {
  job: Job;
  draft: SubmittalDraft;
  setDraft: React.Dispatch<React.SetStateAction<SubmittalDraft>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onEditSubmittal: JobDetailPageProps["onEditSubmittal"];
  onSubmittalAction: JobDetailPageProps["onSubmittalAction"];
  onSubmittalChecklist: JobDetailPageProps["onSubmittalChecklist"];
  onSubmittalFile: JobDetailPageProps["onSubmittalFile"];
}) {
  const submittalSummary = summarizeSubmittals(job.submittals, today);
  return (
    <section className="job-page-section" id="job-submittals">
      {/* paste the current submittal create form and package-card grid here */}
    </section>
  );
}
```

When pasting the current JSX, replace modal-specific classes only where necessary:

- `modal-section` -> `job-page-section`
- keep `submittal-create`, `submittal-card-grid`, `submittal-card`, `package-files`

- [ ] **Step 4: Run typecheck**

Run:

```powershell
npm.cmd run typecheck
```

Expected:

```text
No TypeScript errors.
```

- [ ] **Step 5: Commit Task 7**

Run:

```powershell
git add src/components/job-detail/JobDetailPage.tsx
git commit -m "Move submittals into job cockpit"
```

---

### Task 8: Migrate COs And POs Sections

**Files:**

- Modify: `src/components/job-detail/JobDetailPage.tsx`

- [ ] **Step 1: Add PO draft state and submit handler**

Inside `JobDetailPage`, add:

```tsx
const [poDraft, setPoDraft] = useState<PurchaseOrderDraft>({
  poNumber: `PO-${job.jobNumber}-${String((job.purchaseOrders?.length ?? 0) + 1).padStart(3, "0")}`,
  vendor: "",
  scope: "Stone / Quartz",
  description: "",
  status: "Draft",
  committedAmount: "",
  neededBy: "",
  promisedDate: "",
  owner: job.pm,
  notes: ""
});

function addPurchaseOrder(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!poDraft.vendor.trim() || !poDraft.poNumber.trim()) return;

  props.onCreatePurchaseOrder(job.id, {
    poNumber: poDraft.poNumber,
    vendor: poDraft.vendor,
    scope: poDraft.scope,
    description: poDraft.description,
    status: poDraft.status,
    committedAmount: Number(poDraft.committedAmount) || 0,
    neededBy: poDraft.neededBy,
    promisedDate: poDraft.promisedDate,
    owner: poDraft.owner,
    notes: poDraft.notes
  });
  setPoDraft((current) => ({
    ...current,
    poNumber: `PO-${job.jobNumber}-${String((job.purchaseOrders.length ?? 0) + 2).padStart(3, "0")}`,
    vendor: "",
    description: "",
    committedAmount: "",
    neededBy: "",
    promisedDate: "",
    notes: ""
  }));
}
```

- [ ] **Step 2: Replace CO and PO placeholders**

Replace placeholders with:

```tsx
if (activeTab === "change-orders") {
  return (
    <ChangeOrdersSection
      job={props.job}
      onApproveCos={props.onApproveCos}
      onStartChangeOrder={props.onStartChangeOrder}
      onUpdateCoStatus={props.onUpdateCoStatus}
    />
  );
}

if (activeTab === "purchase-orders") {
  return (
    <PurchaseOrdersSection
      job={props.job}
      draft={poDraft}
      setDraft={setPoDraft}
      onSubmit={addPurchaseOrder}
      onEditPurchaseOrder={props.onEditPurchaseOrder}
      onPurchaseOrderFile={props.onPurchaseOrderFile}
    />
  );
}
```

- [ ] **Step 3: Add `ChangeOrdersSection`**

Use the current modal `Change Orders` JSX and wrap it as:

```tsx
function ChangeOrdersSection({
  job,
  onApproveCos,
  onStartChangeOrder,
  onUpdateCoStatus
}: {
  job: Job;
  onApproveCos: JobDetailPageProps["onApproveCos"];
  onStartChangeOrder: JobDetailPageProps["onStartChangeOrder"];
  onUpdateCoStatus: JobDetailPageProps["onUpdateCoStatus"];
}) {
  const coSummary = summarizeChangeOrders(job.changeOrders);
  return (
    <section className="job-page-section" id="job-change-orders">
      {/* paste current change order header and financial-card-grid here */}
    </section>
  );
}
```

- [ ] **Step 4: Add `PurchaseOrdersSection`**

Use the current modal `Subcontracts / POs` JSX and wrap it as:

```tsx
function PurchaseOrdersSection({
  job,
  draft,
  setDraft,
  onSubmit,
  onEditPurchaseOrder,
  onPurchaseOrderFile
}: {
  job: Job;
  draft: PurchaseOrderDraft;
  setDraft: React.Dispatch<React.SetStateAction<PurchaseOrderDraft>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onEditPurchaseOrder: JobDetailPageProps["onEditPurchaseOrder"];
  onPurchaseOrderFile: JobDetailPageProps["onPurchaseOrderFile"];
}) {
  const poSummary = summarizePurchaseOrders(job.purchaseOrders, today);
  return (
    <section className="job-page-section" id="job-purchase-orders">
      {/* paste current PO create form and financial-card-grid here */}
    </section>
  );
}
```

- [ ] **Step 5: Run typecheck**

Run:

```powershell
npm.cmd run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit Task 8**

Run:

```powershell
git add src/components/job-detail/JobDetailPage.tsx
git commit -m "Move financial job sections into cockpit"
```

---

### Task 9: Migrate Files, Notes, And Activity Sections

**Files:**

- Modify: `src/components/job-detail/JobDetailPage.tsx`

- [ ] **Step 1: Replace files placeholder**

Add:

```tsx
function FilesSection({
  job,
  canEditHeader,
  onJobFile
}: {
  job: Job;
  canEditHeader: boolean;
  onJobFile: JobDetailPageProps["onJobFile"];
}) {
  return (
    <section className="job-page-section" id="job-files">
      <h3>50 Files</h3>
      {!canEditHeader ? <p className="permission-note">PM or admin role required to attach job files.</p> : null}
      <div className="file-slots">
        {fileSlots.map((slot) => {
          const file = job.files.find((candidate) => candidate.ownerType === "job" && candidate.slot === slot);
          return (
            <label className={file ? "file-slot filled" : "file-slot"} key={slot}>
              <span>{slot}</span>
              <strong>{file ? <FileLink file={file} /> : "Missing"}</strong>
              <input
                disabled={!canEditHeader}
                onChange={(event) => {
                  onJobFile(job.id, slot, event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
                type="file"
              />
            </label>
          );
        })}
      </div>
    </section>
  );
}
```

Wire it:

```tsx
if (activeTab === "files") {
  return <FilesSection job={props.job} canEditHeader={props.canEditHeader ?? true} onJobFile={props.onJobFile} />;
}
```

- [ ] **Step 2: Replace notes placeholder**

Add:

```tsx
function NotesSection({
  job,
  pmNotes,
  onCreatePmNote,
  onDeletePmNote,
  onUpdatePmNoteStatus,
  onUpdatePmNoteText
}: {
  job: Job;
  pmNotes: PMNote[];
  onCreatePmNote: JobDetailPageProps["onCreatePmNote"];
  onDeletePmNote: JobDetailPageProps["onDeletePmNote"];
  onUpdatePmNoteStatus: JobDetailPageProps["onUpdatePmNoteStatus"];
  onUpdatePmNoteText: JobDetailPageProps["onUpdatePmNoteText"];
}) {
  const jobActions = buildPmActionItems({ jobs: [job], notes: pmNotes, today }).slice(0, 12);
  return (
    <section className="job-page-section" id="job-notes">
      <div className="modal-section-head">
        <h3>60 Notes</h3>
        <button className="primary" onClick={() => onCreatePmNote(`Follow up on ${job.jobNumber}`, job.id)} type="button">Add note</button>
      </div>
      <PMActionBoard
        actions={jobActions}
        compact
        jobs={[job]}
        onCreateNote={(text) => onCreatePmNote(text, job.id)}
        onDeleteNote={onDeletePmNote}
        onUpdateNoteText={onUpdatePmNoteText}
        onUpdateNoteStatus={onUpdatePmNoteStatus}
        title="PM notes"
      />
    </section>
  );
}
```

`PMActionBoard` currently lives in `src/app/page.tsx`. For this to compile, either:

1. Move `PMActionBoard` into `src/components/job-detail/JobDetailPage.tsx`, or
2. Extract it to `src/components/PMActionBoard.tsx` and import it in both files.

Use option 2 if time allows. Use option 1 if this slice is already too large.

- [ ] **Step 3: Replace activity placeholder with final section**

Add:

```tsx
function ActivitySection({ job }: { job: Job }) {
  return (
    <section className="job-page-section" id="job-activity">
      <h3>70 Activity</h3>
      {job.activity.length ? job.activity.map((event) => (
        <p className="activity" key={event.id}><strong>{event.author}</strong> {event.message} <span>{event.createdAt}</span></p>
      )) : <div className="empty-note">No activity yet.</div>}
    </section>
  );
}
```

- [ ] **Step 4: Run typecheck**

Run:

```powershell
npm.cmd run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit Task 9**

Run:

```powershell
git add src/components/job-detail/JobDetailPage.tsx src/components/PMActionBoard.tsx src/app/page.tsx
git commit -m "Move files notes and activity into job cockpit"
```

If `src/components/PMActionBoard.tsx` was not created, omit it from `git add`.

---

### Task 10: Remove Primary Job Detail Modal

**Files:**

- Modify: `src/app/page.tsx`

- [ ] **Step 1: Remove fallback modal rendering**

Delete the old fallback:

```tsx
{detailJobData && !isJobRoute ? (
  <JobDetailModal ... />
) : null}
```

All job opening should use `openJobRoute`.

- [ ] **Step 2: Delete `JobDetailModal` only after all sections compile**

Remove the full `function JobDetailModal(...) { ... }` block from `src/app/page.tsx`.

If deleting it creates missing helper errors, move needed helpers into `JobDetailPage.tsx` or a focused shared component. Do not leave the old large modal as dead code.

- [ ] **Step 3: Confirm no callers remain**

Run:

```powershell
rg -n "JobDetailModal|setDetailJobId\\(|onOpenJob=\\{setDetailJobId\\}" src/app/page.tsx src/components
```

Expected:

```text
No JobDetailModal matches.
No onOpenJob={setDetailJobId} matches.
```

`setDetailJobId` may still appear inside persistence reconciliation and route state, which is acceptable.

- [ ] **Step 4: Run typecheck**

Run:

```powershell
npm.cmd run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit Task 10**

Run:

```powershell
git add src/app/page.tsx src/components/job-detail/JobDetailPage.tsx
git commit -m "Replace job detail modal with cockpit route"
```

---

### Task 11: Browser Smoke And Full Verification

**Files:**

- Modify only if smoke finds defects.

- [ ] **Step 1: Run automated checks**

Run:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Expected:

```text
typecheck passes
104+ tests pass
build compiles successfully
```

- [ ] **Step 2: Start or restart local dev server**

If the server is not running:

```powershell
cd "C:\Users\escal\Documents\Codex\2026-05-07\github-plugin-github-openai-curated-superpowers\Estimating-Suite-clean"
npm.cmd run dev
```

If stale Next chunks appear, stop the dev server, delete `.next`, and restart:

```powershell
Remove-Item -LiteralPath ".next" -Recurse -Force
npm.cmd run dev
```

- [ ] **Step 3: Browser smoke flow**

Use the Browser plugin, not external Chrome, when available.

Flow under test:

```text
/#jobs -> click a job -> #job/G26-042 -> switch Dewey tabs -> edit schedule field -> return to Jobs
```

Required checks:

- Page title is `Estimating Suite`.
- No Next runtime overlay.
- Console has no relevant errors.
- `#job/G26-042` route appears after opening a job.
- Sidebar is collapsed on the job route.
- Dewey tabs are visible.
- `00 Overview`, `10 Schedule`, `20 Submittals`, `30 COs`, `40 POs`, `50 Files`, `60 Notes`, `70 Activity` are visible.
- Back button returns to `#jobs`.

- [ ] **Step 4: Signed-in persistence smoke**

If signed in as admin:

1. Open an existing persisted job route.
2. Change install start/end or crew.
3. Add a PM note.
4. Upload a tiny job file to a safe slot.
5. Change one submitted CO status if a test CO exists.
6. Refresh.
7. Confirm those records remain.

If signed out, document that live persistence smoke was not run and why.

- [ ] **Step 5: Commit smoke fixes**

If any code was changed during smoke:

```powershell
git add src
git commit -m "Fix job cockpit smoke issues"
```

---

## Self-Review Checklist

- [ ] Spec coverage: route, auto-collapse, sticky header, alert strip, Dewey tabs, no primary modal, persistence boundary, and browser smoke are all covered.
- [ ] No broad integrations slipped in.
- [ ] No PO PDF or Job Cost implementation slipped in.
- [ ] No new direct Supabase calls inside `JobDetailPage`.
- [ ] No new legacy CDN files.
- [ ] `src/app/page.tsx` gets smaller or at least stops growing around Job Detail.
- [ ] Tests cover route helpers and tab metadata.
- [ ] Browser smoke covers the new route and tab interaction.

