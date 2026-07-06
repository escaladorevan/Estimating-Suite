"use client";

import { useMemo, useState, type ChangeEvent, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { changeOrderActionLabel, changeOrderContractImpactLabel, changeOrderNextStatuses } from "@/lib/change-order-actions";
import { jobDetailTabs, type JobDetailTabId } from "@/lib/job-detail-tabs";
import { currentContractValue, jobCostSummary, summarizeChangeOrders, summarizePurchaseOrders } from "@/lib/job-financials";
import { buildPmActionItems } from "@/lib/pm-actions";
import { fileSlots } from "@/lib/sample-data";
import { setSubmittalChecklistState, summarizeSubmittals, type SubmittalAction } from "@/lib/submittals";
import {
  BACKLOG_STATUSES,
  PURCHASE_ORDER_STATUSES,
  SUBMITTAL_STATUSES
} from "@/lib/status-constants";
import type { ChangeOrderStatus, Job, PMNote, ProjectFile, PurchaseOrderScope, PurchaseOrderStatus, SubmittalPackage } from "@/types";
import type { JobDetailPageProps, PurchaseOrderDraft, SubmittalDraft } from "./job-detail-page-types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const today = "2026-05-09";
const primaryDocumentSlots = ["drawings", "specs", "schedule", "contract", "proposal", "submittals"];
const submittalTypes: SubmittalPackage["type"][] = ["Shop Drawings", "Finish Samples", "Hardware", "Engineering", "Other"];
const purchaseOrderScopes: PurchaseOrderScope[] = ["Stone / Quartz", "Cambria", "Solid Surface", "Glass", "Metal", "Install Labor", "Other"];

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
  const [submittalDraft, setSubmittalDraft] = useState<SubmittalDraft>({
    name: "",
    type: "Shop Drawings",
    dueDate: "",
    owner: job.pm,
    releaseBlocker: true,
    notes: ""
  });
  const [poDraft, setPoDraft] = useState<PurchaseOrderDraft>({
    poNumber: nextPoNumber(job),
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

  const coSummary = summarizeChangeOrders(job.changeOrders);
  const currentValue = currentContractValue(job.baseContract, job.changeOrders);
  const poSummary = summarizePurchaseOrders(job.purchaseOrders, today);
  const costSummary = jobCostSummary(job, today);
  const submittalSummary = summarizeSubmittals(job.submittals, today);
  const jobNotes = pmNotes.filter((note) => note.jobId === job.id);
  const openNoteCount = jobNotes.filter((note) => note.status !== "Done").length;
  const documentCount = primaryDocumentSlots.filter((slot) => job.files.some((file) => file.slot === slot)).length;
  const shopDrawingPackage = job.submittals.find((item) => item.type === "Shop Drawings" || item.name.toLowerCase().includes("shop"));
  const materialStatus = job.purchaseOrders.length === 0
    ? "Needs PO review"
    : job.purchaseOrders.some((po) => po.status === "Draft")
      ? "PO needs issue"
      : "Ordered / tracking";
  const releaseBlockers = [
    !job.installStart ? "Install dates missing" : "",
    documentCount < primaryDocumentSlots.length ? "Core docs missing" : "",
    shopDrawingPackage && !["Approved", "Approved as Noted"].includes(shopDrawingPackage.status) ? "Shop drawings need review" : "",
    materialStatus !== "Ordered / tracking" ? materialStatus : "",
    coSummary.submitted ? `${money.format(coSummary.submitted)} submitted COs` : "",
    openNoteCount ? `${openNoteCount} open note${openNoteCount === 1 ? "" : "s"}` : ""
  ].filter(Boolean);

  function addSubmittal(event: FormEvent<HTMLFormElement>) {
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

  function addPurchaseOrder(event: FormEvent<HTMLFormElement>) {
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
      poNumber: `PO-${job.jobNumber}-${String(job.purchaseOrders.length + 2).padStart(3, "0")}`,
      vendor: "",
      description: "",
      committedAmount: "",
      neededBy: "",
      promisedDate: "",
      notes: ""
    }));
  }

  return (
    <div className="job-page">
      <div className="job-breadcrumb">
        <button onClick={onBackToJobs} type="button">Jobs</button>
        <span>/</span>
        <strong>{job.jobNumber}</strong>
        <span>/</span>
        <span>{job.projectName}</span>
        <button className="job-cockpit-close" onClick={onBackToJobs} type="button">Close</button>
      </div>

      <header className="job-command-header">
        <div className="job-command-title">
          <span className="eyebrow">{job.jobNumber} - PM {job.pm || "TBD"}</span>
          <h2>{job.projectName}</h2>
          <p>{job.client} - GC {job.gc || "TBD"} - Bid ref {job.bidRef || "TBD"}</p>
          <div className="job-command-meta">
            <Status value={job.backlogStatus} />
            <span>{job.workType || "Bid / ITB"}</span>
            <span>{job.contacts?.length ?? 0} contacts</span>
          </div>
        </div>
        <div className="job-command-facts">
          <article className="fact-money"><span>Current contract</span><strong>{money.format(currentValue)}</strong><small>Base {money.format(job.baseContract)} + approved COs</small></article>
          <article><span>Install window</span><strong>{formatInstallWindow(job.installStart, job.installEnd)}</strong><small>{installDuration(job.installStart, job.installEnd)} - crew {job.crewSize || "TBD"}</small></article>
          <article className={releaseBlockers.length ? "fact-alert" : "fact-good"}><span>PM attention</span><strong>{releaseBlockers.length || "Clear"}</strong><small>{releaseBlockers[0] || "No immediate blockers"}</small></article>
        </div>
        <div className="job-command-actions">
          <button className="primary" onClick={() => props.onSendHandoff(job.id)} type="button">Send to PM</button>
          <button className="primary" onClick={() => onStartChangeOrder(job.id)} type="button">New CO</button>
          <button className="primary muted-action" onClick={() => setActiveTab("purchase-orders")} type="button">Add PO</button>
          <button className="primary muted-action" onClick={() => setActiveTab("files")} type="button">Upload File</button>
          <button className="primary muted-action" onClick={() => onCreatePmNote(`Follow up on ${job.jobNumber}`, job.id)} type="button">Add Note</button>
        </div>
      </header>

      <section className="job-alert-strip">
        {!job.installStart ? <button onClick={() => setActiveTab("schedule")} type="button">Missing install dates</button> : null}
        {documentCount < primaryDocumentSlots.length ? <button onClick={() => setActiveTab("files")} type="button">Core docs missing</button> : null}
        {shopDrawingPackage && !["Approved", "Approved as Noted"].includes(shopDrawingPackage.status) ? <button onClick={() => setActiveTab("submittals")} type="button">Shop drawings need review</button> : null}
        {poSummary.lateCount || materialStatus !== "Ordered / tracking" ? <button onClick={() => setActiveTab("purchase-orders")} type="button">{materialStatus}</button> : null}
        {coSummary.submitted ? <button onClick={() => setActiveTab("change-orders")} type="button">{money.format(coSummary.submitted)} pending COs</button> : null}
        {openNoteCount ? <button onClick={() => setActiveTab("notes")} type="button">{openNoteCount} open notes</button> : null}
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
        <OverviewSection
          contactCount={contacts.length}
          costSummary={costSummary}
          currentValue={currentValue}
          documentCount={documentCount}
          job={job}
          materialStatus={materialStatus}
          openNoteCount={openNoteCount}
          poSummary={poSummary}
          releaseBlockers={releaseBlockers}
          setActiveTab={setActiveTab}
          submittalSummary={submittalSummary}
        />
      ) : null}
      {activeTab === "schedule" ? <ScheduleSection canEditHeader={canEditHeader} job={job} onUpdateJob={onUpdateJob} /> : null}
      {activeTab === "submittals" ? (
        <SubmittalsSection
          draft={submittalDraft}
          job={job}
          onEditSubmittal={props.onEditSubmittal}
          onSubmit={addSubmittal}
          onSubmittalAction={props.onSubmittalAction}
          onSubmittalChecklist={props.onSubmittalChecklist}
          onSubmittalFile={props.onSubmittalFile}
          setDraft={setSubmittalDraft}
        />
      ) : null}
      {activeTab === "change-orders" ? (
        <ChangeOrdersSection
          job={job}
          onApproveCos={props.onApproveCos}
          onExportChangeOrderPdf={props.onExportChangeOrderPdf}
          onStartChangeOrder={props.onStartChangeOrder}
          onUpdateCoStatus={props.onUpdateCoStatus}
        />
      ) : null}
      {activeTab === "purchase-orders" ? (
        <PurchaseOrdersSection
          draft={poDraft}
          job={job}
          onEditPurchaseOrder={props.onEditPurchaseOrder}
          onPurchaseOrderFile={props.onPurchaseOrderFile}
          onSubmit={addPurchaseOrder}
          setDraft={setPoDraft}
        />
      ) : null}
      {activeTab === "files" ? <FilesSection canEditHeader={canEditHeader} job={job} onJobFile={props.onJobFile} /> : null}
      {activeTab === "notes" ? (
        <NotesSection
          job={job}
          onCreatePmNote={props.onCreatePmNote}
          onDeletePmNote={props.onDeletePmNote}
          onUpdatePmNoteStatus={props.onUpdatePmNoteStatus}
          onUpdatePmNoteText={props.onUpdatePmNoteText}
          pmNotes={jobNotes}
        />
      ) : null}
      {activeTab === "activity" ? <ActivitySection job={job} /> : null}
    </div>
  );
}

