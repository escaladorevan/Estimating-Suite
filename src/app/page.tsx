"use client";

import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Database,
  FileArchive,
  FileDown,
  Files,
  KanbanSquare,
  ChevronLeft,
  ChevronRight,
  Search,
  Upload,
  WalletCards,
  Wrench
} from "lucide-react";
import type { ChangeEvent, ElementType, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase, getCurrentUserProfile } from "@/lib/supabase-client";
import { BidWorkbook } from "@/components/BidWorkbook";
import { useJobsPersistence } from "@/hooks/useJobsPersistence";
import { createChangeOrderEstimateFromJob, nextChangeOrderNumber, validateChangeOrderSubmission } from "@/lib/change-order-workflow";
import { calculateEstimateTotals } from "@/lib/estimate-math";
import { saveEstimateHeader, saveEstimateSnapshot } from "@/lib/estimate-repository";
import { saveProjectFileMetadata, uploadProjectFile } from "@/lib/file-repository";
import { applyChangeOrderStatusToJobDetail, applyChangeOrderToJobDetail, applyFileToJobDetail, applyPurchaseOrderToJobDetail, applySubmittalToJobDetail, getJobDetailData } from "@/lib/job-detail-data";
import { resolvePersistedJobForPMNote } from "@/lib/job-persistence-reconciliation";
import { jobDetailTabs, type JobDetailTabId } from "@/lib/job-detail-tabs";
import {
  currentContractValue,
  grossMarginPercent,
  jobCostSummary,
  summarizeBacklog,
  summarizeChangeOrders,
  summarizePurchaseOrders,
  summarizeServiceWork
} from "@/lib/job-financials";
import { fileSlots, estimates as seedEstimates, jobs as seedJobs, opportunities as seedOpportunities } from "@/lib/sample-data";
import { mapEstimatingMasterRow, shouldFlagStaleFollowUp } from "@/lib/opportunity-import";
import { listOpportunities, saveOpportunity } from "@/lib/opportunity-repository";
import { filterOpportunitiesForView, suggestJobNumber, type RegisterView } from "@/lib/opportunity-workflow";
import { buildPmActionItems, parseJobReferenceFromNote, type PMActionItem } from "@/lib/pm-actions";
import { buildProposalPdf } from "@/lib/proposal-pdf";
import { addMonthsToCalendarMonth, buildCapacityWeeks, buildInstallCalendarMonth, type InstallCalendarDay } from "@/lib/schedule-capacity";
import { suggestServiceJobNumber } from "@/lib/service-workflow";
import {
  applySubmittalAction,
  createSubmittalPackage,
  setSubmittalChecklistState,
  summarizeSubmittals,
  updateSubmittalPackage,
  type SubmittalAction,
  type UpdateSubmittalInput
} from "@/lib/submittals";
import type { ActivityEvent, AppUserProfile, ChangeOrder, ChangeOrderStatus, Estimate, Job, Opportunity, OpportunityStatus, PMNote, ProjectFile, PurchaseOrder, PurchaseOrderScope, PurchaseOrderStatus, SubmittalPackage } from "@/types";

type View = "dashboard" | "opportunities" | "kanban" | "estimator" | "jobs" | "calendar" | "service" | "files" | "analytics";
type DashboardAnalytics = {
  submitted: number;
  won: number;
  lost: number;
  pending: number;
  winRate: number;
  totalBidValue: number;
  wonValue: number;
  activeContract: number;
  approvedCos: number;
  backlog: number;
  wonNotStarted: number;
  activeProduction: number;
  margin: number | null;
};

const nav: { id: View; label: string; icon: ElementType }[] = [
  { id: "dashboard", label: "Home", icon: Database },
  { id: "opportunities", label: "Bid Register", icon: ClipboardList },
  { id: "kanban", label: "Pipeline", icon: KanbanSquare },
  { id: "estimator", label: "Bid Workbook", icon: WalletCards },
  { id: "jobs", label: "Jobs", icon: BriefcaseBusiness },
  { id: "calendar", label: "Calendar / Capacity", icon: CalendarDays },
  { id: "service", label: "Service", icon: Wrench },
  { id: "files", label: "Files", icon: Files },
  { id: "analytics", label: "Analytics", icon: BarChart3 }
];
const viewIds = nav.map((item) => item.id);

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const today = "2026-05-09";
const submittalTypes: SubmittalPackage["type"][] = ["Shop Drawings", "Finish Samples", "Hardware", "Engineering", "Other"];
const purchaseOrderScopes: PurchaseOrderScope[] = ["Stone / Quartz", "Cambria", "Solid Surface", "Glass", "Metal", "Install Labor", "Other"];
const purchaseOrderStatuses: PurchaseOrderStatus[] = ["Draft", "Issued", "Acknowledged", "In Progress", "Complete", "Closed", "Void"];
const opportunityFileSlots = ["drawings", "specs", "schedule", "contract", "proposal", "other"];
const registerViews: Array<{ id: RegisterView; label: string }> = [
  { id: "this-year", label: "This Year" },
  { id: "carryover", label: "Carryover" },
  { id: "submitted", label: "Submitted" },
  { id: "cold", label: "Cold" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
  { id: "archived", label: "Archived" },
  { id: "all", label: "All" }
];

function formatDateRange(start: string, end: string) {
  return `${shortDate(start)} - ${shortDate(end)}`;
}

function shortDate(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function installDuration(start: string, end: string) {
  if (!start) return "TBD";
  if (!end || start === end) return "Same day";
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
  return `${days} days`;
}

type AwardDetails = {
  pm: string;
  jobNumber: string;
  contractValue: number;
  ntpDate: string;
};

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  const [hasMounted, setHasMounted] = useState(false);
  const [opportunities, setOpportunities] = useState<Opportunity[]>(seedOpportunities);
  const [estimates, setEstimates] = useState<Estimate[]>(seedEstimates);
  const [activeEstimateId, setActiveEstimateId] = useState(seedEstimates[0]?.id ?? "");
  const [jobs, setJobs] = useState<Job[]>(seedJobs);
  const [selectedJobId, setSelectedJobId] = useState(seedJobs[0]?.id ?? "");
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [mainNavCollapsed, setMainNavCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [opportunityPersistenceStatus, setOpportunityPersistenceStatus] = useState("Checking Supabase...");
  const [estimatePersistenceStatus, setEstimatePersistenceStatus] = useState("Workbook snapshots save after sign-in.");
  const [loginEmail, setLoginEmail] = useState("escalador.evan@gmail.com");
  const [loginPassword, setLoginPassword] = useState("");
  const [sessionEmail, setSessionEmail] = useState("");
  const [authStatus, setAuthStatus] = useState("Sign in to save live data.");
  const [currentUser, setCurrentUser] = useState<AppUserProfile | null>(null);
  const [pendingLostConfirm, setPendingLostConfirm] = useState<{ linkedOpp: Opportunity; jobId: string } | null>(null);
  const [pendingCoSubmit, setPendingCoSubmit] = useState<{ estimate: Estimate; amount: number; warnings: string[] } | null>(null);
  const [pmNotes, setPmNotes] = useState<PMNote[]>([
    {
      id: "note-manny",
      text: "Call Manny about G26-042 install access",
      status: "Open",
      priority: "Pinned",
      jobId: "job-g042",
      createdAt: "2026-05-09"
    },
    {
      id: "note-stone-po",
      text: "Stone PO needs to be issued Job G26-060",
      status: "Open",
      priority: "Normal",
      jobId: "job-g060",
      createdAt: "2026-05-09"
    }
  ]);
  const {
    jobPersistenceStatus,
    loadPersistedJobDetail,
    loadPersistedJobs,
    loadPersistedPMNotes,
    persistActivity,
    persistChangeOrder,
    persistJobHeader,
    persistDeletePMNote,
    persistPMNote,
    persistProjectFileAttachment,
    persistPurchaseOrder,
    persistSubmittal,
    setJobPersistenceStatus
  } = useJobsPersistence({
    detailJobId,
    estimates,
    jobs,
    pmNotes,
    selectedJobId,
    setDetailJobId,
    setEstimates,
    setJobs,
    setPmNotes,
    setSelectedJobId
  });

  const selectedEstimate = estimates.find((estimate) => estimate.id === activeEstimateId) ?? estimates[0];
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? jobs[0];
  const detailJobData = getJobDetailData({ jobs, pmNotes, jobId: detailJobId });
  const detailJob = detailJobData?.job ?? null;
  const selectedOpportunity = opportunities.find((opportunity) => opportunity.id === selectedOpportunityId) ?? null;
  const totals = calculateEstimateTotals(selectedEstimate);
  const pipelineOpportunities = opportunities.filter((opportunity) =>
    ["Lead / ITB", "Pricing", "Review / Send"].includes(opportunity.status)
  );
  const renderedView: View = hasMounted ? view : "dashboard";

  const analytics = useMemo(() => {
    const submitted = opportunities.filter((opportunity) => opportunity.sentDate).length;
    const won = opportunities.filter((opportunity) => opportunity.winLoss === "Won").length;
    const lost = opportunities.filter((opportunity) => opportunity.winLoss === "Lost").length;
    const pending = opportunities.filter((opportunity) => !opportunity.winLoss).length;
    const wonValue = opportunities
      .filter((opportunity) => opportunity.winLoss === "Won")
      .reduce((sum, opportunity) => sum + opportunity.estimatedValue, 0);
    const totalBidValue = opportunities.reduce((sum, opportunity) => sum + opportunity.estimatedValue, 0);
    const activeContract = jobs.reduce((sum, job) => sum + currentContractValue(job.baseContract, job.changeOrders), 0);
    const approvedCos = jobs.reduce((sum, job) => sum + summarizeChangeOrders(job.changeOrders).approved, 0);
    const backlog = summarizeBacklog(jobs);
    const revenue = jobs.reduce((sum, job) => sum + currentContractValue(job.baseContract, job.changeOrders), 0);
    const cost = jobs.reduce((sum, job) => sum + (job.finalCost ?? 0), 0);

    return {
      submitted,
      won,
      lost,
      pending,
      winRate: submitted ? Math.round((won / submitted) * 100) : 0,
      totalBidValue,
      wonValue,
      activeContract,
      approvedCos,
      backlog: backlog.totalBacklog,
      wonNotStarted: backlog.wonNotStarted,
      activeProduction: backlog.activeProduction,
      margin: grossMarginPercent(revenue, cost)
    };
  }, [jobs, opportunities]);

  async function loadPersistedOpportunities(isMounted = true) {
    try {
      const persisted = await listOpportunities();
      if (!isMounted) return;

      if (persisted.length) {
        setOpportunities(persisted);
        setOpportunityPersistenceStatus(`Loaded ${persisted.length} opportunities from Supabase.`);
        return;
      }

      setOpportunityPersistenceStatus("Supabase is connected. Using sample opportunities until real rows are added.");
    } catch {
      if (!isMounted) return;
      setOpportunityPersistenceStatus("Local sample mode. Sign in before Supabase can read and save live records.");
    }
  }

  useEffect(() => {
    let isMounted = true;
    void loadPersistedOpportunities(isMounted);
    void loadPersistedJobs(isMounted);
    void loadPersistedPMNotes(isMounted);

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (detailJobData?.isPersisted) {
      void loadPersistedJobDetail(detailJobData.job.id, isMounted);
    }

    return () => {
      isMounted = false;
    };
  }, [detailJobData?.job.id, detailJobData?.isPersisted, loadPersistedJobDetail]);

  useEffect(() => {
    if (!supabase) {
      setAuthStatus("Supabase env is not configured.");
      return;
    }

    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      const email = data.session?.user.email ?? "";
      setSessionEmail(email);
      setAuthStatus(email ? `Signed in as ${email}.` : "Sign in to save live data.");
      if (email) {
        void loadPersistedOpportunities();
        void loadPersistedJobs();
        void loadPersistedPMNotes();
        void getCurrentUserProfile().then((profile) => { if (isMounted) setCurrentUser(profile); });
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user.email ?? "";
      setSessionEmail(email);
      setAuthStatus(email ? `Signed in as ${email}.` : "Sign in to save live data.");
      if (email) {
        void loadPersistedOpportunities();
        void loadPersistedJobs();
        void loadPersistedPMNotes();
        void getCurrentUserProfile().then(setCurrentUser);
      } else {
        setCurrentUser(null);
      }
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    function syncViewFromHash() {
      const hash = window.location.hash.replace("#", "") as View;
      if (viewIds.includes(hash)) {
        setView(hash);
      }
    }

    const initialHashSync = window.setTimeout(() => {
      syncViewFromHash();
      setHasMounted(true);
    }, 50);
    window.addEventListener("hashchange", syncViewFromHash);
    return () => {
      window.clearTimeout(initialHashSync);
      window.removeEventListener("hashchange", syncViewFromHash);
    };
  }, []);

  async function persistOpportunity(next: Opportunity) {
    const localId = next.id;
    setOpportunities((current) =>
      current.map((opportunity) => (opportunity.id === localId ? next : opportunity))
    );
    setOpportunityPersistenceStatus("Saving opportunity...");

    try {
      const saved = await saveOpportunity(next);
      setOpportunities((current) =>
        current.map((opportunity) =>
          opportunity.id === localId || opportunity.jobId === saved.jobId ? saved : opportunity
        )
      );
      setSelectedOpportunityId((current) => (current === localId ? saved.id : current));
      setOpportunityPersistenceStatus(`Saved ${saved.jobId || saved.projectName} to Supabase.`);
      return saved;
    } catch {
      setOpportunityPersistenceStatus("Saved locally only. Supabase write is waiting on auth/session wiring.");
      return next;
    }
  }

  async function persistEstimateSnapshot(estimate: Estimate) {
    const localId = estimate.id;
    setEstimatePersistenceStatus("Saving workbook header and snapshot...");

    try {
      const savedHeader = await saveEstimateHeader(estimate);
      const persistedEstimate: Estimate = {
        ...estimate,
        id: savedHeader.id,
        opportunityId: savedHeader.opportunityId ?? estimate.opportunityId,
        jobId: savedHeader.jobId ?? estimate.jobId
      };

      setEstimates((current) =>
        current.map((candidate) => (candidate.id === localId || candidate.id === persistedEstimate.id ? persistedEstimate : candidate))
      );
      setActiveEstimateId(persistedEstimate.id);

      await saveEstimateSnapshot(persistedEstimate);
      setEstimatePersistenceStatus(`Saved snapshot for ${persistedEstimate.proposalNumber || persistedEstimate.projectName}.`);
    } catch {
      setEstimatePersistenceStatus("Workbook is local only. Sign in and use persisted opportunity/job ids before saving snapshots.");
    }
  }

  async function persistOpportunityFile(opportunity: Opportunity, slot: string, file: File) {
    if (!isUuid(opportunity.id)) {
      setOpportunityPersistenceStatus("File attached locally. Save the opportunity to Supabase before storing files.");
      return null;
    }

    setOpportunityPersistenceStatus(`Uploading ${file.name}...`);

    try {
      const storagePath = await uploadProjectFile({
        file,
        ownerType: "opportunity",
        ownerId: opportunity.id,
        slot,
        fileName: file.name,
        mimeType: file.type
      });
      if (!storagePath) throw new Error("Upload did not return a storage path.");

      const saved = await saveProjectFileMetadata({
        ownerType: "opportunity",
        ownerId: opportunity.id,
        slot,
        name: file.name,
        storagePath,
        mimeType: file.type || null,
        sizeBytes: file.size
      });

      setOpportunityPersistenceStatus(saved ? `Stored ${file.name} in Supabase Storage.` : `Uploaded ${file.name}; metadata is local only.`);
      return saved;
    } catch {
      setOpportunityPersistenceStatus("File attached locally only. Supabase Storage is waiting on sign-in or persisted owner id.");
      return null;
    }
  }

  function updateJobHeader(jobId: string, updates: Partial<Job>) {
    const job = jobs.find((candidate) => candidate.id === jobId);
    if (!job) return;
    const updated = { ...job, ...updates };
    setJobs((current) => current.map((candidate) => (candidate.id === jobId ? updated : candidate)));

    if (updates.backlogStatus === "Void" && updated.opportunityId) {
      const linkedOpp = opportunities.find((o) => o.id === updated.opportunityId);
      if (linkedOpp && linkedOpp.winLoss !== "Lost") {
        setPendingLostConfirm({ linkedOpp, jobId });
      }
    }

    void persistJobHeader(updated);
  }

  function canWrite(scope: "estimating" | "pm" | "shared") {
    if (!currentUser) return false;
    const r = currentUser.role;
    if (scope === "estimating") return r === "admin" || r === "estimator";
    if (scope === "pm") return r === "admin" || r === "pm";
    return r === "admin" || r === "estimator" || r === "pm";
  }

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setAuthStatus("Supabase env is not configured.");
      return;
    }
    if (!loginPassword) {
      setAuthStatus("Enter a password, or use magic link.");
      return;
    }

    setAuthStatus("Signing in...");
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword
    });

    if (error) {
      setAuthStatus(error.message);
      return;
    }

    setLoginPassword("");
    setAuthStatus("Signed in. Loading your role...");
  }

  async function sendMagicLink() {
    if (!supabase) {
      setAuthStatus("Supabase env is not configured.");
      return;
    }

    setAuthStatus("Sending sign-in link...");
    const { error } = await supabase.auth.signInWithOtp({
      email: loginEmail,
      options: {
        emailRedirectTo: window.location.origin
      }
    });

    setAuthStatus(error ? error.message : `Check ${loginEmail} for the sign-in link.`);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSessionEmail("");
    setAuthStatus("Signed out. Local sample mode remains available.");
  }

  function reopenOpportunity(opportunityId: string, targetStatus: OpportunityStatus) {
    const opp = opportunities.find((o) => o.id === opportunityId);
    if (!opp) return;
    void persistOpportunity({ ...opp, status: targetStatus, winLoss: "" });
  }

  function createNewOpportunity() {
    const opportunityId = nextOpportunityId({ jobs, opportunities, date: today });
    const newOpportunity: Opportunity = {
      id: `opp-${Date.now()}`,
      jobId: opportunityId,
      month: monthFromDate(today),
      client: "",
      projectName: "New ITB",
      bidDueDate: "",
      drawingStage: "",
      bidType: "Invited",
      sentDate: "",
      submissionMethod: "Email",
      status: "Lead / ITB",
      winLoss: "",
      jobType: "",
      workType: "Bid / ITB",
      estimatedValue: 0,
      links: { drawings: "", specs: "", schedule: "" },
      notes: "",
      bidFeedback: "",
      ntpReceived: false,
      initialContractValue: null,
      finalCost: null,
      files: []
    };

    setOpportunities((current) => [newOpportunity, ...current]);
    setSelectedOpportunityId(newOpportunity.id);
    goToView("opportunities");
    void persistOpportunity(newOpportunity);
  }

  async function importMasterWorkbook(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const bidSheetName = workbook.SheetNames.find((name) => name.includes("2026 Bid Tracker")) ?? workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[bidSheetName], { defval: "" });
    const mapped = rows.map(mapEstimatingMasterRow).filter((opportunity) => opportunity.jobId || opportunity.projectName);
    setOpportunities(mapped);
    setOpportunityPersistenceStatus(`Imported ${mapped.length} opportunities locally. Bulk Supabase import comes after auth.`);
  }

  async function exportProposalPdf() {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    buildProposalPdf(doc, selectedEstimate);
    doc.save(`${selectedEstimate.projectName.replace(/[^a-z0-9]+/gi, "-")}-proposal.pdf`);
  }

  function startChangeOrderFromJob(jobId: string) {
    const job = jobs.find((candidate) => candidate.id === jobId);
    if (!job) return;

    const estimate = createChangeOrderEstimateFromJob(job, today);
    setEstimates((current) => [estimate, ...current]);
    setActiveEstimateId(estimate.id);
    setDetailJobId(null);
    goToView("estimator");
  }

  function commitChangeOrder(estimate: Estimate, amount: number, sourceJob: Job) {
    const number = estimate.proposalNumber || nextChangeOrderNumber(sourceJob.changeOrders);
    const changeOrder: ChangeOrder = {
      id: `co-${Date.now()}`,
      jobId: sourceJob.id,
      number,
      description: estimate.scopeSummary || `${number} additional scope`,
      amount,
      status: "submitted",
      dateSubmitted: today,
      notes: `Created from workbook ${estimate.id}.`
    };
    const activity: ActivityEvent = {
      id: `act-${Date.now()}`,
      ownerType: "job",
      ownerId: sourceJob.id,
      author: "System",
      message: `${number} submitted from Bid Workbook for ${money.format(amount)}.`,
      createdAt: today
    };

    setJobs((current) =>
      current.map((job) =>
        job.id !== estimate.jobId ? job : applyChangeOrderToJobDetail({ job, changeOrder, activity })
      )
    );
    if (isUuid(sourceJob.id)) {
      void persistChangeOrder(changeOrder, activity);
    }
    setSelectedJobId(estimate.jobId);
    setDetailJobId(estimate.jobId);
    goToView("jobs");
  }

  function submitEstimateAsChangeOrder(estimate: Estimate, amount: number) {
    if (estimate.documentType !== "Change Order" || !estimate.jobId) return;
    const sourceJob = jobs.find((job) => job.id === estimate.jobId);
    if (!sourceJob) return;

    const warnings = validateChangeOrderSubmission({
      estimate,
      amount,
      existingChangeOrders: sourceJob.changeOrders
    });
    if (warnings.length) {
      setPendingCoSubmit({ estimate, amount, warnings });
      return;
    }

    commitChangeOrder(estimate, amount, sourceJob);
  }

  function approveSubmittedCo(jobId: string) {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    const submittedCos = job.changeOrders.filter((co) => co.status === "submitted");
    if (!submittedCos.length) return;
    const approvedCos = submittedCos.map((co) => ({ ...co, status: "approved" as ChangeOrderStatus, approvedDate: today }));
    const activity: ActivityEvent = {
      id: `act-${Date.now()}`,
      ownerType: "job",
      ownerId: jobId,
      author: "System",
      message: "Submitted change orders were approved and rolled into current contract.",
      createdAt: today
    };

    setJobs((current) =>
      current.map((j) =>
        j.id !== jobId
          ? j
          : {
              ...j,
              changeOrders: j.changeOrders.map((co) =>
                co.status === "submitted" ? { ...co, status: "approved", approvedDate: today } : co
              ),
              activity: [activity, ...j.activity]
            }
      )
    );
    if (isUuid(jobId)) {
      for (const co of approvedCos) void persistChangeOrder(co);
      void persistActivity(activity);
    }
  }

  function updateChangeOrderStatus(jobId: string, coId: string, status: ChangeOrderStatus) {
    const job = jobs.find((j) => j.id === jobId);
    const co = job?.changeOrders.find((c) => c.id === coId);
    if (!job || !co) return;

    const approvedDate = status === "approved" ? today : undefined;
    const messages: Record<string, string> = {
      approved: `${co.number} approved and added to current contract.`,
      rejected: `${co.number} rejected.`,
      void: `${co.number} voided.`
    };
    const activity: ActivityEvent = {
      id: `act-${Date.now()}`,
      ownerType: "change_order",
      ownerId: coId,
      author: "System",
      message: messages[status] ?? `${co.number} status updated to ${status}.`,
      createdAt: today
    };
    const updatedCo: ChangeOrder = { ...co, status, approvedDate };

    setJobs((current) =>
      current.map((j) =>
        j.id !== jobId ? j : applyChangeOrderStatusToJobDetail({ job: j, changeOrderId: coId, status, approvedDate, activity })
      )
    );
    if (isUuid(jobId)) {
      void persistChangeOrder(updatedCo, activity);
    }
  }

  function updateSubmittal(jobId: string, submittalId: string, action: SubmittalAction) {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    const currentSub = job.submittals.find((s) => s.id === submittalId);
    if (!currentSub) return;
    const updatedSub = applySubmittalAction(currentSub, action, today);
    const activity: ActivityEvent = {
      id: `act-${Date.now()}`,
      ownerType: "submittal",
      ownerId: updatedSub.id,
      author: "System",
      message: `${updatedSub.name} moved to ${updatedSub.status}.`,
      createdAt: today
    };

    setJobs((current) =>
      current.map((j) => (j.id === jobId ? applySubmittalToJobDetail({ job: j, submittal: updatedSub, activity, today }) : j))
    );
    if (isUuid(jobId)) {
      void persistSubmittal(updatedSub);
      void persistActivity(activity);
    }
  }

  function createJobSubmittal(
    jobId: string,
    input: Omit<SubmittalPackage, "id" | "jobId" | "status" | "revision">
  ) {
    const item = createSubmittalPackage({ ...input, id: `sub-${Date.now()}`, jobId });
    setJobs((current) =>
      current.map((job) => {
        if (job.id !== jobId) return job;
        return {
          ...job,
          backlogStatus: job.backlogStatus === "Awarded / Waiting" ? "Submittals" : job.backlogStatus,
          submittals: [...job.submittals, item],
          activity: [
            {
              id: `act-${Date.now()}`,
              ownerType: "submittal",
              ownerId: item.id,
              author: "System",
              message: `${item.name} package added to submittal tracker.`,
              createdAt: today
            },
            ...job.activity
          ]
        };
      })
    );
    if (isUuid(jobId)) void persistSubmittal(item);
  }

  function editJobSubmittal(jobId: string, submittalId: string, updates: UpdateSubmittalInput) {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    const current = job.submittals.find((s) => s.id === submittalId);
    if (!current) return;
    const updatedSub = updateSubmittalPackage(current, updates);
    const activity: ActivityEvent = {
      id: `act-${Date.now()}`,
      ownerType: "submittal",
      ownerId: updatedSub.id,
      author: "System",
      message: `${updatedSub.name} package updated.`,
      createdAt: today
    };

    setJobs((current) =>
      current.map((j) => (j.id === jobId ? applySubmittalToJobDetail({ job: j, submittal: updatedSub, activity, today }) : j))
    );
    if (isUuid(jobId)) {
      void persistSubmittal(updatedSub);
      void persistActivity(activity);
    }
  }

  function updateSubmittalChecklist(
    jobId: string,
    submittalId: string,
    updates: Parameters<typeof setSubmittalChecklistState>[1]
  ) {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    const current = job.submittals.find((s) => s.id === submittalId);
    if (!current) return;
    const updatedSub = setSubmittalChecklistState(current, updates, today);
    const activity: ActivityEvent = {
      id: `act-${Date.now()}`,
      ownerType: "submittal",
      ownerId: updatedSub.id,
      author: "System",
      message: `${updatedSub.name} checklist updated.`,
      createdAt: today
    };

    setJobs((current) =>
      current.map((j) => (j.id === jobId ? applySubmittalToJobDetail({ job: j, submittal: updatedSub, activity, today }) : j))
    );
    if (isUuid(jobId)) {
      void persistSubmittal(updatedSub);
      void persistActivity(activity);
    }
  }

  function createPurchaseOrder(jobId: string, input: Omit<PurchaseOrder, "id" | "jobId">) {
    const po: PurchaseOrder = { ...input, id: `po-${Date.now()}`, jobId };
    const activity: ActivityEvent = {
      id: `act-${Date.now()}`,
      ownerType: "purchase_order",
      ownerId: po.id,
      author: "System",
      message: `${po.poNumber} added for ${po.vendor}.`,
      createdAt: today
    };
    setJobs((current) =>
      current.map((job) => (job.id === jobId ? applyPurchaseOrderToJobDetail({ job, purchaseOrder: po, activity }) : job))
    );
    if (isUuid(jobId)) void persistPurchaseOrder(po, activity);
  }

  function editPurchaseOrder(jobId: string, poId: string, updates: Partial<PurchaseOrder>) {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    const existing = job.purchaseOrders.find((p) => p.id === poId);
    if (!existing) return;
    const updatedPo = { ...existing, ...updates };
    const activity: ActivityEvent = {
      id: `act-${Date.now()}`,
      ownerType: "purchase_order",
      ownerId: poId,
      author: "System",
      message: `${updatedPo.poNumber} updated.`,
      createdAt: today
    };

    setJobs((current) =>
      current.map((j) => (j.id === jobId ? applyPurchaseOrderToJobDetail({ job: j, purchaseOrder: updatedPo, activity }) : j))
    );
    if (isUuid(jobId)) void persistPurchaseOrder(updatedPo, activity);
  }

  function attachPurchaseOrderFile(jobId: string, poId: string, file: File | undefined) {
    if (!file) return;
    let attachedFile: ProjectFile | null = null;
    let attachedActivity: ActivityEvent | null = null;
    setJobs((current) =>
      current.map((job) => {
        if (job.id !== jobId) return job;
        const po = job.purchaseOrders.find((candidate) => candidate.id === poId);
        const nextFile: ProjectFile = {
          id: `file-${Date.now()}`,
          ownerType: "purchase_order",
          ownerId: poId,
          slot: "purchase orders",
          name: file.name,
          uploadedAt: today
        };
        const activity: ActivityEvent = {
          id: `act-${Date.now()}`,
          ownerType: "purchase_order",
          ownerId: poId,
          author: "System",
          message: `${file.name} attached to ${po?.poNumber ?? "PO"}.`,
          createdAt: today
        };
        attachedFile = nextFile;
        attachedActivity = activity;

        return applyFileToJobDetail({ job, file: nextFile, activity });
      })
    );
    if (attachedFile) void persistProjectFileAttachment(attachedFile, file, { activity: attachedActivity ?? undefined });
  }

  function attachSubmittalFile(jobId: string, submittalId: string, file: File | undefined) {
    if (!file) return;
    let attachedFile: ProjectFile | null = null;
    let attachedActivity: ActivityEvent | null = null;

    setJobs((current) =>
      current.map((job) => {
        if (job.id !== jobId) return job;
        const submittal = job.submittals.find((item) => item.id === submittalId);
        const nextFile: ProjectFile = {
          id: `file-${Date.now()}`,
          ownerType: "submittal",
          ownerId: submittalId,
          slot: "submittal package",
          name: file.name,
          uploadedAt: today
        };
        const activity: ActivityEvent = {
          id: `act-${Date.now()}`,
          ownerType: "submittal",
          ownerId: submittalId,
          author: "System",
          message: `${file.name} attached to ${submittal?.name ?? "submittal package"}.`,
          createdAt: today
        };
        attachedFile = nextFile;
        attachedActivity = activity;

        return applyFileToJobDetail({ job, file: nextFile, activity });
      })
    );
    if (attachedFile) void persistProjectFileAttachment(attachedFile, file, { activity: attachedActivity ?? undefined });
  }

  function attachJobFile(jobId: string, slot: string, file: File | undefined) {
    if (!file) return;
    if (currentUser && !canWrite("pm")) {
      setJobPersistenceStatus("PM or admin role required to attach job files.");
      return;
    }
    let attachedFile: ProjectFile | null = null;
    let attachedActivity: ActivityEvent | null = null;
    const requestedJob = jobs.find((job) => job.id === jobId);
    const persistedJob = requestedJob
      ? jobs.find((job) => job.jobNumber.toLowerCase() === requestedJob.jobNumber.toLowerCase() && isUuid(job.id))
      : undefined;
    const persistenceJobId = persistedJob?.id ?? jobId;

    if (persistedJob && persistedJob.id !== jobId) {
      setSelectedJobId((current) => (current === jobId ? persistedJob.id : current));
      setDetailJobId((current) => (current === jobId ? persistedJob.id : current));
    }

    setJobs((current) =>
      current.map((job) => {
        if (job.id !== persistenceJobId) return job;
        const nextFile: ProjectFile = {
          id: `file-${slot}-${Date.now()}`,
          ownerType: "job",
          ownerId: persistenceJobId,
          slot,
          name: file.name,
          uploadedAt: today
        };
        const activity: ActivityEvent = {
          id: `act-${Date.now()}`,
          ownerType: "job",
          ownerId: persistenceJobId,
          author: "System",
          message: `${file.name} attached to ${slot}.`,
          createdAt: today
        };
        attachedFile = nextFile;
        attachedActivity = activity;

        return applyFileToJobDetail({ job, file: nextFile, activity, replaceSlot: true });
      })
    );
    if (attachedFile) void persistProjectFileAttachment(attachedFile, file, { activity: attachedActivity ?? undefined, replaceSlot: true });
  }

  function createServiceJob(input: {
    client: string;
    projectName: string;
    serviceScope: string;
    quoteAmount: number;
    requestedDate: string;
    scheduledDate: string;
    assignedTo: string;
    notes: string;
  }) {
    const jobNumber = suggestServiceJobNumber({ date: today, existingJobs: jobs });
    const newJob: Job = {
      id: `job-${jobNumber.toLowerCase()}`,
      jobNumber,
      workType: "Service",
      pm: "Service",
      client: input.client,
      projectName: input.projectName,
      baseContract: input.quoteAmount,
      awardDate: today,
      ntpDate: today,
      backlogStatus: input.scheduledDate ? "Ready to Install" : "Awarded / Waiting",
      forecastStart: input.scheduledDate,
      forecastEnd: input.scheduledDate,
      forecastQuarter: input.scheduledDate ? `Q${Math.floor(new Date(`${input.scheduledDate}T12:00:00`).getMonth() / 3) + 1} ${new Date(`${input.scheduledDate}T12:00:00`).getFullYear()}` : "",
      fabStatus: "Ready",
      installStart: input.scheduledDate,
      installEnd: input.scheduledDate,
      installStatus: "Ready",
      invoiceStatus: "Not Billed",
      crewSize: 1,
      gc: "Direct Client",
      serviceScope: input.serviceScope,
      requestedDate: input.requestedDate || today,
      scheduledDate: input.scheduledDate,
      assignedTo: input.assignedTo,
      notes: input.notes,
      changeOrders: [],
      purchaseOrders: [],
      submittals: [],
      files: [],
      activity: [
        {
          id: `act-${Date.now()}`,
          ownerType: "job",
          ownerId: `job-${jobNumber.toLowerCase()}`,
          author: "System",
          message: `Service job ${jobNumber} created from quick intake.`,
          createdAt: today
        }
      ]
    };

    setJobs((current) => [newJob, ...current]);
    void persistJobHeader(newJob, true);
  }

  function goToView(nextView: View) {
    setView(nextView);
    window.history.replaceState(null, "", `#${nextView}`);
    if (nextView === "estimator") {
      setMainNavCollapsed(true);
    }
  }

  function createPmNote(text: string, jobId?: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const parsedJobNumber = parseJobReferenceFromNote(trimmed);
    const { linkedJob, persistedJob } = resolvePersistedJobForPMNote({
      jobs,
      requestedJobId: jobId,
      parsedJobNumber
    });
    const noteJobId = persistedJob?.id ?? linkedJob?.id;

    if (persistedJob && linkedJob && linkedJob.id !== persistedJob.id) {
      setSelectedJobId((current) => (current === linkedJob.id ? persistedJob.id : current));
      setDetailJobId((current) => (current === linkedJob.id ? persistedJob.id : current));
    }

    const note: PMNote = {
      id: `note-${Date.now()}`,
      text: trimmed,
      status: "Open",
      priority: trimmed.includes("!") ? "Pinned" : "Normal",
      jobId: noteJobId,
      createdAt: today
    };

    setPmNotes((current) => [note, ...current]);
    void persistPMNote(note);
  }

  function updatePmNoteStatus(noteId: string, status: PMNote["status"]) {
    const note = pmNotes.find((candidate) => candidate.id === noteId);
    const updated = note ? { ...note, status, completedAt: status === "Done" ? today : undefined } : null;
    setPmNotes((current) =>
      current.map((note) => (note.id === noteId ? { ...note, status, completedAt: status === "Done" ? today : undefined } : note))
    );
    if (updated) void persistPMNote(updated);
  }

  function updatePmNoteText(noteId: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const note = pmNotes.find((candidate) => candidate.id === noteId);
    const updated = note ? { ...note, text: trimmed } : null;
    setPmNotes((current) => current.map((note) => (note.id === noteId ? { ...note, text: trimmed } : note)));
    if (updated) void persistPMNote(updated);
  }

  function deletePmNote(noteId: string) {
    const note = pmNotes.find((candidate) => candidate.id === noteId);
    setPmNotes((current) => current.filter((note) => note.id !== noteId));
    if (note) void persistDeletePMNote(note);
  }

  if (!hasMounted) {
    return <main className="app-shell" />;
  }

  return (
    <main className={mainNavCollapsed ? "app-shell main-nav-collapsed" : "app-shell"}>
      <aside className="side-nav">
        <div className="brand">
          <div className="brand-mark">FS</div>
          <div>
            <strong>Estimating Suite</strong>
            <span>Bid to job operating system</span>
          </div>
        </div>
        <button className="main-nav-toggle" onClick={() => setMainNavCollapsed((value) => !value)}>
          {mainNavCollapsed ? "Open" : "Collapse"}
        </button>
        <nav>
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                aria-current={renderedView === item.id ? "page" : undefined}
                className={renderedView === item.id ? "active" : ""}
                key={item.id}
                onClick={() => goToView(item.id)}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="source-stack">
          <span>Source systems merged</span>
          <strong>Master V4</strong>
          <strong>FS Estimator V2</strong>
          <strong>FS Job Dashboard</strong>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{nav.find((item) => item.id === renderedView)?.label}</h1>
            <p>Manual-first Supabase-ready rebuild of the FS bid, estimate, proposal, and job workflow.</p>
          </div>
          <div className="topbar-actions">
            {sessionEmail ? (
              <div className="auth-box">
                <span>{authStatus}</span>
                {currentUser && <span className="role-badge">{currentUser.role}</span>}
                <button className="ghost-button compact" onClick={signOut} type="button">Sign out</button>
              </div>
            ) : (
              <form className="auth-box auth-box-expanded" onSubmit={signInWithPassword}>
                <input
                  aria-label="Email for Supabase sign-in"
                  onChange={(event) => setLoginEmail(event.target.value)}
                  placeholder="Email"
                  type="email"
                  value={loginEmail}
                />
                <input
                  aria-label="Password for Supabase sign-in"
                  onChange={(event) => setLoginPassword(event.target.value)}
                  placeholder="Password"
                  type="password"
                  value={loginPassword}
                />
                <button className="ghost-button compact" type="submit">Sign in</button>
                <button className="text-button" onClick={sendMagicLink} type="button">Magic link</button>
                <span className="auth-status">{authStatus}</span>
              </form>
            )}
            <label className="import-button">
              <Upload size={16} />
              Import Master V4
              <input accept=".xlsx,.xls" onChange={importMasterWorkbook} type="file" />
            </label>
          </div>
        </header>
        <div className="persistence-strip">{opportunityPersistenceStatus}</div>
        {currentUser?.role === "viewer" && (
          <div className="viewer-banner">You are in read-only mode. Contact an admin to request edit access.</div>
        )}

        {pendingLostConfirm && (
          <div className="confirm-strip" role="alert">
            <p>Job voided. Mark linked bid <strong>{pendingLostConfirm.linkedOpp.projectName}</strong> as Lost?</p>
            <div className="confirm-strip-actions">
              <button
                className="ghost-button compact"
                onClick={() => {
                  void persistOpportunity({ ...pendingLostConfirm.linkedOpp, status: "Lost", winLoss: "Lost" });
                  setPendingLostConfirm(null);
                }}
              >
                Yes, mark Lost
              </button>
              <button className="ghost-button compact" onClick={() => setPendingLostConfirm(null)}>Skip</button>
            </div>
          </div>
        )}

        {pendingCoSubmit && (
          <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setPendingCoSubmit(null); }}>
            <section className="opportunity-modal" style={{ maxWidth: 520 }}>
              <header className="modal-head">
                <div>
                  <span className="eyebrow">Review before submitting</span>
                  <h2>Change order warnings</h2>
                </div>
                <button className="modal-close" onClick={() => setPendingCoSubmit(null)}>×</button>
              </header>
              <div className="modal-body" style={{ padding: "18px 20px" }}>
                <ul className="co-warning-list">
                  {pendingCoSubmit.warnings.map((warning, i) => <li key={i}>{warning}</li>)}
                </ul>
                <p style={{ color: "var(--ink-3)", fontSize: 12, margin: "0 0 16px" }}>
                  These issues were flagged. You can submit anyway or go back to the workbook to correct them.
                </p>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button className="ghost-button compact" onClick={() => setPendingCoSubmit(null)}>Go back</button>
                  <button
                    className="primary"
                    onClick={() => {
                      const sourceJob = jobs.find((job) => job.id === pendingCoSubmit.estimate.jobId);
                      if (sourceJob) commitChangeOrder(pendingCoSubmit.estimate, pendingCoSubmit.amount, sourceJob);
                      setPendingCoSubmit(null);
                    }}
                  >
                    Submit anyway
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {renderedView === "dashboard" && (
          <HomeDashboard
            analytics={analytics}
            jobs={jobs}
            onCreateOpportunity={createNewOpportunity}
            onCreatePmNote={createPmNote}
            onDeletePmNote={deletePmNote}
            onUpdatePmNoteText={updatePmNoteText}
            onUpdatePmNoteStatus={updatePmNoteStatus}
            opportunities={opportunities}
            pipelineOpportunities={pipelineOpportunities}
            pmNotes={pmNotes}
          />
        )}
        {renderedView === "opportunities" && (
          <OpportunityRegister
            opportunities={opportunities}
            query={query}
            setQuery={setQuery}
            onOpenOpportunity={setSelectedOpportunityId}
          />
        )}
        {renderedView === "kanban" && <PipelineKanban opportunities={pipelineOpportunities} onOpenOpportunity={setSelectedOpportunityId} />}
        {renderedView === "estimator" && (
          <BidWorkbook
            estimate={selectedEstimate}
            onChange={(next) => setEstimates((current) => current.map((estimate) => (estimate.id === next.id ? next : estimate)))}
            onExportPdf={exportProposalPdf}
            onSaveSnapshot={(estimate) => void persistEstimateSnapshot(estimate)}
            saveStatus={estimatePersistenceStatus}
            onSubmitChangeOrder={submitEstimateAsChangeOrder}
          />
        )}
        {renderedView === "jobs" && (
          <JobsView
            jobs={jobs}
            onApproveCos={approveSubmittedCo}
            onCreatePurchaseOrder={createPurchaseOrder}
            onCreatePmNote={createPmNote}
            onCreateSubmittal={createJobSubmittal}
            onEditPurchaseOrder={editPurchaseOrder}
            onEditSubmittal={editJobSubmittal}
            onPurchaseOrderFile={attachPurchaseOrderFile}
            onUpdateJob={updateJobHeader}
            onDeletePmNote={deletePmNote}
            onUpdatePmNoteStatus={updatePmNoteStatus}
            onUpdatePmNoteText={updatePmNoteText}
            pmNotes={pmNotes}
            onOpenJob={setDetailJobId}
            onSubmittalChecklist={updateSubmittalChecklist}
            onSubmittalAction={updateSubmittal}
            onSubmittalFile={attachSubmittalFile}
            saveStatus={jobPersistenceStatus}
          />
        )}
        {renderedView === "calendar" && <CalendarCapacityView jobs={jobs} onOpenJob={setDetailJobId} />}
        {renderedView === "service" && <ServiceView jobs={jobs} onCreateServiceJob={createServiceJob} />}
        {renderedView === "files" && <FilesView jobs={jobs} opportunities={opportunities} />}
        {renderedView === "analytics" && <AnalyticsView analytics={analytics} jobs={jobs} opportunities={opportunities} />}
      </section>
      {detailJob ? (
        <JobDetailModal
          job={detailJob}
          onApproveCos={approveSubmittedCo}
          onUpdateCoStatus={updateChangeOrderStatus}
          onClose={() => setDetailJobId(null)}
          onCreatePurchaseOrder={createPurchaseOrder}
          onCreatePmNote={createPmNote}
          onCreateSubmittal={createJobSubmittal}
          onEditPurchaseOrder={editPurchaseOrder}
          onEditSubmittal={editJobSubmittal}
          onJobFile={attachJobFile}
          onPurchaseOrderFile={attachPurchaseOrderFile}
          onStartChangeOrder={startChangeOrderFromJob}
          onUpdateJob={updateJobHeader}
          onDeletePmNote={deletePmNote}
          onUpdatePmNoteStatus={updatePmNoteStatus}
          onUpdatePmNoteText={updatePmNoteText}
          pmNotes={detailJobData?.notes ?? []}
          onSubmittalChecklist={updateSubmittalChecklist}
          onSubmittalFile={attachSubmittalFile}
          onSubmittalAction={updateSubmittal}
          canEditHeader={canWrite("pm")}
        />
      ) : null}
      {selectedOpportunity ? (
        <OpportunityModal
          opportunity={selectedOpportunity}
          onAttachFile={persistOpportunityFile}
          onClose={() => setSelectedOpportunityId(null)}
          onUpdate={(next) => void persistOpportunity(next)}
          existingJobs={jobs}
          canConvertToJob={canWrite("estimating")}
          onReopenOpportunity={reopenOpportunity}
          onConvertToJob={(opportunity, award) => {
            const contractValue = award.contractValue || opportunity.initialContractValue || opportunity.estimatedValue;
            const awardedOpportunity: Opportunity = {
              ...opportunity,
              status: "Won",
              winLoss: "Won",
              ntpReceived: true,
              initialContractValue: contractValue
            };
            const newJob: Job = {
              id: `job-${opportunity.id}`,
              opportunityId: isUuid(opportunity.id) ? opportunity.id : undefined,
              jobNumber: award.jobNumber,
              pm: award.pm,
              client: opportunity.client,
              projectName: opportunity.projectName,
              baseContract: contractValue,
              bidRef: opportunity.jobId,
              awardDate: award.ntpDate || today,
              ntpDate: award.ntpDate || today,
              backlogStatus: "Awarded / Waiting",
              forecastStart: "",
              forecastEnd: "",
              expectedFabStart: "",
              expectedCompletion: "",
              fabStatus: "Not Started",
              installStart: "",
              installEnd: "",
              installStatus: "Ready",
              invoiceStatus: "Not Billed",
              crewSize: 0,
              gc: opportunity.client,
              workType: opportunity.workType ?? "Bid / ITB",
              notes: opportunity.notes,
              finalCost: undefined,
              changeOrders: [],
              purchaseOrders: [],
              submittals: [],
              files: [],
              activity: [
                {
                  id: `act-${Date.now()}`,
                  ownerType: "job",
                  ownerId: `job-${opportunity.id}`,
                  author: "System",
                  message: `Created from won opportunity ${opportunity.jobId}. NTP ${award.ntpDate || today}.`,
                  createdAt: today
                }
              ]
            };

            setJobs((current) => [newJob, ...current]);
            void persistOpportunity(awardedOpportunity);
            void persistJobHeader(newJob, true);
            setSelectedJobId(newJob.id);
            setSelectedOpportunityId(null);
            goToView("jobs");
          }}
          onOpenEstimate={(opportunity) => {
            const existing = estimates.find((estimate) => estimate.opportunityId === opportunity.id);
            if (existing) {
              setActiveEstimateId(existing.id);
            } else {
              const estimate: Estimate = {
                id: `est-${opportunity.id}`,
                opportunityId: opportunity.id,
                documentType: opportunity.workType === "Service" ? "Service Quote" : "Proposal",
                projectName: opportunity.projectName,
                client: opportunity.client,
                pricingMode: "byarea",
                ohPct: 12,
                delPct: 3,
                insPct: 8,
                areas: [
                  {
                    id: `area-${opportunity.id}-1`,
                    name: "Base Bid",
                    qty: 1,
                    sections: [
                      {
                        id: `section-${opportunity.id}-1`,
                        name: "Unpriced Scope",
                        items: [{ id: `item-${opportunity.id}-1`, name: "Add takeoff item", qty: 1, unit: "LS", unitCost: 0 }]
                      }
                    ]
                  }
                ],
                subItems: [],
                alternates: [],
                exclusions: ["Electrical, plumbing, and backing by others."],
                clarifications: [
                  `Proposal initialized from ${opportunity.jobId}.`,
                  opportunity.drawingStage ? `Drawing stage: ${opportunity.drawingStage}.` : ""
                ].filter(Boolean)
              };
              setEstimates((current) => [estimate, ...current]);
              setActiveEstimateId(estimate.id);
            }
            setSelectedOpportunityId(null);
            goToView("estimator");
          }}
        />
      ) : null}
    </main>
  );
}