function OverviewSection({
  contactCount,
  costSummary,
  currentValue,
  documentCount,
  job,
  materialStatus,
  openNoteCount,
  poSummary,
  releaseBlockers,
  setActiveTab,
  submittalSummary
}: {
  contactCount: number;
  costSummary: ReturnType<typeof jobCostSummary>;
  currentValue: number;
  documentCount: number;
  job: Job;
  materialStatus: string;
  openNoteCount: number;
  poSummary: ReturnType<typeof summarizePurchaseOrders>;
  releaseBlockers: string[];
  setActiveTab: (tab: JobDetailTabId) => void;
  submittalSummary: ReturnType<typeof summarizeSubmittals>;
}) {
  const scheduleReady = Boolean(job.installStart);
  const submittalsReady = submittalSummary.releaseState === "Ready" || submittalSummary.releaseState === "No Packages";
  const materialsReady = materialStatus === "Ordered / tracking";
  const docsReady = documentCount >= primaryDocumentSlots.length;
  const coSummary = summarizeChangeOrders(job.changeOrders);

  return (
    <section className="job-page-section cockpit-overview">
      <div className="overview-primary">
        <article className={scheduleReady ? "question-card ready" : "question-card needs-action"}>
          <span>Install plan</span>
          <strong>{formatInstallWindow(job.installStart, job.installEnd)}</strong>
          <small>{installDuration(job.installStart, job.installEnd)} - crew {job.crewSize || "TBD"}</small>
          <button onClick={() => setActiveTab("schedule")} type="button">{scheduleReady ? "Adjust schedule" : "Set install"}</button>
        </article>
        <article className={submittalsReady ? "question-card ready" : "question-card needs-action"}>
          <span>Shop drawings</span>
          <strong>{submittalSummary.label}</strong>
          <small>{submittalSummary.releaseState} - {submittalSummary.blockingCount} blocking</small>
          <button onClick={() => setActiveTab("submittals")} type="button">Open submittals</button>
        </article>
        <article className={materialsReady ? "question-card ready" : "question-card needs-action"}>
          <span>Materials / vendors</span>
          <strong>{materialStatus}</strong>
          <small>{poSummary.count} POs - {money.format(poSummary.openCommitment)} open</small>
          <button onClick={() => setActiveTab("purchase-orders")} type="button">{materialsReady ? "Review POs" : "Add PO"}</button>
        </article>
        <article className={docsReady ? "question-card ready" : "question-card needs-action"}>
          <span>Job documents</span>
          <strong>{documentCount}/{primaryDocumentSlots.length} attached</strong>
          <small>{openNoteCount} notes - {contactCount} contacts</small>
          <button onClick={() => setActiveTab("files")} type="button">{docsReady ? "Open files" : "Upload docs"}</button>
        </article>
      </div>

      <div className="overview-secondary">
        <article>
          <span>Contract health</span>
          <strong>{money.format(currentValue)}</strong>
          <small>Approved COs {money.format(coSummary.approved)} - submitted {money.format(coSummary.submitted)}</small>
        </article>
        <article>
          <span>Projected cost</span>
          <strong>{money.format(costSummary.projectedCost)}</strong>
          <small>{costSummary.projectedMarginPct === null ? "Margin TBD" : `${costSummary.projectedMarginPct}% projected margin`}</small>
        </article>
        <article className={releaseBlockers.length ? "attention-list active" : "attention-list"}>
          <span>Attention list</span>
          <strong>{releaseBlockers.length ? `${releaseBlockers.length} items` : "Clear"}</strong>
          <small>{releaseBlockers.slice(0, 3).join(" - ") || "Nothing critical flagged."}</small>
        </article>
      </div>

      {job.notes ? <p className="job-page-note">{job.notes}</p> : null}
    </section>
  );
}