function HomeDashboard({
  analytics,
  opportunities,
  pipelineOpportunities,
  jobs,
  pmNotes,
  onCreateOpportunity,
  onCreatePmNote,
  onDeletePmNote,
  onUpdatePmNoteText,
  onUpdatePmNoteStatus
}: {
  analytics: DashboardAnalytics;
  opportunities: Opportunity[];
  pipelineOpportunities: Opportunity[];
  jobs: Job[];
  pmNotes: PMNote[];
  onCreateOpportunity: () => void;
  onCreatePmNote: (text: string, jobId?: string) => void;
  onDeletePmNote: (noteId: string) => void;
  onUpdatePmNoteText: (noteId: string, text: string) => void;
  onUpdatePmNoteStatus: (noteId: string, status: PMNote["status"]) => void;
}) {
  const activeJobs = jobs.filter((job) => !["Installed", "Void"].includes(job.installStatus));
  const backlogSummary = summarizeBacklog(jobs);
  const quarterRevenue = jobs.reduce((sum, job) => {
    const installMonth = new Date(job.installStart).getMonth();
    const isQ2 = installMonth >= 3 && installMonth <= 5;
    return isQ2 ? sum + currentContractValue(job.baseContract, job.changeOrders) : sum;
  }, 0);
  const yearlyRevenue = jobs.reduce((sum, job) => sum + currentContractValue(job.baseContract, job.changeOrders), 0);
  const submittedBidValue = opportunities
    .filter((opportunity) => opportunity.status === "Submitted" && !opportunity.winLoss)
    .reduce((sum, opportunity) => sum + opportunity.estimatedValue, 0);
  const weightedPipeline = pipelineOpportunities.reduce((sum, opportunity) => {
    const weight = opportunity.status === "Submitted" ? 0.45 : opportunity.status === "Review / Send" ? 0.3 : opportunity.status === "Pricing" ? 0.18 : 0.08;
    return sum + opportunity.estimatedValue * weight;
  }, 0);
  const dueSoon = opportunities
    .filter((opportunity) => !opportunity.winLoss && opportunity.bidDueDate)
    .filter((opportunity) => {
      const due = new Date(`${opportunity.bidDueDate}T12:00:00`);
      const start = new Date(`${today}T12:00:00`);
      const end = new Date(start);
      end.setDate(end.getDate() + 14);
      return due >= start && due <= end;
    })
    .sort((a, b) => a.bidDueDate.localeCompare(b.bidDueDate));
  const nextSubmitted = opportunities.filter((opportunity) => opportunity.status === "Submitted" && !opportunity.winLoss);
  const pmActions = buildPmActionItems({ jobs, notes: pmNotes, today }).slice(0, 10);

  return (
    <div className="stack home-stack">
      <section className="home-hero">
        <div>
          <span className="eyebrow">Thu, May 7, 2026</span>
          <h2>Home</h2>
          <p>
            {pipelineOpportunities.length} active bids are moving. {nextSubmitted.length} submitted bids are waiting in the register.
          </p>
        </div>
        <button className="primary" onClick={onCreateOpportunity}>New ITB</button>
      </section>
      <div className="metric-grid">
        <Metric label="Contract backlog" value={money.format(backlogSummary.totalBacklog)} detail={`${money.format(backlogSummary.wonNotStarted)} won not started`} />
        <Metric label="Revenue this Q" value={money.format(quarterRevenue)} detail="Jobs installing this quarter" />
        <Metric label="Active jobs" value={activeJobs.length} detail={`${money.format(backlogSummary.activeProduction)} in production`} />
        <Metric label="Active bids" value={pipelineOpportunities.length} detail={`${dueSoon.length} due in the next two weeks`} />
      </div>
      <PMActionBoard
        actions={pmActions}
        jobs={jobs}
        onCreateNote={onCreatePmNote}
        onDeleteNote={onDeletePmNote}
        onUpdateNoteText={onUpdatePmNoteText}
        onUpdateNoteStatus={onUpdatePmNoteStatus}
        title="PM action board"
      />
      <section className="home-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Bid calendar</h2>
              <p>Pipeline due dates for the next two weeks.</p>
            </div>
          </div>
          <BidCalendar opportunities={dueSoon} />
        </div>
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Pipeline focus</h2>
              <p>What needs attention before it becomes a long-term register item.</p>
            </div>
          </div>
          <div className="focus-list">
            {pipelineOpportunities.slice(0, 6).map((opportunity) => (
              <div className="focus-row" key={opportunity.id}>
                <div>
                  <strong>{opportunity.projectName}</strong>
                  <span>{opportunity.client} - {opportunity.jobId}</span>
                </div>
                <Status value={opportunity.status} />
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="panel two-column">
        <div>
          <h2>How this should behave</h2>
          <p>
            Pipeline is for active bid work: Lead / ITB, Pricing, Review / Send, and Submitted. Bid Register is the
            masterpoint where submitted and cold bids can live for months until they become Won or Lost.
          </p>
          <div className="flow">
            <span>Lead / ITB</span>
            <span>Pricing</span>
            <span>Review / Send</span>
            <span>Submitted</span>
            <span>Bid Register</span>
            <span>Won to Jobs</span>
          </div>
        </div>
        <div className="forecast-card">
          <span className="eyebrow">Backlog / forecast</span>
          <div className="forecast-total">{money.format(backlogSummary.totalBacklog)}</div>
          <div className="forecast-lines">
            <div><span>Current contract value</span><strong>{money.format(yearlyRevenue)}</strong></div>
            <div><span>Won not started</span><strong>{money.format(backlogSummary.wonNotStarted)}</strong></div>
            <div><span>Submitted bid value</span><strong>{money.format(submittedBidValue)}</strong></div>
            <div><span>Weighted pipeline</span><strong>{money.format(weightedPipeline)}</strong></div>
          </div>
          <small>Awarded work carries as backlog until installed, completed, or voided.</small>
        </div>
      </section>
    </div>
  );
}

function BidCalendar({ opportunities }: { opportunities: Opportunity[] }) {
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(`${today}T12:00:00`);
    date.setDate(date.getDate() + index);
    return date;
  });

  return (
    <div className="bid-calendar">
      {days.map((day) => {
        const iso = day.toISOString().slice(0, 10);
        const bids = opportunities.filter((opportunity) => opportunity.bidDueDate === iso);
        return (
          <article className={bids.length ? "has-bids" : ""} key={iso}>
            <span>{day.toLocaleDateString("en-US", { weekday: "short" })}</span>
            <strong>{day.getDate()}</strong>
            {bids.map((bid) => (
              <small key={bid.id}>{bid.jobId} {bid.projectName}</small>
            ))}
          </article>
        );
      })}
    </div>
  );
}

function PMActionBoard({
  actions,
  compact = false,
  jobs,
  onCreateNote,
  onDeleteNote,
  onUpdateNoteText,
  onUpdateNoteStatus,
  title
}: {
  actions: PMActionItem[];
  compact?: boolean;
  jobs: Job[];
  onCreateNote: (text: string, jobId?: string) => void;
  onDeleteNote: (noteId: string) => void;
  onUpdateNoteText: (noteId: string, text: string) => void;
  onUpdateNoteStatus: (noteId: string, status: PMNote["status"]) => void;
  title: string;
}) {
  const [noteText, setNoteText] = useState("");
  const [jobId, setJobId] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!noteText.trim()) return;
    onCreateNote(noteText, jobId || undefined);
    setNoteText("");
    setJobId("");
  }

  return (
    <section className={compact ? "panel pm-board compact" : "panel pm-board"} id="job-actions">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <p>Manual post-it notes mixed with job alerts.</p>
        </div>
        <span className="action-count">{actions.length}</span>
      </div>
      <form className="pm-note-entry" onSubmit={addNote}>
        <input
          aria-label="PM note"
          onChange={(event) => setNoteText(event.target.value)}
          placeholder="Call Manny about G26-042, issue stone PO..."
          value={noteText}
        />
        {!compact ? (
          <select aria-label="Link job" onChange={(event) => setJobId(event.target.value)} value={jobId}>
            <option value="">Auto-link job</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>{job.jobNumber}</option>
            ))}
          </select>
        ) : null}
        <button className="primary" type="submit">Add note</button>
      </form>
      <div className="pm-action-list">
        {actions.length ? actions.map((action) => (
          <article className={`pm-action ${action.severity}`} key={action.id}>
            {editingNoteId === action.id ? (
              <form
                className="pm-note-edit"
                onSubmit={(event) => {
                  event.preventDefault();
                  onUpdateNoteText(action.id, editingText);
                  setEditingNoteId(null);
                  setEditingText("");
                }}
              >
                <input aria-label="Edit PM note" onChange={(event) => setEditingText(event.target.value)} value={editingText} />
                <button type="submit">Save</button>
                <button onClick={() => setEditingNoteId(null)} type="button">Cancel</button>
              </form>
            ) : (
              <div>
                <strong>{action.title}</strong>
                <span>{action.detail}</span>
              </div>
            )}
            {action.kind === "manual" ? (
              <div className="pm-action-buttons">
                <button
                  onClick={() => {
                    setEditingNoteId(action.id);
                    setEditingText(action.title);
                  }}
                >
                  Edit
                </button>
                <button onClick={() => onUpdateNoteStatus(action.id, "Done")}>Done</button>
                <button className="danger-text" onClick={() => onDeleteNote(action.id)}>Delete</button>
              </div>
            ) : (
              <small>{action.jobNumber ?? "System"}</small>
            )}
          </article>
        )) : (
          <div className="empty-note">No open PM notes or alerts.</div>
        )}
      </div>
    </section>
  );
}

function OpportunityRegister({
  opportunities,
  query,
  setQuery,
  onOpenOpportunity
}: {
  opportunities: Opportunity[];
  query: string;
  setQuery: (value: string) => void;
  onOpenOpportunity: (id: string) => void;
}) {
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});
  const [registerView, setRegisterView] = useState<RegisterView>("this-year");
  const [selectedYear, setSelectedYear] = useState<number | "all">(2026);
  const years = availableOpportunityYears(opportunities);
  const viewFiltered = filterOpportunitiesForView(opportunities, {
    view: registerView,
    year: selectedYear,
    today
  });
  const filtered = viewFiltered.filter((opportunity) => {
    const haystack = `${opportunity.jobId} ${opportunity.client} ${opportunity.projectName} ${opportunity.status}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  const grouped = groupOpportunitiesByMonth(filtered);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Bid Register</h2>
          <p>Master V4-style tracker for active, submitted, cold, won, and lost opportunities.</p>
        </div>
        <label className="search-box">
          <Search size={16} />
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Search job, client, project, status" value={query} />
        </label>
      </div>
      <div className="register-toolbar">
        <div className="view-chips">
          {registerViews.map((view) => (
            <button className={registerView === view.id ? "active" : ""} key={view.id} onClick={() => setRegisterView(view.id)}>
              {view.label}
            </button>
          ))}
        </div>
        <select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value === "all" ? "all" : Number(event.target.value))}>
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
          <option value="all">All Years</option>
        </select>
      </div>
      <div className="table-wrap">
        <table className="register-table">
          <thead>
            <tr>
              <th>Opportunity ID</th>
              <th>Month</th>
              <th>Client</th>
              <th>Project</th>
              <th>Due</th>
              <th>Stage</th>
              <th>Bid Type</th>
              <th>Sent</th>
              <th>Method</th>
              <th>Status</th>
              <th>Win?</th>
              <th>Job Type</th>
              <th>Est. Value</th>
              <th>Initial Contract</th>
              <th>Links</th>
              <th>Feedback</th>
              <th>NTP</th>
              <th>Final Cost</th>
              <th>Archive</th>
              <th>Follow-up</th>
            </tr>
          </thead>
          <tbody>
            {grouped.flatMap((group) => {
              const collapsed = Boolean(collapsedMonths[group.key]);
              const header = (
                <tr className="month-row" key={`${group.key}-header`}>
                  <td colSpan={20}>
                    <button
                      aria-expanded={!collapsed}
                      onClick={() => setCollapsedMonths((current) => ({ ...current, [group.key]: !current[group.key] }))}
                    >
                      <span>{collapsed ? "+" : "-"}</span>
                      <strong>{group.label}</strong>
                      <em>{group.items.length} opportunities</em>
                      <b>{money.format(group.total)}</b>
                    </button>
                  </td>
                </tr>
              );

              if (collapsed) return [header];

              return [
                header,
                ...group.items.map((opportunity) => {
                  const stale = shouldFlagStaleFollowUp({
                    status: opportunity.status,
                    sentDate: opportunity.sentDate,
                    winLoss: opportunity.winLoss,
                    today,
                    staleAfterDays: 45
                  });
                  return (
                    <tr className="click-row" key={opportunity.id} onClick={() => onOpenOpportunity(opportunity.id)}>
                      <td><strong>{opportunity.jobId}</strong></td>
                      <td>{opportunity.month}</td>
                      <td>{opportunity.client}</td>
                      <td><strong>{opportunity.projectName}</strong></td>
                      <td>{opportunity.bidDueDate || "Unscheduled"}</td>
                      <td>{opportunity.drawingStage}</td>
                      <td>{opportunity.bidType}</td>
                      <td>{opportunity.sentDate || "-"}</td>
                      <td>{opportunity.submissionMethod || "-"}</td>
                      <td><Status value={opportunity.status} /></td>
                      <td>{opportunity.winLoss || "Waiting"}</td>
                      <td>{opportunity.jobType}</td>
                      <td>{money.format(opportunity.estimatedValue)}</td>
                      <td>{opportunity.initialContractValue == null ? "-" : money.format(opportunity.initialContractValue)}</td>
                      <td><LinkDots opportunity={opportunity} /></td>
                      <td>{opportunity.bidFeedback ? "View" : "-"}</td>
                      <td>{opportunity.ntpReceived ? "Yes" : "No"}</td>
                      <td>{opportunity.finalCost == null ? "-" : money.format(opportunity.finalCost)}</td>
                      <td>{coldArchiveLabel(opportunity)}</td>
                      <td>{stale ? <span className="flag">Stale</span> : opportunity.bidFeedback ? "Feedback" : "Current"}</td>
                    </tr>
                  );
                })
              ];
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function groupOpportunitiesByMonth(opportunities: Opportunity[]) {
  const order = new Map([
    ["January", 1],
    ["February", 2],
    ["March", 3],
    ["April", 4],
    ["May", 5],
    ["June", 6],
    ["July", 7],
    ["August", 8],
    ["September", 9],
    ["October", 10],
    ["November", 11],
    ["December", 12]
  ]);

  const groups = opportunities.reduce<Record<string, Opportunity[]>>((acc, opportunity) => {
    const key = opportunity.month || monthFromDate(opportunity.bidDueDate) || "Unscheduled";
    acc[key] = [...(acc[key] ?? []), opportunity];
    return acc;
  }, {});

  return Object.entries(groups)
    .map(([key, items]) => ({
      key,
      label: key,
      items: items.sort((a, b) => (a.bidDueDate || "9999-12-31").localeCompare(b.bidDueDate || "9999-12-31")),
      total: items.reduce((sum, opportunity) => sum + opportunity.estimatedValue, 0),
      sort: order.get(key) ?? 99
    }))
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
}

function monthFromDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "long" });
}

function availableOpportunityYears(opportunities: Opportunity[]) {
  const years = new Set<number>();
  opportunities.forEach((opportunity) => {
    [opportunity.bidDueDate, opportunity.sentDate, opportunity.jobId?.match(/^Q-(\d{2})-/)?.[1] ? `20${opportunity.jobId.match(/^Q-(\d{2})-/)?.[1]}-01-01` : ""]
      .forEach((value) => {
        const year = yearFromDate(value);
        if (year) years.add(year);
      });
  });

  if (!years.size) years.add(2026);
  return Array.from(years).sort((a, b) => b - a);
}

function yearFromDate(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.getFullYear();
}

function nextOpportunityId({
  date,
  jobs,
  opportunities
}: {
  date: string;
  jobs: Job[];
  opportunities: Opportunity[];
}) {
  const year = new Date(`${date}T12:00:00`).getFullYear().toString().slice(-2);
  const pattern = new RegExp(`^Q-${year}-(\\d{3})$`);
  const numbers = [
    ...opportunities.map((opportunity) => opportunity.jobId),
    ...jobs.map((job) => job.bidRef ?? "")
  ]
    .map((value) => value.match(pattern)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value));
  const next = Math.max(0, ...numbers) + 1;

  return `Q-${year}-${String(next).padStart(3, "0")}`;
}

function LinkDots({ opportunity }: { opportunity: Opportunity }) {
  const links: Array<[string, boolean]> = [
    ["D", Boolean(opportunity.links.drawings || opportunity.files?.some((file) => file.slot === "drawings"))],
    ["S", Boolean(opportunity.links.specs || opportunity.files?.some((file) => file.slot === "specs"))],
    ["C", Boolean(opportunity.links.schedule || opportunity.files?.some((file) => file.slot === "schedule"))],
    ["P", Boolean(opportunity.files?.some((file) => file.slot === "proposal"))],
    ["K", Boolean(opportunity.files?.some((file) => file.slot === "contract"))]
  ];

  return (
    <div className="link-dots">
      {links.map(([label, href]) => (
        <span className={href ? "on" : ""} key={label}>{label}</span>
      ))}
    </div>
  );
}

function coldArchiveLabel(opportunity: Opportunity) {
  if (opportunity.status !== "Cold" || opportunity.winLoss === "Won") return "-";
  const basis = opportunity.sentDate || opportunity.bidDueDate;
  if (!basis) return "12 mo";
  const archiveDate = new Date(`${basis}T12:00:00`);
  archiveDate.setFullYear(archiveDate.getFullYear() + 1);
  return archiveDate.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function PipelineKanban({
  opportunities,
  onOpenOpportunity
}: {
  opportunities: Opportunity[];
  onOpenOpportunity: (id: string) => void;
}) {
  const columns: OpportunityStatus[] = ["Lead / ITB", "Pricing", "Review / Send"];

  return (
    <div className="kanban">
      {columns.map((column) => (
        <section className="kanban-column" key={column}>
          <h2>{column}</h2>
          {opportunities
            .filter((opportunity) => opportunity.status === column)
            .map((opportunity) => (
              <article className="bid-card" key={opportunity.id} onClick={() => onOpenOpportunity(opportunity.id)}>
                <span>{opportunity.jobId}</span>
                <h3>{opportunity.projectName}</h3>
                <p>{opportunity.client}</p>
                <strong>{money.format(opportunity.estimatedValue)}</strong>
              </article>
            ))}
        </section>
      ))}
    </div>
  );
}

function EstimatorWorkspace({
  estimate,
  totals,
  onExportPdf
}: {
  estimate: Estimate;
  totals: ReturnType<typeof calculateEstimateTotals>;
  onExportPdf: () => void;
}) {
  return (
    <div className="estimator-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{estimate.projectName}</h2>
            <p>{estimate.client} - {estimate.pricingMode} - OH {estimate.ohPct}% - Delivery {estimate.delPct}% - Install {estimate.insPct}%</p>
          </div>
          <button className="primary" onClick={onExportPdf}><FileDown size={16} /> Export PDF</button>
        </div>
        {estimate.areas.map((area) => (
          <div className="estimate-area" key={area.id}>
            <h3>{area.name} <span>Qty {area.qty}</span></h3>
            {area.sections.map((section) => (
              <div className="estimate-section" key={section.id}>
                <h4>{section.name}</h4>
                {section.items.map((item) => (
                  <div className="estimate-row" key={item.id}>
                    <span>{item.name}</span>
                    <span>{item.qty} {item.unit}</span>
                    <span>{money.format(item.unitCost)}</span>
                    <strong>{money.format(item.qty * item.unitCost)}</strong>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </section>
      <aside className="panel totals-panel">
        <h2>Proposal totals</h2>
        <Metric label="Material" value={money.format(totals.material)} />
        <Metric label="Overhead" value={money.format(totals.overhead)} />
        <Metric label="Delivery" value={money.format(totals.delivery)} />
        <Metric label="Install" value={money.format(totals.install)} />
        <Metric label="Supplier / sub" value={money.format(totals.subcontractorSell)} />
        <div className="grand-total">{money.format(totals.bidTotal)}</div>
        <h3>Proposal language</h3>
        <ul>
          {[...estimate.clarifications, ...estimate.exclusions].map((line) => <li key={line}>{line}</li>)}
        </ul>
      </aside>
    </div>
  );
}

function JobsView({
  jobs,
  onApproveCos,
  onCreatePurchaseOrder,
  onCreatePmNote,
  onCreateSubmittal,
  onEditPurchaseOrder,
  onEditSubmittal,
  onPurchaseOrderFile,
  onUpdateJob,
  onDeletePmNote,
  onUpdatePmNoteStatus,
  onUpdatePmNoteText,
  pmNotes,
  onOpenJob,
  onSubmittalChecklist,
  onSubmittalAction,
  onSubmittalFile,
  saveStatus
}: {
  jobs: Job[];
  onApproveCos: (id: string) => void;
  onCreatePurchaseOrder: (jobId: string, input: Omit<PurchaseOrder, "id" | "jobId">) => void;
  onCreatePmNote: (text: string, jobId?: string) => void;
  onCreateSubmittal: (jobId: string, input: Omit<SubmittalPackage, "id" | "jobId" | "status" | "revision">) => void;
  onEditPurchaseOrder: (jobId: string, poId: string, updates: Partial<PurchaseOrder>) => void;
  onEditSubmittal: (jobId: string, submittalId: string, updates: UpdateSubmittalInput) => void;
  onPurchaseOrderFile: (jobId: string, poId: string, file: File | undefined) => void;
  onUpdateJob: (jobId: string, updates: Partial<Job>) => void;
  onDeletePmNote: (noteId: string) => void;
  onUpdatePmNoteStatus: (noteId: string, status: PMNote["status"]) => void;
  onUpdatePmNoteText: (noteId: string, text: string) => void;
  pmNotes: PMNote[];
  onOpenJob: (jobId: string) => void;
  onSubmittalChecklist: (jobId: string, submittalId: string, updates: Parameters<typeof setSubmittalChecklistState>[1]) => void;
  onSubmittalAction: (jobId: string, submittalId: string, action: SubmittalAction) => void;
  onSubmittalFile: (jobId: string, submittalId: string, file: File | undefined) => void;
  saveStatus: string;
}) {
  const [statusFilter, setStatusFilter] = useState("Open");
  const backlogSummary = summarizeBacklog(jobs);
  const filteredJobs = jobs.filter((job) => {
    const submittalSummary = summarizeSubmittals(job.submittals, today);
    if (statusFilter === "Open") return !["Complete", "Installed", "Void"].includes(job.backlogStatus);
    if (statusFilter === "Needs Dates") return !job.forecastStart || !job.installStart;
    if (statusFilter === "Pending COs") return summarizeChangeOrders(job.changeOrders).submitted > 0;
    if (statusFilter === "Submittal Blocked") return submittalSummary.releaseState === "Blocked";
    return job.backlogStatus === statusFilter;
  });
  const pendingCoValue = jobs.reduce((sum, job) => sum + summarizeChangeOrders(job.changeOrders).submitted, 0);
  const releaseBlocked = jobs.filter((job) => summarizeSubmittals(job.submittals, today).releaseState === "Blocked").length;
  const allActions = buildPmActionItems({ jobs, notes: pmNotes, today });

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Jobs</h2>
            <p>Operational backlog, contract value, install timing, and CO exposure.</p>
            <small className="persistence-note">{saveStatus}</small>
          </div>
          <BriefcaseBusiness size={28} />
        </div>
        <div className="metric-grid small">
          <Metric label="Total backlog" value={money.format(backlogSummary.totalBacklog)} />
          <Metric label="Won not started" value={money.format(backlogSummary.wonNotStarted)} />
          <Metric label="Release blocked" value={String(releaseBlocked)} />
          <Metric label="Pending COs" value={money.format(pendingCoValue)} />
        </div>
        <div className="view-tabs">
          {["Open", "Awarded / Waiting", "Submittals", "Submittal Blocked", "Release Pending", "In Fabrication", "Ready to Install", "Installing", "Pending COs", "Needs Dates", "Complete"].map((filter) => (
            <button className={statusFilter === filter ? "active" : ""} key={filter} onClick={() => setStatusFilter(filter)}>{filter}</button>
          ))}
        </div>
        <div className="table-wrap jobs-table-wrap">
          <table className="jobs-table">
            <thead>
              <tr>
                <th>Job #</th>
                <th>Project</th>
                <th>GC</th>
                <th>Status</th>
                <th>Submittals</th>
                <th>Current Contract</th>
                <th>Install Start</th>
                <th>PM</th>
                <th>Actions</th>
                <th>Pending COs</th>
                <th>Forecast</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => {
                const coSummary = summarizeChangeOrders(job.changeOrders);
                const currentValue = currentContractValue(job.baseContract, job.changeOrders);
                const submittalSummary = summarizeSubmittals(job.submittals, today);
                const actionCount = allActions.filter((action) => action.jobId === job.id && action.status !== "Done").length;
                return (
                  <tr key={job.id} onClick={() => onOpenJob(job.id)}>
                    <td><strong>{job.jobNumber}</strong></td>
                    <td><span className="truncate-cell">{job.projectName}</span><small>{job.client}</small></td>
                    <td>{job.gc}</td>
                    <td><Status value={job.backlogStatus} /></td>
                    <td>
                      <span className={`submittal-signal ${submittalSummary.severity}`}>{submittalSummary.label}</span>
                      <small>{submittalSummary.releaseState}</small>
                    </td>
                    <td>{money.format(currentValue)}</td>
                    <td>{job.installStart || "TBD"}</td>
                    <td>{job.pm}</td>
                    <td>{actionCount ? <span className="action-count">{actionCount}</span> : "-"}</td>
                    <td>{coSummary.submitted ? money.format(coSummary.submitted) : "-"}</td>
                    <td>{job.forecastQuarter || "TBD"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function CalendarCapacityView({ jobs, onOpenJob }: { jobs: Job[]; onOpenJob: (jobId: string) => void }) {
  const installCrewCapacity = 5;
  const shopJobCapacity = 3;
  const [visibleMonth, setVisibleMonth] = useState("2026-08");
  const [selectedDay, setSelectedDay] = useState<InstallCalendarDay | null>(null);
  const activeJobs = jobs.filter((job) => !["Complete", "Installed", "Void"].includes(job.backlogStatus));
  const calendarMonth = buildInstallCalendarMonth({
    jobs: activeJobs,
    month: visibleMonth,
    installCrewCapacity
  });
  const weeks = buildCapacityWeeks({
    jobs: activeJobs,
    startDate: today,
    weekCount: 18,
    installCrewCapacity,
    shopJobCapacity
  });
  const overloadedWeeks = weeks.filter((week) => week.installStatus === "overloaded" || week.shopStatus === "overloaded");
  const installWeeks = weeks.filter((week) => week.installJobCount > 0);
  const shopBusyWeeks = weeks.filter((week) => week.shopJobCount >= shopJobCapacity);

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Calendar / Capacity</h2>
            <p>Install windows shown as shaded calendar dates, with shop and crew conflicts called out below.</p>
          </div>
          <CalendarDays size={28} />
        </div>
        <div className="metric-grid small">
          <Metric label="Install crew capacity" value={`${installCrewCapacity}`} detail="Peak crew target per day" />
          <Metric label="Shop capacity" value={`${shopJobCapacity}`} detail="Active fab jobs per week" />
          <Metric label="Install weeks" value={String(installWeeks.length)} detail="Weeks with scheduled installs" />
          <Metric label="Overloaded weeks" value={String(overloadedWeeks.length)} detail="Need a PM decision" />
        </div>
      </section>
      <section className="panel install-calendar-panel">
        <div className="panel-header">
          <div>
            <h2>{calendarMonth.label}</h2>
            <p>Only the job number is shown on the date. Click a date for install details.</p>
          </div>
          <div className="calendar-controls">
            <button aria-label="Previous month" onClick={() => setVisibleMonth((month) => addMonthsToCalendarMonth(month, -1))}>
              <ChevronLeft size={16} />
            </button>
            <button aria-label="Next month" onClick={() => setVisibleMonth((month) => addMonthsToCalendarMonth(month, 1))}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="install-calendar-weekdays">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="install-calendar">
          {calendarMonth.days.map((day) => (
            <InstallCalendarDayCell day={day} key={day.date} onOpen={setSelectedDay} />
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>PM readout</h2>
            <p>Weeks that need expectation management, crew planning, or schedule cleanup.</p>
          </div>
        </div>
        <div className="capacity-readout">
          {overloadedWeeks.length ? overloadedWeeks.map((week) => (
            <div className="capacity-warning-row" key={week.weekStart}>
              <strong>{formatDateRange(week.weekStart, week.weekEnd)}</strong>
              <span>{week.warnings.join(" | ")}</span>
            </div>
          )) : <div className="empty-note">No overloads in the current capacity window.</div>}
        </div>
      </section>
      {selectedDay ? <InstallDayModal day={selectedDay} onClose={() => setSelectedDay(null)} onOpenJob={onOpenJob} /> : null}
    </div>
  );
}

function InstallCalendarDayCell({ day, onOpen }: { day: InstallCalendarDay; onOpen: (day: InstallCalendarDay) => void }) {
  return (
    <button className={`install-day ${day.inMonth ? "" : "muted"} ${day.jobs.length ? "has-install" : ""} ${day.isOverloaded ? "overloaded" : ""}`} onClick={() => onOpen(day)}>
      <div className="install-day-number">
        <span>{day.dayNumber}</span>
        {day.crewTotal ? <small>{day.crewTotal}</small> : null}
      </div>
      {day.jobs.map((job) => (
        <div className="install-job-chip" key={`${day.date}-${job.id}`}>
          {job.jobNumber}
        </div>
      ))}
    </button>
  );
}

function InstallDayModal({
  day,
  onClose,
  onOpenJob
}: {
  day: InstallCalendarDay;
  onClose: () => void;
  onOpenJob: (jobId: string) => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="opportunity-modal install-day-modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <span className="eyebrow">Install details</span>
            <h2>{shortDate(day.date)}</h2>
            <p>{day.jobs.length} job{day.jobs.length === 1 ? "" : "s"} scheduled - crew load {day.crewTotal || 0}</p>
          </div>
          <button className="modal-close" onClick={onClose}>x</button>
        </header>
        <div className="modal-body">
          {day.jobs.length ? day.jobs.map((job) => (
            <article className="install-detail-row" key={job.id}>
              <strong>{job.jobNumber}</strong>
              <div>
                <h3>{job.projectName}</h3>
                <p>{job.gc || "GC TBD"} - PM {job.pm || "TBD"}</p>
                <span>Install {job.installStart} to {job.installEnd || job.installStart} - crew {job.crewSize ?? 1}</span>
                <button
                  className="primary"
                  onClick={() => {
                    onClose();
                    onOpenJob(job.id);
                  }}
                >
                  Open Job
                </button>
              </div>
            </article>
          )) : <div className="empty-note">No installs scheduled on this date.</div>}
        </div>
      </section>
    </div>
  );
}

function JobDetailModal({
  job,
  onApproveCos,
  onUpdateCoStatus,
  onClose,
  onCreatePurchaseOrder,
  onCreatePmNote,
  onCreateSubmittal,
  onEditPurchaseOrder,
  onEditSubmittal,
  onJobFile,
  onPurchaseOrderFile,
  onStartChangeOrder,
  onUpdateJob,
  onDeletePmNote,
  onUpdatePmNoteStatus,
  onUpdatePmNoteText,
  pmNotes,
  onSubmittalChecklist,
  onSubmittalFile,
  onSubmittalAction,
  canEditHeader = true
}: {
  job: Job;
  onApproveCos: (id: string) => void;
  onUpdateCoStatus: (jobId: string, coId: string, status: ChangeOrderStatus) => void;
  onClose: () => void;
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
  pmNotes: PMNote[];
  onSubmittalChecklist: (jobId: string, submittalId: string, updates: Parameters<typeof setSubmittalChecklistState>[1]) => void;
  onSubmittalFile: (jobId: string, submittalId: string, file: File | undefined) => void;
  onSubmittalAction: (jobId: string, submittalId: string, action: SubmittalAction) => void;
  canEditHeader?: boolean;
}) {
  const coSummary = summarizeChangeOrders(job.changeOrders);
  const currentValue = currentContractValue(job.baseContract, job.changeOrders);
  const poSummary = summarizePurchaseOrders(job.purchaseOrders, today);
  const costSummary = jobCostSummary(job, today);
  const margin = costSummary.projectedMarginPct;
  const submittalSummary = summarizeSubmittals(job.submittals, today);
  const jobActions = buildPmActionItems({
    jobs: [job],
    notes: pmNotes.filter((note) => note.jobId === job.id),
    today
  }).slice(0, 8);
  const [activeTab, setActiveTab] = useState<JobDetailTabId>("actions");
  const [submittalDraft, setSubmittalDraft] = useState({
    name: "",
    type: "Shop Drawings" as SubmittalPackage["type"],
    dueDate: "",
    owner: job.pm,
    releaseBlocker: true,
    notes: ""
  });
  const [poDraft, setPoDraft] = useState({
    poNumber: `PO-${job.jobNumber}-${String((job.purchaseOrders?.length ?? 0) + 1).padStart(3, "0")}`,
    vendor: "",
    scope: "Stone / Quartz" as PurchaseOrderScope,
    description: "",
    status: "Draft" as PurchaseOrderStatus,
    committedAmount: "",
    neededBy: "",
    promisedDate: "",
    owner: job.pm,
    notes: ""
  });

  function addSubmittal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submittalDraft.name.trim()) return;

    onCreateSubmittal(job.id, {
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

    onCreatePurchaseOrder(job.id, {
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
  const primaryDocumentSlots = ["drawings", "specs", "schedule", "contract", "proposal", "submittals"];
  const shopDrawingPackage = job.submittals.find((item) => item.type === "Shop Drawings" || item.name.toLowerCase().includes("shop"));
  const materialStatus = job.purchaseOrders.length === 0
    ? "Needs PO review"
    : job.purchaseOrders.some((po) => po.status === "Draft")
      ? "PO needs issue"
      : "Ordered / tracking";
  const documentCount = primaryDocumentSlots.filter((slot) => job.files.some((file) => file.slot === slot)).length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="opportunity-modal job-modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <span className="eyebrow">{job.jobNumber} - {job.pm}</span>
            <h2>{job.projectName}</h2>
            <p>{job.client} - GC {job.gc} - Bid ref {job.bidRef}</p>
          </div>
          <button className="modal-close" onClick={onClose}>x</button>
        </header>
        <div className="modal-body job-modal-body">
          <div className="job-detail-main">
          <section className="modal-section overview-card pm-command-card">
            <div className="modal-section-head">
              <h3>PM Command</h3>
              <Status value={job.backlogStatus} />
            </div>
            <div className="pm-critical-strip">
              <article>
                <span>Materials</span>
                <strong>{materialStatus}</strong>
                <small>{poSummary.count ? `${poSummary.count} purchase order${poSummary.count === 1 ? "" : "s"}` : "No POs created"}</small>
              </article>
              <article>
                <span>Install</span>
                <strong>{job.installStart || "TBD"}</strong>
                <small>{installDuration(job.installStart, job.installEnd)} - {job.crewSize} crew</small>
              </article>
              <article>
                <span>Shop drawings</span>
                <strong>{shopDrawingPackage?.status ?? "No package"}</strong>
                <small>{shopDrawingPackage?.dueDate ? `Due ${shopDrawingPackage.dueDate}` : submittalSummary.releaseState}</small>
              </article>
              <article>
                <span>Documents</span>
                <strong>{documentCount} / {primaryDocumentSlots.length}</strong>
                <small>{documentCount === primaryDocumentSlots.length ? "Core docs attached" : "Core docs missing"}</small>
              </article>
            </div>
            <div className="pm-summary-grid">
              <div>
                <span>Project manager</span>
                <strong>{job.pm}</strong>
              </div>
              <div>
                <span>Job number</span>
                <strong>{job.jobNumber}</strong>
              </div>
              <div>
                <span>Contract value</span>
                <strong>{money.format(currentValue)}</strong>
              </div>
              <div>
                <span>Install start</span>
                <strong>{job.installStart || "TBD"}</strong>
              </div>
              <div>
                <span>Install end</span>
                <strong>{job.installEnd || "TBD"}</strong>
              </div>
              <div>
                <span>Duration & crew</span>
                <strong>{installDuration(job.installStart, job.installEnd)} - {job.crewSize} crew</strong>
              </div>
              <div>
                <span>GC / contractor</span>
                <strong>{job.gc || "-"}</strong>
              </div>
              <div>
                <span>Margin</span>
                <strong>{margin == null ? "TBD" : `${margin}%`}</strong>
              </div>
            </div>
            <div className="pm-command-lines">
              <p><ClipboardList size={15} /> Submittals {submittalSummary.label} - {submittalSummary.releaseState}</p>
              <p><BriefcaseBusiness size={15} /> Approved COs {money.format(coSummary.approved)} - Pending {money.format(coSummary.submitted)}</p>
              <p><CalendarDays size={15} /> Fab {job.expectedFabStart || "TBD"} - Complete {job.expectedCompletion || "TBD"}</p>
            </div>
            <div className="pm-document-strip">
              <span className="eyebrow">Job documents</span>
              {primaryDocumentSlots.map((slot) => {
                const file = job.files.find((candidate) => candidate.slot === slot);
                return <span className={file ? "filled" : ""} key={slot}>{slot}{file ? <> - <FileLink file={file} /></> : " - missing"}</span>;
              })}
            </div>
            <p>{job.notes}</p>
            {canEditHeader && <details className="job-header-edit-panel">
              <summary>Edit job header</summary>
              <div className="job-header-edit-grid">
                <label>
                  <span>Backlog status</span>
                  <select onChange={(e) => onUpdateJob(job.id, { backlogStatus: e.target.value as Job["backlogStatus"] })} value={job.backlogStatus}>
                    {["Awarded / Waiting", "Submittals", "Release Pending", "In Fabrication", "Ready to Install", "Installing", "Installed", "Closeout", "Complete", "Void"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label>
                  <span>Fab status</span>
                  <select onChange={(e) => onUpdateJob(job.id, { fabStatus: e.target.value as Job["fabStatus"] })} value={job.fabStatus}>
                    {["Not Started", "In Fabrication", "Ready", "Complete"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label>
                  <span>Install status</span>
                  <select onChange={(e) => onUpdateJob(job.id, { installStatus: e.target.value as Job["installStatus"] })} value={job.installStatus}>
                    {["Ready", "Active", "Completed", "Installed", "Void"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label>
                  <span>Invoice status</span>
                  <select onChange={(e) => onUpdateJob(job.id, { invoiceStatus: e.target.value as Job["invoiceStatus"] })} value={job.invoiceStatus}>
                    {["Not Billed", "Partial", "Billed", "Paid"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label>
                  <span>Install start</span>
                  <input onBlur={(e) => onUpdateJob(job.id, { installStart: e.target.value })} defaultValue={job.installStart} type="date" />
                </label>
                <label>
                  <span>Install end</span>
                  <input onBlur={(e) => onUpdateJob(job.id, { installEnd: e.target.value })} defaultValue={job.installEnd} type="date" />
                </label>
                <label>
                  <span>Crew size</span>
                  <input min="0" onBlur={(e) => onUpdateJob(job.id, { crewSize: Number(e.target.value) || 0 })} defaultValue={job.crewSize} type="number" />
                </label>
                <label>
                  <span>PM</span>
                  <input onBlur={(e) => onUpdateJob(job.id, { pm: e.target.value })} defaultValue={job.pm} type="text" />
                </label>
              </div>
            </details>}
          </section>
          <nav className="job-detail-nav" aria-label="Job detail tabs">
            {jobDetailTabs.map((tab) => (
              <button className={activeTab === tab.id ? "active" : ""} key={tab.id} onClick={() => setActiveTab(tab.id)}>
                {tab.label}
              </button>
            ))}
          </nav>
          {activeTab === "actions" ? (
          <PMActionBoard
            actions={jobActions}
            compact
            jobs={[job]}
            onCreateNote={(text) => onCreatePmNote(text, job.id)}
            onDeleteNote={onDeletePmNote}
            onUpdateNoteText={onUpdatePmNoteText}
            onUpdateNoteStatus={onUpdatePmNoteStatus}
            title="Actions / Notes"
          />
          ) : null}
          {activeTab === "submittals" ? (
          <section className="modal-section" id="job-submittals">
            <div className="modal-section-head">
              <h3>Shop Drawings & Submittals</h3>
              <span className={`submittal-signal ${submittalSummary.severity}`}>{submittalSummary.label}</span>
            </div>
            <form className="submittal-create" onSubmit={addSubmittal}>
              <input
                aria-label="Package name"
                onChange={(event) => setSubmittalDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="Package name"
                value={submittalDraft.name}
              />
              <select
                aria-label="Package type"
                onChange={(event) =>
                  setSubmittalDraft((current) => ({ ...current, type: event.target.value as SubmittalPackage["type"] }))
                }
                value={submittalDraft.type}
              >
                {submittalTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <input
                aria-label="Due date"
                onChange={(event) => setSubmittalDraft((current) => ({ ...current, dueDate: event.target.value }))}
                type="date"
                value={submittalDraft.dueDate}
              />
              <input
                aria-label="Owner"
                onChange={(event) => setSubmittalDraft((current) => ({ ...current, owner: event.target.value }))}
                placeholder="Owner"
                value={submittalDraft.owner}
              />
              <label className="tiny-check">
                <input
                  checked={submittalDraft.releaseBlocker}
                  onChange={(event) => setSubmittalDraft((current) => ({ ...current, releaseBlocker: event.target.checked }))}
                  type="checkbox"
                />
                Blocks release
              </label>
              <input
                aria-label="Package notes"
                onChange={(event) => setSubmittalDraft((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Notes"
                value={submittalDraft.notes}
              />
              <button className="primary" type="submit">Add package</button>
            </form>
            <div className="submittal-card-grid">
              {job.submittals.map((item) => {
                const packageFiles = job.files.filter((file) => file.ownerType === "submittal" && file.ownerId === item.id);
                const isApproved = ["Approved", "Approved as Noted"].includes(item.status);
                const isSubmitted = ["Submitted", "Approved", "Approved as Noted", "Rejected / Revise and Resubmit", "Resubmitted"].includes(item.status);
                const needsRevision = item.status === "Rejected / Revise and Resubmit";
                return (
                  <article className={`submittal-card ${isApproved ? "approved" : needsRevision ? "revise" : item.releaseBlocker ? "blocked" : ""}`} key={item.id}>
                    <div className="submittal-card-head">
                      <div>
                        <span>{item.type}</span>
                        <h4>{item.name}</h4>
                      </div>
                      <Status value={item.status} />
                    </div>
                    <div className="submittal-card-meta">
                      <div><span>Due</span><strong>{item.dueDate || "TBD"}</strong></div>
                      <div><span>Owner</span><strong>{item.owner || "TBD"}</strong></div>
                      <div><span>Release</span><strong>{item.releaseBlocker ? "Blocks release" : "Not blocking"}</strong></div>
                      <div><span>Revision</span><strong>{item.revision ? `Rev ${item.revision}` : "Original"}</strong></div>
                    </div>
                    <p>{item.notes || "No notes yet."}</p>
                    <div className="submittal-chip-row">
                      <button className={isSubmitted ? "active" : ""} onClick={() => onSubmittalChecklist(job.id, item.id, { submitted: !isSubmitted })}>Submitted</button>
                      <button className={isApproved ? "active" : ""} onClick={() => onSubmittalChecklist(job.id, item.id, { approved: !isApproved })}>Approved</button>
                      <button className={needsRevision ? "active warn" : ""} onClick={() => onSubmittalChecklist(job.id, item.id, { revise: !needsRevision })}>Revise</button>
                      <button className={item.releaseBlocker ? "active" : ""} onClick={() => onEditSubmittal(job.id, item.id, { releaseBlocker: !item.releaseBlocker })}>Blocks</button>
                      {!["Approved", "Approved as Noted", "Void / Not Required"].includes(item.status) ? (
                        <button onClick={() => onSubmittalAction(job.id, item.id, "notRequired")}>N/R</button>
                      ) : null}
                      {item.status === "Void / Not Required" ? (
                        <button onClick={() => onEditSubmittal(job.id, item.id, { status: "Not Started", releaseBlocker: true })}>Restore</button>
                      ) : null}
                    </div>
                    <details className="submittal-edit-panel">
                      <summary>Edit package</summary>
                      <div className="submittal-edit-grid">
                          <input
                            aria-label={`${item.name} name`}
                            className="inline-cell-input strong"
                            onChange={(event) => onEditSubmittal(job.id, item.id, { name: event.target.value })}
                            value={item.name}
                          />
                          <select
                            aria-label={`${item.name} type`}
                            className="inline-cell-input"
                            onChange={(event) =>
                              onEditSubmittal(job.id, item.id, { type: event.target.value as SubmittalPackage["type"] })
                            }
                            value={item.type}
                          >
                            {submittalTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                          </select>
                          <input
                            aria-label={`${item.name} due date`}
                            className="inline-cell-input"
                            onChange={(event) => onEditSubmittal(job.id, item.id, { dueDate: event.target.value })}
                            type="date"
                            value={item.dueDate ?? ""}
                          />
                          <input
                            aria-label={`${item.name} owner`}
                            className="inline-cell-input"
                            onChange={(event) => onEditSubmittal(job.id, item.id, { owner: event.target.value })}
                            value={item.owner ?? ""}
                          />
                          <input
                            aria-label={`${item.name} resubmitted date`}
                            className="inline-cell-input"
                            disabled={item.status !== "Rejected / Revise and Resubmit" && item.status !== "Resubmitted"}
                            onChange={(event) => onSubmittalChecklist(job.id, item.id, { resubmittedDate: event.target.value })}
                            type="date"
                            value={item.status === "Rejected / Revise and Resubmit" ? "" : item.status === "Resubmitted" ? item.submittedDate ?? "" : ""}
                          />
                          <input
                            aria-label={`${item.name} notes`}
                            className="inline-cell-input"
                            onChange={(event) => onEditSubmittal(job.id, item.id, { notes: event.target.value })}
                            placeholder="Notes"
                            value={item.notes ?? ""}
                          />
                      </div>
                    </details>
                    <div className="package-files">
                      {packageFiles.map((file) => <span key={file.id}><FileLink file={file} /></span>)}
                      <label>
                        Upload file
                        <input onChange={(event) => onSubmittalFile(job.id, item.id, event.target.files?.[0])} type="file" />
                      </label>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
          ) : null}
          {activeTab === "financials" ? (
          <>
          <section className="modal-section" id="job-pos">
            <div className="modal-section-head">
              <h3>Subcontracts / POs</h3>
              <span className={poSummary.lateCount ? "submittal-signal bad" : "submittal-signal neutral"}>
                {poSummary.lateCount ? `${poSummary.lateCount} late` : `${money.format(poSummary.committed)} committed`}
              </span>
            </div>
            <form className="po-create" onSubmit={addPurchaseOrder}>
              <input aria-label="PO number" onChange={(event) => setPoDraft((current) => ({ ...current, poNumber: event.target.value }))} placeholder="PO #" value={poDraft.poNumber} />
              <input aria-label="PO vendor" onChange={(event) => setPoDraft((current) => ({ ...current, vendor: event.target.value }))} placeholder="Vendor" value={poDraft.vendor} />
              <select aria-label="PO scope" onChange={(event) => setPoDraft((current) => ({ ...current, scope: event.target.value as PurchaseOrderScope }))} value={poDraft.scope}>
                {purchaseOrderScopes.map((scope) => <option key={scope} value={scope}>{scope}</option>)}
              </select>
              <select aria-label="PO status" onChange={(event) => setPoDraft((current) => ({ ...current, status: event.target.value as PurchaseOrderStatus }))} value={poDraft.status}>
                {purchaseOrderStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <input aria-label="PO amount" onChange={(event) => setPoDraft((current) => ({ ...current, committedAmount: event.target.value }))} placeholder="Committed" type="number" value={poDraft.committedAmount} />
              <input aria-label="PO needed by" onChange={(event) => setPoDraft((current) => ({ ...current, neededBy: event.target.value }))} type="date" value={poDraft.neededBy} />
              <input aria-label="PO promised date" onChange={(event) => setPoDraft((current) => ({ ...current, promisedDate: event.target.value }))} type="date" value={poDraft.promisedDate} />
              <input aria-label="PO description" onChange={(event) => setPoDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Scope / description" value={poDraft.description} />
              <button className="primary" type="submit">Add PO</button>
            </form>
            <div className="financial-card-grid">
              {job.purchaseOrders.length ? job.purchaseOrders.map((po) => {
                const committed = po.committedAmount + (po.approvedChangeAmount ?? 0);
                const open = Math.max(committed - (po.invoicedAmount ?? 0), 0);
                const poFiles = job.files.filter((file) => file.ownerType === "purchase_order" && file.ownerId === po.id);
                return (
                  <article className={`financial-card ${po.status === "Draft" ? "warn" : ["Complete", "Closed"].includes(po.status) ? "approved" : ""}`} key={po.id}>
                    <div className="financial-card-head">
                      <div>
                        <span>{po.scope}</span>
                        <h4>{po.poNumber}</h4>
                        <small>{po.vendor}</small>
                      </div>
                      <Status value={po.status} />
                    </div>
                    <p>{po.description}</p>
                    <div className="financial-card-meta">
                      <div><span>Committed</span><strong>{money.format(committed)}</strong></div>
                      <div><span>Invoiced</span><strong>{money.format(po.invoicedAmount ?? 0)}</strong></div>
                      <div><span>Paid</span><strong>{money.format(po.paidAmount ?? 0)}</strong></div>
                      <div><span>Open</span><strong>{money.format(open)}</strong></div>
                      <div><span>Needed</span><strong>{po.neededBy || "TBD"}</strong></div>
                      <div><span>Promised</span><strong>{po.promisedDate || "TBD"}</strong></div>
                    </div>
                    <details className="submittal-edit-panel">
                      <summary>Edit PO</summary>
                      <div className="submittal-edit-grid">
                          <input className="inline-cell-input strong" onChange={(event) => onEditPurchaseOrder(job.id, po.id, { poNumber: event.target.value })} value={po.poNumber} />
                          <input className="inline-cell-input" onChange={(event) => onEditPurchaseOrder(job.id, po.id, { vendor: event.target.value })} value={po.vendor} />
                          <select className="inline-cell-input" onChange={(event) => onEditPurchaseOrder(job.id, po.id, { scope: event.target.value as PurchaseOrderScope })} value={po.scope}>
                            {purchaseOrderScopes.map((scope) => <option key={scope} value={scope}>{scope}</option>)}
                          </select>
                          <input className="inline-cell-input" onChange={(event) => onEditPurchaseOrder(job.id, po.id, { description: event.target.value })} value={po.description} />
                          <select className="inline-cell-input" onChange={(event) => onEditPurchaseOrder(job.id, po.id, { status: event.target.value as PurchaseOrderStatus })} value={po.status}>
                            {purchaseOrderStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                          </select>
                          <input className="inline-cell-input" onChange={(event) => onEditPurchaseOrder(job.id, po.id, { committedAmount: Number(event.target.value) })} type="number" value={po.committedAmount} />
                          <input className="inline-cell-input" onChange={(event) => onEditPurchaseOrder(job.id, po.id, { invoicedAmount: Number(event.target.value) })} type="number" value={po.invoicedAmount ?? 0} />
                          <input className="inline-cell-input" onChange={(event) => onEditPurchaseOrder(job.id, po.id, { paidAmount: Number(event.target.value) })} type="number" value={po.paidAmount ?? 0} />
                          <input className="inline-cell-input" onChange={(event) => onEditPurchaseOrder(job.id, po.id, { neededBy: event.target.value })} type="date" value={po.neededBy ?? ""} />
                          <input className="inline-cell-input" onChange={(event) => onEditPurchaseOrder(job.id, po.id, { promisedDate: event.target.value })} type="date" value={po.promisedDate ?? ""} />
                      </div>
                    </details>
                    <div className="package-files">
                      {poFiles.map((file) => <span key={file.id}><FileLink file={file} /></span>)}
                      <label>
                        Upload file
                        <input onChange={(event) => onPurchaseOrderFile(job.id, po.id, event.target.files?.[0])} type="file" />
                      </label>
                    </div>
                  </article>
                );
              }) : <div className="empty-card">No purchase orders or subcontracts yet.</div>}
            </div>
          </section>
          <section className="modal-section" id="job-financials">
            <div className="modal-section-head">
              <div>
                <h3>Change Orders</h3>
                <p>Price added scope in the workbook, then track GC approval here.</p>
              </div>
              <div className="modal-section-actions">
                <button className="primary muted-action" onClick={() => onStartChangeOrder(job.id)}>New CO in Workbook</button>
                <button className="primary" onClick={() => onApproveCos(job.id)}><CheckCircle2 size={16} /> Approve submitted COs</button>
              </div>
            </div>
            <div className="financial-card-grid">
              {job.changeOrders.length ? job.changeOrders.map((co) => (
                <article className={`financial-card ${co.status === "approved" ? "approved" : co.status === "submitted" ? "warn" : ""}`} key={co.id}>
                  <div className="financial-card-head">
                    <div>
                      <span>Change order</span>
                      <h4>{co.number}</h4>
                      <small>{co.dateSubmitted}</small>
                    </div>
                    <Status value={co.status} />
                  </div>
                  <p>{co.description}</p>
                  <div className="financial-card-meta">
                    <div><span>Amount</span><strong>{money.format(co.amount)}</strong></div>
                    <div><span>Status</span><strong>{co.status}</strong></div>
                    <div><span>Submitted</span><strong>{co.dateSubmitted}</strong></div>
                    <div><span>Approved</span><strong>{co.approvedDate || "-"}</strong></div>
                  </div>
                  {co.status === "submitted" ? (
                    <div className="financial-card-actions">
                      <button className="primary" onClick={() => onUpdateCoStatus(job.id, co.id, "approved")}>Approve</button>
                      <button className="primary muted-action" onClick={() => onUpdateCoStatus(job.id, co.id, "rejected")}>Reject</button>
                      <button className="primary muted-action" onClick={() => onUpdateCoStatus(job.id, co.id, "void")}>Void</button>
                    </div>
                  ) : null}
                </article>
              )) : <div className="empty-card">No change orders yet.</div>}
            </div>
          </section>
          </>
          ) : null}
          {activeTab === "files" ? (
          <section className="modal-section" id="job-files">
            <h3>Files</h3>
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
          ) : null}
          {activeTab === "activity" ? (
          <section className="modal-section" id="job-activity">
            <h3>Activity</h3>
            {job.activity.map((event) => (
              <p className="activity" key={event.id}><strong>{event.author}</strong> {event.message} <span>{event.createdAt}</span></p>
            ))}
          </section>
          ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function ServiceView({
  jobs,
  onCreateServiceJob
}: {
  jobs: Job[];
  onCreateServiceJob: (input: {
    client: string;
    projectName: string;
    serviceScope: string;
    quoteAmount: number;
    requestedDate: string;
    scheduledDate: string;
    assignedTo: string;
    notes: string;
  }) => void;
}) {
  const serviceJobs = jobs.filter((job) => job.workType === "Service");
  const summary = summarizeServiceWork(jobs);
  const [draft, setDraft] = useState({
    client: "",
    projectName: "",
    serviceScope: "",
    quoteAmount: "",
    requestedDate: today,
    scheduledDate: "",
    assignedTo: "",
    notes: ""
  });

  function submitServiceJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.client.trim() || !draft.projectName.trim() || !draft.serviceScope.trim()) return;

    onCreateServiceJob({
      ...draft,
      quoteAmount: Number(draft.quoteAmount) || 0
    });
    setDraft({
      client: "",
      projectName: "",
      serviceScope: "",
      quoteAmount: "",
      requestedDate: today,
      scheduledDate: "",
      assignedTo: "",
      notes: ""
    });
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Service</h2>
            <p>Small quoted work that should move fast without crowding the bid register.</p>
          </div>
          <Wrench size={28} />
        </div>
        <div className="metric-grid small">
          <Metric label="Open tickets" value={String(summary.openCount)} />
          <Metric label="Open value" value={money.format(summary.openValue)} />
          <Metric label="Completed value" value={money.format(summary.completedValue)} />
          <Metric label="Average ticket" value={money.format(summary.averageTicket)} />
        </div>
        <div className="service-layout">
          <section>
            <div className="modal-section-head">
              <h3>Service queue</h3>
              <span className="submittal-signal warn">{money.format(summary.unpaidValue)} unpaid</span>
            </div>
            <div className="table-wrap jobs-table-wrap">
              <table className="service-table">
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Client / Site</th>
                    <th>Scope</th>
                    <th>Status</th>
                    <th>Quote</th>
                    <th>Scheduled</th>
                    <th>Assigned</th>
                    <th>Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceJobs.map((job) => (
                    <tr key={job.id}>
                      <td><strong>{job.jobNumber}</strong></td>
                      <td><span className="truncate-cell">{job.projectName}</span><small>{job.client}</small></td>
                      <td><span className="truncate-cell">{job.serviceScope || job.notes}</span></td>
                      <td><Status value={job.backlogStatus} /></td>
                      <td>{money.format(currentContractValue(job.baseContract, job.changeOrders))}</td>
                      <td>{job.scheduledDate || job.installStart || "TBD"}</td>
                      <td>{job.assignedTo || job.pm}</td>
                      <td><Status value={job.invoiceStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <aside className="service-intake">
            <h3>Quick service intake</h3>
            <form className="service-intake-form" onSubmit={submitServiceJob}>
              <input
                aria-label="Service client"
                onChange={(event) => setDraft((current) => ({ ...current, client: event.target.value }))}
                placeholder="Client"
                value={draft.client}
              />
              <input
                aria-label="Service site"
                onChange={(event) => setDraft((current) => ({ ...current, projectName: event.target.value }))}
                placeholder="Site / project"
                value={draft.projectName}
              />
              <textarea
                aria-label="Service scope"
                onChange={(event) => setDraft((current) => ({ ...current, serviceScope: event.target.value }))}
                placeholder="Requested work"
                value={draft.serviceScope}
              />
              <input
                aria-label="Service quote amount"
                onChange={(event) => setDraft((current) => ({ ...current, quoteAmount: event.target.value }))}
                placeholder="Quote amount"
                type="number"
                value={draft.quoteAmount}
              />
              <label>
                Requested
                <input
                  aria-label="Service requested date"
                  onChange={(event) => setDraft((current) => ({ ...current, requestedDate: event.target.value }))}
                  type="date"
                  value={draft.requestedDate}
                />
              </label>
              <label>
                Scheduled
                <input
                  aria-label="Service scheduled date"
                  onChange={(event) => setDraft((current) => ({ ...current, scheduledDate: event.target.value }))}
                  type="date"
                  value={draft.scheduledDate}
                />
              </label>
              <input
                aria-label="Service assigned to"
                onChange={(event) => setDraft((current) => ({ ...current, assignedTo: event.target.value }))}
                placeholder="Assigned to"
                value={draft.assignedTo}
              />
              <input
                aria-label="Service notes"
                onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Notes"
                value={draft.notes}
              />
              <button className="primary" type="submit">Create service job</button>
            </form>
          </aside>
        </div>
      </section>
    </div>
  );
}

function FilesView({ jobs, opportunities }: { jobs: Job[]; opportunities: Opportunity[] }) {
  const jobFiles = jobs.flatMap((job) => job.files.map((file) => ({ ...file, project: job.projectName })));

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Project file storage map</h2>
          <p>Supabase Storage-ready slots for bids, jobs, COs, and project documents.</p>
        </div>
        <FileArchive size={28} />
      </div>
      <div className="file-board">
        {fileSlots.map((slot) => (
          <article key={slot}>
            <strong>{slot}</strong>
            <span>{jobFiles.filter((file) => file.slot === slot).length} attached</span>
          </article>
        ))}
      </div>
      <h3>Linked files</h3>
      {jobFiles.map((file) => <p className="file-line" key={file.id}>{file.project} - {file.slot} - <FileLink file={file} /></p>)}
      <h3>Bid links</h3>
      {opportunities.map((opportunity) => (
        <p className="file-line" key={opportunity.id}>{opportunity.jobId} - drawings/specs/schedule links tracked from Master V4</p>
      ))}
    </section>
  );
}

function AnalyticsView({
  analytics,
  jobs,
  opportunities
}: {
  analytics: DashboardAnalytics;
  jobs: Job[];
  opportunities: Opportunity[];
}) {
  return (
    <div className="stack">
      <div className="metric-grid">
        <Metric label="Submitted" value={analytics.submitted} />
        <Metric label="Won" value={analytics.won} />
        <Metric label="Lost" value={analytics.lost} />
        <Metric label="Win rate" value={`${analytics.winRate}%`} />
      </div>
      <section className="panel two-column">
        <div>
          <h2>Historical bid value</h2>
          {opportunities.map((opportunity) => (
            <div className="analytics-row" key={opportunity.id}>
              <span>{opportunity.client}</span>
              <strong>{money.format(opportunity.estimatedValue)}</strong>
            </div>
          ))}
        </div>
        <div>
          <h2>Job margin</h2>
          {jobs.map((job) => {
            const revenue = currentContractValue(job.baseContract, job.changeOrders);
            return (
              <div className="analytics-row" key={job.id}>
                <span>{job.jobNumber} - {job.projectName}</span>
                <strong>{grossMarginPercent(revenue, job.finalCost) ?? "TBD"}%</strong>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function OpportunityModal({
  opportunity,
  onAttachFile,
  onClose,
  onUpdate,
  onConvertToJob,
  onOpenEstimate,
  existingJobs,
  canConvertToJob = true,
  onReopenOpportunity
}: {
  opportunity: Opportunity;
  onAttachFile?: (opportunity: Opportunity, slot: string, file: File) => Promise<ProjectFile | null>;
  onClose: () => void;
  onUpdate: (opportunity: Opportunity) => void;
  onConvertToJob: (opportunity: Opportunity, award: AwardDetails) => void;
  onOpenEstimate: (opportunity: Opportunity) => void;
  existingJobs: Job[];
  canConvertToJob?: boolean;
  onReopenOpportunity?: (opportunityId: string, targetStatus: OpportunityStatus) => void;
}) {
  const [draft, setDraft] = useState(opportunity);
  const [awardPm, setAwardPm] = useState("Geoff");
  const [awardDate, setAwardDate] = useState(today);
  const [awardJobNumber, setAwardJobNumber] = useState(() =>
    suggestJobNumber({ pm: "Geoff", awardDate: today, existingJobs })
  );
  const [awardContract, setAwardContract] = useState(draft.initialContractValue ?? draft.estimatedValue);
  const canConvert = draft.status !== "Lost" && draft.status !== "Archived" && draft.winLoss !== "Lost";

  function changeAwardPm(pm: string) {
    setAwardPm(pm);
    setAwardJobNumber(suggestJobNumber({ pm, awardDate, existingJobs }));
  }

  function changeAwardDate(date: string) {
    setAwardDate(date);
    setAwardJobNumber(suggestJobNumber({ pm: awardPm, awardDate: date, existingJobs }));
  }

  function update<K extends keyof Opportunity>(key: K, value: Opportunity[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateLink(key: keyof Opportunity["links"], value: string) {
    setDraft((current) => ({ ...current, links: { ...current.links, [key]: value } }));
  }

  async function attachFile(slot: string, file: File | undefined) {
    if (!file) return;
    const nextFile: ProjectFile = {
      id: `file-${slot}-${Date.now()}`,
      ownerType: "opportunity",
      ownerId: draft.id,
      slot,
      name: file.name,
      uploadedAt: today
    };
    setDraft((current) => ({
      ...current,
      files: [...(current.files ?? []).filter((candidate) => candidate.slot !== slot), nextFile]
    }));
    const saved = await onAttachFile?.(draft, slot, file);
    if (saved) {
      setDraft((current) => ({
        ...current,
        files: [...(current.files ?? []).filter((candidate) => candidate.slot !== slot), saved]
      }));
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="opportunity-modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <span className="eyebrow">{draft.jobId || "Opportunity"}</span>
            <h2>{draft.projectName}</h2>
            <p>{draft.client} - {money.format(draft.estimatedValue)}</p>
          </div>
          <button className="modal-close" onClick={onClose}>x</button>
        </header>

        <div className="modal-body">
          <section className="modal-section">
            <h3>Bid status</h3>
            <div className="form-grid">
              <label>Client<input value={draft.client} onChange={(event) => update("client", event.target.value)} /></label>
              <label>Project<input value={draft.projectName} onChange={(event) => update("projectName", event.target.value)} /></label>
              <label>Due date<input type="date" value={draft.bidDueDate} onChange={(event) => update("bidDueDate", event.target.value)} /></label>
              <label>Drawing stage<input value={draft.drawingStage} onChange={(event) => update("drawingStage", event.target.value)} /></label>
              <label>Bid type<input value={draft.bidType} onChange={(event) => update("bidType", event.target.value)} /></label>
              <label>Submission<input value={draft.submissionMethod} onChange={(event) => update("submissionMethod", event.target.value)} /></label>
              <label>Status
                <select value={draft.status} onChange={(event) => update("status", event.target.value as Opportunity["status"])}>
                  {["Lead / ITB", "Pricing", "Review / Send", "Submitted", "Follow Up", "Cold", "Won", "Lost", "Archived"].map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label>Win / Loss
                <select value={draft.winLoss} onChange={(event) => update("winLoss", event.target.value as Opportunity["winLoss"])}>
                  <option value="">Waiting</option>
                  <option value="Won">Won</option>
                  <option value="Lost">Lost</option>
                </select>
              </label>
              <label>Estimated value
                <input
                  type="number"
                  value={draft.estimatedValue}
                  onChange={(event) => update("estimatedValue", Number(event.target.value))}
                />
              </label>
              <label>Initial contract
                <input
                  type="number"
                  value={draft.initialContractValue ?? ""}
                  onChange={(event) => update("initialContractValue", event.target.value ? Number(event.target.value) : null)}
                />
              </label>
              <label>Final cost
                <input
                  type="number"
                  value={draft.finalCost ?? ""}
                  onChange={(event) => update("finalCost", event.target.value ? Number(event.target.value) : null)}
                />
              </label>
            </div>
          </section>

          <section className="modal-section two">
            <div>
              <h3>Follow-up</h3>
              <label>Notes<textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} /></label>
              <label>Bid feedback<textarea value={draft.bidFeedback} onChange={(event) => update("bidFeedback", event.target.value)} /></label>
              <label className="check-row">
                <input checked={draft.ntpReceived} type="checkbox" onChange={(event) => update("ntpReceived", event.target.checked)} />
                NTP received
              </label>
            </div>
            <div>
              <h3>Files and handoff</h3>
              <label>Drawings<input value={draft.links.drawings ?? ""} onChange={(event) => updateLink("drawings", event.target.value)} /></label>
              <label>Specs<input value={draft.links.specs ?? ""} onChange={(event) => updateLink("specs", event.target.value)} /></label>
              <label>Schedule<input value={draft.links.schedule ?? ""} onChange={(event) => updateLink("schedule", event.target.value)} /></label>
              <div className="modal-file-slots">
                {opportunityFileSlots.map((slot) => {
                  const attached = draft.files?.find((file) => file.slot === slot);
                  return (
                    <label className={attached ? "file-slot filled" : "file-slot"} key={slot}>
                      <span>{slot}</span>
                      <strong>{attached ? <FileLink file={attached} /> : "Missing"}</strong>
                      <input onChange={(event) => attachFile(slot, event.target.files?.[0])} type="file" />
                    </label>
                  );
                })}
              </div>
              <div className="modal-actions">
                <button className="primary muted-action" onClick={() => { onUpdate(draft); onOpenEstimate(draft); }} type="button">Open estimate</button>
                <button className="primary muted-action" type="button">Build proposal</button>
              </div>
            </div>
          </section>
          <section className="modal-section award-section">
            <h3>Award / convert to job</h3>
            <div className="form-grid award-grid">
              <label>Project Manager
                <select value={awardPm} onChange={(event) => changeAwardPm(event.target.value)}>
                  <option>Geoff</option>
                  <option>Pat</option>
                  <option>Joe</option>
                  <option>Evan</option>
                </select>
              </label>
              <label>NTP / Award date
                <input type="date" value={awardDate} onChange={(event) => changeAwardDate(event.target.value)} />
              </label>
              <label>Job number
                <input value={awardJobNumber} onChange={(event) => setAwardJobNumber(event.target.value)} />
              </label>
              <label>Initial contract
                <input type="number" value={awardContract} onChange={(event) => setAwardContract(Number(event.target.value))} />
              </label>
            </div>
            <div className="award-copy">
              <span>Opportunity ID stays {draft.jobId} for historical tracking.</span>
              <span>Conversion will mark this opportunity Won and create the job record.</span>
              <strong>Job will be created as {awardJobNumber}</strong>
            </div>
            {canConvertToJob ? (
              <button
                className="primary"
                disabled={!canConvert}
                onClick={() =>
                  onConvertToJob(draft, {
                    pm: awardPm,
                    jobNumber: awardJobNumber,
                    contractValue: awardContract,
                    ntpDate: awardDate
                  })
                }
                type="button"
              >
                Convert to job
              </button>
            ) : (
              <p className="permission-note">Estimator or admin role required to convert to a job.</p>
            )}
            {(draft.status === "Won" || draft.status === "Lost") && onReopenOpportunity && (
              <div className="reopen-row">
                <span>Reopen as:</span>
                {(["Submitted", "Follow Up", "Pricing"] as OpportunityStatus[]).map((s) => (
                  <button key={s} className="ghost-button compact" type="button"
                    onClick={() => { onReopenOpportunity(draft.id, s); onClose(); }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="modal-foot">
          <button className="ghost-button" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={() => { onUpdate(draft); onClose(); }}>Save opportunity</button>
        </footer>
      </section>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

function Status({ value }: { value: string }) {
  return <span className={`status ${value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`}>{value}</span>;
}

function FileLink({ file }: { file: ProjectFile }) {
  if (!file.url) return <>{file.name}</>;
  return (
    <a href={file.url} rel="noreferrer" target="_blank">
      {file.name}
    </a>
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