function ScheduleSection({ canEditHeader, job, onUpdateJob }: { canEditHeader: boolean; job: Job; onUpdateJob: JobDetailPageProps["onUpdateJob"] }) {
  return (
    <section className="job-page-section schedule-section">
      <div className="modal-section-head">
        <div>
          <h3>10 Schedule</h3>
          <p>PM-owned planning fields for fabrication, installation, crew, and billing status.</p>
        </div>
        {!canEditHeader ? <span className="permission-note">Read-only role</span> : null}
      </div>
      <div className="schedule-status-strip">
        <article><span>Install</span><strong>{formatInstallWindow(job.installStart, job.installEnd)}</strong><small>{installDuration(job.installStart, job.installEnd)}</small></article>
        <article><span>Crew</span><strong>{job.crewSize || "TBD"}</strong><small>Install manpower</small></article>
        <article><span>Fabrication</span><strong>{job.fabStatus}</strong><small>Shop status</small></article>
        <article><span>Invoice</span><strong>{job.invoiceStatus}</strong><small>Billing status</small></article>
      </div>
      <div className="job-schedule-grid">
        <label>Backlog status
          <select disabled={!canEditHeader} onChange={(event) => onUpdateJob(job.id, { backlogStatus: event.target.value as Job["backlogStatus"] })} value={job.backlogStatus}>
            {BACKLOG_STATUSES.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <label>Install start
          <input disabled={!canEditHeader} onChange={(event) => onUpdateJob(job.id, { installStart: event.target.value })} type="date" value={job.installStart} />
        </label>
        <label>Install end
          <input disabled={!canEditHeader} onChange={(event) => onUpdateJob(job.id, { installEnd: event.target.value })} type="date" value={job.installEnd} />
        </label>
        <label>Crew size
          <input disabled={!canEditHeader} min="0" onChange={(event) => onUpdateJob(job.id, { crewSize: Number(event.target.value) || 0 })} type="number" value={job.crewSize} />
        </label>
        <label>Fab status
          <select disabled={!canEditHeader} onChange={(event) => onUpdateJob(job.id, { fabStatus: event.target.value as Job["fabStatus"] })} value={job.fabStatus}>
            {["Not Started", "In Fabrication", "Ready", "Complete"].map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <label>Invoice status
          <select disabled={!canEditHeader} onChange={(event) => onUpdateJob(job.id, { invoiceStatus: event.target.value as Job["invoiceStatus"] })} value={job.invoiceStatus}>
            {["Not Billed", "Partial", "Billed", "Paid"].map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
      </div>
    </section>
  );
}

function SubmittalsSection({
  draft,
  job,
  onEditSubmittal,
  onSubmit,
  onSubmittalAction,
  onSubmittalChecklist,
  onSubmittalFile,
  setDraft
}: {
  draft: SubmittalDraft;
  job: Job;
  onEditSubmittal: JobDetailPageProps["onEditSubmittal"];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSubmittalAction: JobDetailPageProps["onSubmittalAction"];
  onSubmittalChecklist: JobDetailPageProps["onSubmittalChecklist"];
  onSubmittalFile: JobDetailPageProps["onSubmittalFile"];
  setDraft: Dispatch<SetStateAction<SubmittalDraft>>;
}) {
  const summary = summarizeSubmittals(job.submittals, today);
  const blockingCount = job.submittals.filter((item) => item.releaseBlocker && !["Approved", "Approved as Noted", "Void / Not Required"].includes(item.status)).length;
  const waitingCount = job.submittals.filter((item) => ["Submitted", "Resubmitted"].includes(item.status)).length;
  const approvedCount = job.submittals.filter((item) => ["Approved", "Approved as Noted", "Void / Not Required"].includes(item.status)).length;
  return (
    <section className="job-page-section submittals-workspace">
      <div className="modal-section-head submittals-head">
        <div>
          <h3>20 Submittals</h3>
          <p>{summary.label} - {summary.releaseState}</p>
        </div>
        <div className="submittal-summary-pills" aria-label="Submittal summary">
          <span className={blockingCount ? "attention" : ""}>{blockingCount} blocking</span>
          <span>{waitingCount} waiting</span>
          <span>{approvedCount} ready</span>
        </div>
      </div>
      <form className="submittal-create submittal-command-row" onSubmit={onSubmit}>
        <div className="submittal-command-title">
          <span>New package</span>
          <strong>Add a submittal tracker</strong>
        </div>
        <input aria-label="Package name" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Package name" value={draft.name} />
        <select aria-label="Package type" onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as SubmittalPackage["type"] }))} value={draft.type}>
          {submittalTypes.map((type) => <option key={type}>{type}</option>)}
        </select>
        <input aria-label="Due date" onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} type="date" value={draft.dueDate} />
        <input aria-label="Owner" onChange={(event) => setDraft((current) => ({ ...current, owner: event.target.value }))} placeholder="Owner" value={draft.owner} />
        <label className="compact-check">
          <input checked={draft.releaseBlocker} onChange={(event) => setDraft((current) => ({ ...current, releaseBlocker: event.target.checked }))} type="checkbox" />
          Release blocker
        </label>
        <button className="primary" type="submit">Add</button>
      </form>
      <div className="submittal-card-grid">
        {job.submittals.map((item) => {
          const isApproved = ["Approved", "Approved as Noted"].includes(item.status);
          const needsRevision = item.status === "Rejected / Revise and Resubmit";
          const isNotRequired = item.status === "Void / Not Required";
          const attachedFiles = job.files.filter((file) => file.ownerType === "submittal" && file.ownerId === item.id);
          const nextActions = submittalActionsFor(item.status);
          return (
            <article className={`submittal-card ${isApproved || isNotRequired ? "approved" : needsRevision ? "revise" : item.releaseBlocker ? "blocked" : ""}`} key={item.id}>
              <div className="submittal-card-head">
                <div>
                  <span>{item.type}</span>
                  <h4>{item.name}</h4>
                  <p>{item.releaseBlocker ? "Blocks release until ready" : "Tracking only"}</p>
                </div>
                <div className="submittal-card-state">
                  <Status value={item.status} />
                  <span className={item.releaseBlocker ? "release-pill blocker" : "release-pill"}>{item.releaseBlocker ? "Release blocker" : "Non-blocking"}</span>
                </div>
              </div>
              <div className="submittal-card-meta">
                <div><span>Due</span><strong>{item.dueDate ? formatDate(item.dueDate) : "TBD"}</strong></div>
                <div><span>Owner</span><strong>{item.owner || job.pm}</strong></div>
                <div><span>Revision</span><strong>Rev {item.revision}</strong></div>
                <div><span>Files</span><strong>{attachedFiles.length ? `${attachedFiles.length} attached` : "None"}</strong></div>
              </div>
              <div className="submittal-quick-actions">
                {nextActions.map((action) => (
                  <button className={action === "notRequired" ? "muted-danger" : action === "approve" || action === "approveAsNoted" ? "good-action" : ""} key={action} onClick={() => onSubmittalAction(job.id, item.id, action)} type="button">{formatSubmittalAction(action)}</button>
                ))}
              </div>
              <div className="submittal-checks">
                <label>
                  <input checked={Boolean(item.submittedDate)} onChange={(event) => onSubmittalChecklist(job.id, item.id, { submitted: event.target.checked })} type="checkbox" />
                  Submitted
                </label>
                <label>
                  <input checked={["Approved", "Approved as Noted"].includes(item.status)} onChange={(event) => onSubmittalChecklist(job.id, item.id, { approved: event.target.checked })} type="checkbox" />
                  Approved
                </label>
                <label>
                  <input checked={item.status === "Rejected / Revise and Resubmit"} onChange={(event) => onSubmittalChecklist(job.id, item.id, { revise: event.target.checked })} type="checkbox" />
                  Needs revision
                </label>
              </div>
              <div className="package-files">
                <label>
                  Attach package file
                  <input onChange={(event) => handleFileInput(event, (file) => onSubmittalFile(job.id, item.id, file))} type="file" />
                </label>
                {attachedFiles.map((file) => <span key={file.id}><FileLink file={file} /></span>)}
                <select onChange={(event) => onEditSubmittal(job.id, item.id, { status: event.target.value as SubmittalPackage["status"] })} value={item.status}>
                  {SUBMITTAL_STATUSES.map((status) => <option key={status}>{status}</option>)}
                </select>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ChangeOrdersSection({
  job,
  onApproveCos,
  onExportChangeOrderPdf,
  onStartChangeOrder,
  onUpdateCoStatus
}: {
  job: Job;
  onApproveCos: JobDetailPageProps["onApproveCos"];
  onExportChangeOrderPdf: JobDetailPageProps["onExportChangeOrderPdf"];
  onStartChangeOrder: JobDetailPageProps["onStartChangeOrder"];
  onUpdateCoStatus: JobDetailPageProps["onUpdateCoStatus"];
}) {
  const coSummary = summarizeChangeOrders(job.changeOrders);
  const activeExposure = coSummary.priced + coSummary.sent + coSummary.submitted + coSummary.pending;
  const rejectedOrVoid = coSummary.rejected + coSummary.void;
  const submittedCount = job.changeOrders.filter((co) => co.status === "submitted" || co.status === "pending").length;
  return (
    <section className="job-page-section change-orders-workspace">
      <div className="modal-section-head submittals-head">
        <div>
          <h3>30 COs</h3>
          <p>{job.changeOrders.length} total - {money.format(activeExposure)} open exposure</p>
        </div>
        <div className="submittal-summary-pills" aria-label="Change order summary">
          <span>{money.format(coSummary.approved)} approved</span>
          <span className={activeExposure ? "attention" : ""}>{money.format(activeExposure)} open</span>
          <span>{submittedCount} awaiting GC</span>
          <span>{money.format(rejectedOrVoid)} inactive</span>
        </div>
      </div>

      <div className="co-command-row">
        <div className="submittal-command-title">
          <span>Pricing source</span>
          <strong>Build or revise CO scope in Bid Workbook</strong>
        </div>
        <button className="primary" onClick={() => onStartChangeOrder(job.id)} type="button">Build CO in Workbook</button>
        {job.changeOrders.some((co) => co.status === "submitted") ? (
          <button className="ghost-button compact" onClick={() => onApproveCos(job.id)} type="button">Approve submitted COs</button>
        ) : null}
      </div>

      <div className="co-contract-strip">
        <article><span>Base contract</span><strong>{money.format(job.baseContract)}</strong><small>Original award</small></article>
        <article><span>Approved COs</span><strong>{money.format(coSummary.approved)}</strong><small>Added to contract</small></article>
        <article className={activeExposure ? "attention" : ""}><span>Open exposure</span><strong>{money.format(activeExposure)}</strong><small>Priced / sent / submitted / pending</small></article>
        <article className="current"><span>Current contract</span><strong>{money.format(currentContractValue(job.baseContract, job.changeOrders))}</strong><small>Base plus approved COs</small></article>
      </div>

      {job.changeOrders.length ? (
        <div className="financial-card-grid co-card-grid">
          {job.changeOrders.map((co) => {
            const nextStatuses = changeOrderNextStatuses(co.status);
            const attachedFiles = job.files.filter((file) => file.ownerType === "change_order" && file.ownerId === co.id);
            return (
            <article className={`financial-card co-card ${changeOrderCardClass(co.status)}`} key={co.id}>
              <div className="financial-card-head">
                <div>
                  <span>{co.number}</span>
                  <h4>{co.description}</h4>
                  <p>{changeOrderContractImpactLabel(co)}</p>
                </div>
                <div className="submittal-card-state">
                  <Status value={co.status} />
                  <span className={co.status === "approved" ? "release-pill approved" : activeChangeOrderStatuses.includes(co.status) ? "release-pill blocker" : "release-pill"}>{changeOrderStageLabel(co.status)}</span>
                </div>
              </div>
              <div className="financial-card-meta co-card-meta">
                <div><span>Amount</span><strong>{money.format(co.amount)}</strong></div>
                <div><span>Submitted</span><strong>{co.dateSubmitted ? formatDate(co.dateSubmitted) : "TBD"}</strong></div>
                <div><span>Approved</span><strong>{co.approvedDate ? formatDate(co.approvedDate) : "-"}</strong></div>
                <div><span>Files</span><strong>{attachedFiles.length ? `${attachedFiles.length} attached` : "None"}</strong></div>
              </div>
              {co.notes ? <p className="co-card-note">{co.notes}</p> : null}
              <div className="financial-card-actions">
                {nextStatuses.map((status) => (
                  <button className={changeOrderActionClass(status)} key={status} onClick={() => onUpdateCoStatus(job.id, co.id, status)} type="button">
                    {changeOrderActionLabel(status)}
                  </button>
                ))}
                <button className="primary" onClick={() => onExportChangeOrderPdf(job.id, co.id)} type="button">Generate PDF</button>
                <button className="primary muted-action" onClick={() => onStartChangeOrder(job.id)} type="button">Price revision</button>
              </div>
            </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-card">
          <strong>No change orders yet.</strong>
          <span>Use the Bid Workbook to price added scope, then submit it back to this job.</span>
          <button className="primary" onClick={() => onStartChangeOrder(job.id)} type="button">Build first CO</button>
        </div>
      )}
    </section>
  );
}

const activeChangeOrderStatuses: ChangeOrderStatus[] = ["priced", "sent", "submitted", "pending"];

function changeOrderStageLabel(status: ChangeOrderStatus): string {
  if (status === "approved") return "In contract";
  if (status === "rejected" || status === "void") return "Inactive";
  if (status === "draft") return "Internal";
  return "Open";
}

function changeOrderCardClass(status: ChangeOrderStatus): string {
  if (status === "approved") return "approved";
  if (status === "rejected" || status === "void") return "inactive";
  if (activeChangeOrderStatuses.includes(status)) return "warn";
  return "";
}

function changeOrderActionClass(status: ChangeOrderStatus): string {
  if (status === "approved") return "primary good-action";
  if (status === "rejected" || status === "void") return "primary muted-action";
  return "primary";
}

function PurchaseOrdersSection({
  draft,
  job,
  onEditPurchaseOrder,
  onPurchaseOrderFile,
  onSubmit,
  setDraft
}: {
  draft: PurchaseOrderDraft;
  job: Job;
  onEditPurchaseOrder: JobDetailPageProps["onEditPurchaseOrder"];
  onPurchaseOrderFile: JobDetailPageProps["onPurchaseOrderFile"];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setDraft: Dispatch<SetStateAction<PurchaseOrderDraft>>;
}) {
  const poSummary = summarizePurchaseOrders(job.purchaseOrders, today);
  const draftCount = job.purchaseOrders.filter((po) => po.status === "Draft").length;
  const openCount = job.purchaseOrders.filter((po) => !["Complete", "Closed", "Void"].includes(po.status)).length;
  return (
    <section className="job-page-section purchase-orders-workspace">
      <div className="modal-section-head submittals-head">
        <div>
          <h3>40 POs</h3>
          <p>{poSummary.count} total - {money.format(poSummary.openCommitment)} open commitment</p>
        </div>
        <div className="submittal-summary-pills" aria-label="Purchase order summary">
          <span>{money.format(poSummary.committed)} committed</span>
          <span>{openCount} open</span>
          <span className={poSummary.lateCount ? "attention" : ""}>{poSummary.lateCount} late</span>
          <span className={draftCount ? "attention" : ""}>{draftCount} draft</span>
        </div>
      </div>
      <form className="submittal-create purchase-order-command-row" onSubmit={onSubmit}>
        <div className="submittal-command-title">
          <span>New PO</span>
          <strong>Track a vendor commitment</strong>
        </div>
        <input aria-label="PO number" onChange={(event) => setDraft((current) => ({ ...current, poNumber: event.target.value }))} placeholder="PO number" value={draft.poNumber} />
        <input aria-label="Vendor" onChange={(event) => setDraft((current) => ({ ...current, vendor: event.target.value }))} placeholder="Vendor" value={draft.vendor} />
        <select aria-label="Scope" onChange={(event) => setDraft((current) => ({ ...current, scope: event.target.value as PurchaseOrderScope }))} value={draft.scope}>
          {purchaseOrderScopes.map((scope) => <option key={scope}>{scope}</option>)}
        </select>
        <input aria-label="Committed amount" onChange={(event) => setDraft((current) => ({ ...current, committedAmount: event.target.value }))} placeholder="Committed $" value={draft.committedAmount} />
        <input aria-label="Needed by" onChange={(event) => setDraft((current) => ({ ...current, neededBy: event.target.value }))} type="date" value={draft.neededBy} />
        <button className="primary" type="submit">Add</button>
      </form>
      <div className="financial-card-grid po-card-grid">
        {job.purchaseOrders.map((po) => {
          const isClosed = ["Complete", "Closed"].includes(po.status);
          const isLate = Boolean(po.promisedDate && po.promisedDate < today && !["Complete", "Closed", "Void"].includes(po.status));
          const attachedFiles = job.files.filter((file) => file.ownerType === "purchase_order" && file.ownerId === po.id);
          const nextStatuses = purchaseOrderNextStatuses(po.status);
          return (
          <article className={`financial-card po-card ${po.status === "Draft" ? "warn" : isClosed ? "approved" : isLate ? "late" : ""}`} key={po.id}>
            <div className="financial-card-head">
              <div>
                <span>{po.poNumber}</span>
                <h4>{po.vendor}</h4>
                <p>{po.description || po.scope}</p>
              </div>
              <div className="submittal-card-state">
                <Status value={po.status} />
                <span className={isLate ? "release-pill blocker" : "release-pill"}>{isLate ? "Late" : po.scope}</span>
              </div>
            </div>
            <div className="financial-card-meta po-card-meta">
              <div><span>Committed</span><strong>{money.format(po.committedAmount)}</strong></div>
              <div><span>Needed</span><strong>{po.neededBy ? formatDate(po.neededBy) : "TBD"}</strong></div>
              <div><span>Promised</span><strong>{po.promisedDate ? formatDate(po.promisedDate) : "TBD"}</strong></div>
              <div><span>Files</span><strong>{attachedFiles.length ? `${attachedFiles.length} attached` : "None"}</strong></div>
            </div>
            <div className="financial-card-actions">
              {nextStatuses.map((status) => (
                <button className={["Complete", "Closed"].includes(status) ? "primary good-action" : status === "Void" ? "primary muted-action" : "primary"} key={status} onClick={() => onEditPurchaseOrder(job.id, po.id, { status })} type="button">
                  {purchaseOrderActionLabel(status)}
                </button>
              ))}
              <select onChange={(event) => onEditPurchaseOrder(job.id, po.id, { status: event.target.value as PurchaseOrderStatus })} value={po.status}>
                {PURCHASE_ORDER_STATUSES.map((status) => <option key={status}>{status}</option>)}
              </select>
              <label className="ghost-button compact">Attach file
                <input onChange={(event) => handleFileInput(event, (file) => onPurchaseOrderFile(job.id, po.id, file))} type="file" />
              </label>
              {attachedFiles.map((file) => <span className="attached-file-pill" key={file.id}><FileLink file={file} /></span>)}
            </div>
          </article>
          );
        })}
      </div>
    </section>
  );
}

function FilesSection({ canEditHeader, job, onJobFile }: { canEditHeader: boolean; job: Job; onJobFile: JobDetailPageProps["onJobFile"] }) {
  return (
    <section className="job-page-section">
      <h3>50 Files</h3>
      {!canEditHeader ? <p className="permission-note">PM or admin role required to attach job files.</p> : null}
      <div className="file-slots">
        {fileSlots.map((slot) => {
          const file = job.files.find((candidate) => candidate.ownerType === "job" && candidate.slot === slot);
          return (
            <label className={file ? "file-slot filled" : "file-slot"} key={slot}>
              <span>{slot}</span>
              <strong>{file ? <FileLink file={file} /> : "Missing"}</strong>
              <input disabled={!canEditHeader} onChange={(event) => handleFileInput(event, (upload) => onJobFile(job.id, slot, upload))} type="file" />
            </label>
          );
        })}
      </div>
    </section>
  );
}

function NotesSection({
  job,
  onCreatePmNote,
  onDeletePmNote,
  onUpdatePmNoteStatus,
  onUpdatePmNoteText,
  pmNotes
}: {
  job: Job;
  onCreatePmNote: JobDetailPageProps["onCreatePmNote"];
  onDeletePmNote: JobDetailPageProps["onDeletePmNote"];
  onUpdatePmNoteStatus: JobDetailPageProps["onUpdatePmNoteStatus"];
  onUpdatePmNoteText: JobDetailPageProps["onUpdatePmNoteText"];
  pmNotes: PMNote[];
}) {
  const [draft, setDraft] = useState("");
  const actions = useMemo(() => buildPmActionItems({ jobs: [job], notes: pmNotes, today }).slice(0, 12), [job, pmNotes]);
  return (
    <section className="job-page-section">
      <div className="modal-section-head">
        <h3>60 Notes</h3>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim()) return;
            onCreatePmNote(draft, job.id);
            setDraft("");
          }}
        >
          <input onChange={(event) => setDraft(event.target.value)} placeholder={`Add note for ${job.jobNumber}`} value={draft} />
          <button className="primary" type="submit">Add note</button>
        </form>
      </div>
      <div className="pm-action-list compact">
        {actions.map((action) => (
          <article className={`pm-action ${action.severity}`} key={action.id}>
            <span>{action.kind}</span>
            <input onBlur={(event) => action.kind === "manual" && onUpdatePmNoteText(action.id, event.target.value)} defaultValue={action.title} />
            <strong>{action.jobNumber || job.jobNumber}</strong>
            {action.kind === "manual" ? (
              <div>
                <button onClick={() => onUpdatePmNoteStatus(action.id, "Done")} type="button">Done</button>
                <button onClick={() => onDeletePmNote(action.id)} type="button">Delete</button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function ActivitySection({ job }: { job: Job }) {
  return (
    <section className="job-page-section">
      <h3>70 Activity</h3>
      {job.activity.length ? job.activity.map((event) => (
        <p className="activity" key={event.id}><strong>{event.author}</strong> {event.message} <span>{event.createdAt}</span></p>
      )) : <div className="empty-note">No activity yet.</div>}
    </section>
  );
}

function Status({ value }: { value: string }) {
  return <span className={`status ${value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`}>{value}</span>;
}

function FileLink({ file }: { file: ProjectFile }) {
  return file.url ? <a href={file.url} rel="noreferrer" target="_blank">{file.name}</a> : <span>{file.name}</span>;
}

function handleFileInput(event: ChangeEvent<HTMLInputElement>, callback: (file: File | undefined) => void) {
  callback(event.currentTarget.files?.[0]);
  event.currentTarget.value = "";
}

function installDuration(start: string, end: string) {
  if (!start) return "TBD";
  if (!end || start === end) return "Same day";
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
  return `${days} days`;
}

function formatInstallWindow(start: string, end: string) {
  if (!start) return "TBD";
  const formattedStart = formatDate(start);
  if (!end || end === start) return formattedStart;
  return `${formattedStart} - ${formatDate(end)}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${month}/${day}/${year}`;
}

function nextPoNumber(job: Job) {
  return `PO-${job.jobNumber}-${String((job.purchaseOrders?.length ?? 0) + 1).padStart(3, "0")}`;
}

function submittalActionsFor(status: SubmittalPackage["status"]): SubmittalAction[] {
  if (status === "Not Started" || status === "In Progress") return ["submit", "notRequired"];
  if (status === "Submitted") return ["approve", "approveAsNoted", "revise"];
  if (status === "Rejected / Revise and Resubmit") return ["resubmit", "notRequired"];
  if (status === "Resubmitted") return ["approve", "approveAsNoted", "revise"];
  if (status === "Void / Not Required") return ["submit"];
  return ["revise"];
}

function purchaseOrderNextStatuses(status: PurchaseOrderStatus): PurchaseOrderStatus[] {
  if (status === "Draft") return ["Issued", "Void"];
  if (status === "Issued") return ["Acknowledged", "Void"];
  if (status === "Acknowledged") return ["In Progress", "Complete", "Void"];
  if (status === "In Progress") return ["Complete", "Void"];
  if (status === "Complete") return ["Closed"];
  if (status === "Void") return ["Draft"];
  return [];
}

function purchaseOrderActionLabel(status: PurchaseOrderStatus): string {
  return {
    Acknowledged: "Acknowledge",
    Closed: "Close",
    Complete: "Complete",
    Draft: "Reopen",
    "In Progress": "Start",
    Issued: "Issue",
    Void: "Void"
  }[status];
}

function formatSubmittalAction(action: SubmittalAction): string {
  return {
    approve: "Approve",
    approveAsNoted: "Approve noted",
    notRequired: "N/R",
    resubmit: "Resubmit",
    revise: "Revise",
    submit: "Submit"
  }[action];
}
