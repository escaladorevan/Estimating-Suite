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
  Users,
  WalletCards,
  Wrench
} from "lucide-react";
import { jsPDF } from "jspdf";
import type { ChangeEvent, ElementType, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, getCurrentUserProfile } from "@/lib/supabase-client";
import { BidWorkbook } from "@/components/BidWorkbook";
import { JobDetailPage } from "@/components/job-detail/JobDetailPage";
import { useJobsPersistence } from "@/hooks/useJobsPersistence";
import { createChangeOrderEstimateForPdf, createChangeOrderEstimateFromJob, nextChangeOrderNumber, validateChangeOrderSubmission } from "@/lib/change-order-workflow";
import { calculateEstimateTotals } from "@/lib/estimate-math";
import { reconcilePersistedEstimateIdentity } from "@/lib/estimate-persistence-reconciliation";
import {
  listEstimates,
  saveEstimateAlternates,
  saveEstimateAreas,
  saveEstimateHeader,
  saveEstimateSnapshot,
  saveEstimateSubItems
} from "@/lib/estimate-repository";
import { saveProjectFileMetadata, signProjectFileUrl, uploadProjectFile } from "@/lib/file-repository";
import {
  buildHandoffActivityMessage,
  buildHandoffEmail,
  buildMailtoUrl,
  HANDOFF_LINK_EXPIRY_SECONDS,
  pickHandoffFiles,
  type HandoffLink
} from "@/lib/job-handoff";
import {
  addJobContact,
  addOpportunityContact,
  listCompanies,
  listContacts,
  removeJobContact,
  removeOpportunityContact,
  saveCompany,
  saveContact
} from "@/lib/contact-repository";
import { applyChangeOrderStatusToJobDetail, applyChangeOrderToJobDetail, applyFileToJobDetail, applyPurchaseOrderToJobDetail, applySubmittalToJobDetail, getJobDetailData } from "@/lib/job-detail-data";
import { resolvePersistedJobForPMNote } from "@/lib/job-persistence-reconciliation";
import { buildJobRouteHash, parseJobRouteHash, resolveJobRoute } from "@/lib/job-route";
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
import {
  buildAwardedOpportunityJob,
  buildNewOpportunity,
  buildOpportunityEstimate,
  filterOpportunitiesForView,
  suggestJobNumber,
  type RegisterView
} from "@/lib/opportunity-workflow";
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
import type { ActivityEvent, AppUserProfile, ChangeOrder, ChangeOrderStatus, Company, CompanyType, Contact, Estimate, Job, Opportunity, OpportunityStatus, PMNote, ProjectFile, PurchaseOrder, PurchaseOrderScope, PurchaseOrderStatus, SubmittalPackage } from "@/types";

type View = "dashboard" | "opportunities" | "kanban" | "estimator" | "jobs" | "calendar" | "service" | "files" | "directory" | "analytics";
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
  { id: "directory", label: "Directory", icon: Users },
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

type HomeRole = "estimator" | "pm" | "admin";

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
  const [currentHash, setCurrentHash] = useState("");
  const [query, setQuery] = useState("");
  const [opportunityPersistenceStatus, setOpportunityPersistenceStatus] = useState("Checking Supabase...");
  const [estimatePersistenceStatus, setEstimatePersistenceStatus] = useState("Workbook snapshots save after sign-in.");
  const [loginEmail, setLoginEmail] = useState("escalador.evan@gmail.com");
  const [loginPassword, setLoginPassword] = useState("");
  const [sessionEmail, setSessionEmail] = useState("");
  const [authStatus, setAuthStatus] = useState("Sign in to save live data.");
  const [currentUser, setCurrentUser] = useState<AppUserProfile | null>(null);
  const [homeRoleOverride, setHomeRoleOverride] = useState<HomeRole>("estimator");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactPersistenceStatus, setContactPersistenceStatus] = useState("Directory loads after sign-in.");
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
  const navCollapsedBeforeJobRoute = useRef<boolean | null>(null);
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
  const routedJob = resolveJobRoute(currentHash, jobs);
  const isJobRoute = Boolean(parseJobRouteHash(currentHash));
  const detailJobData = getJobDetailData({ jobs, pmNotes, jobId: routedJob?.id ?? detailJobId });
  const detailJob = routedJob ?? detailJobData?.job ?? null;
  const selectedOpportunity = opportunities.find((opportunity) => opportunity.id === selectedOpportunityId) ?? null;
  const totals = calculateEstimateTotals(selectedEstimate);
  const pipelineOpportunities = opportunities.filter((opportunity) =>
    ["Lead / ITB", "Pricing", "Review / Send"].includes(opportunity.status)
  );
  const renderedView: View = hasMounted ? view : "dashboard";
  const homeRole: HomeRole =
    currentUser?.role === "admin"
      ? homeRoleOverride
      : currentUser?.role === "pm"
        ? "pm"
        : currentUser?.role === "estimator"
          ? "estimator"
          : "estimator";

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

  async function loadPersistedContacts(isMounted = true) {
    try {
      const [persistedCompanies, persistedContacts] = await Promise.all([listCompanies(), listContacts()]);
      if (!isMounted) return;
      setCompanies(persistedCompanies);
      setContacts(persistedContacts);
      setContactPersistenceStatus(`Loaded ${persistedCompanies.length} companies and ${persistedContacts.length} contacts from Supabase.`);
    } catch {
      if (!isMounted) return;
      setContactPersistenceStatus("Directory is local only until Supabase contact reads succeed.");
    }
  }

  async function loadPersistedEstimates(isMounted = true) {
    try {
      const persisted = await listEstimates();
      if (!isMounted) return;
      if (!persisted.length) return;

      const reconciled = reconcilePersistedEstimateIdentity({
        currentEstimates: estimates,
        persistedEstimates: persisted,
        activeEstimateId
      });
      setEstimates(reconciled.estimates);
      setActiveEstimateId(reconciled.activeEstimateId);
      setEstimatePersistenceStatus(`Loaded ${persisted.length} workbook${persisted.length === 1 ? "" : "s"} from Supabase.`);
    } catch {
      if (!isMounted) return;
      setEstimatePersistenceStatus("Workbook is local only until Supabase estimate reads succeed.");
    }
  }

  useEffect(() => {
    let isMounted = true;
    void loadPersistedOpportunities(isMounted);
    void loadPersistedJobs(isMounted);
    void loadPersistedEstimates(isMounted);
    void loadPersistedPMNotes(isMounted);
    void loadPersistedContacts(isMounted);

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
        void loadPersistedEstimates();
        void loadPersistedPMNotes();
        void loadPersistedContacts();
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
        void loadPersistedEstimates();
        void loadPersistedPMNotes();
        void loadPersistedContacts();
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
      const rawHash = window.location.hash || "#dashboard";
      setCurrentHash(rawHash);
      if (parseJobRouteHash(rawHash)) {
        setView("jobs");
        return;
      }
      const hash = rawHash.replace("#", "") as View;
      if (viewIds.includes(hash)) {
        setView(hash);
        setDetailJobId(null);
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

  useEffect(() => {
    if (routedJob) {
      setDetailJobId(routedJob.id);
    }
  }, [routedJob?.id]);

  useEffect(() => {
    if (!hasMounted) return;

    if (isJobRoute) {
      if (navCollapsedBeforeJobRoute.current === null) {
        navCollapsedBeforeJobRoute.current = mainNavCollapsed;
      }
      setMainNavCollapsed(true);
      return;
    }

    if (navCollapsedBeforeJobRoute.current !== null) {
      setMainNavCollapsed(navCollapsedBeforeJobRoute.current);
      navCollapsedBeforeJobRoute.current = null;
    }
  }, [hasMounted, isJobRoute, mainNavCollapsed]);

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

  async function persistCompany(next: Company) {
    const localId = next.id;
    setCompanies((current) =>
      current.some((company) => company.id === localId)
        ? current.map((company) => (company.id === localId ? next : company))
        : [next, ...current]
    );
    setContactPersistenceStatus("Saving company...");

    try {
      const saved = await saveCompany(next);
      setCompanies((current) => current.map((company) => (company.id === localId || company.id === saved.id ? saved : company)));
      setContacts((current) => current.map((contact) => (contact.companyId === localId ? { ...contact, companyId: saved.id, company: saved } : contact)));
      setContactPersistenceStatus(`Saved ${saved.name} to Supabase.`);
      return saved;
    } catch {
      setContactPersistenceStatus(`${next.name} is local only. Supabase company save failed.`);
      return next;
    }
  }

  async function persistContact(next: Contact) {
    const localId = next.id;
    const hydrated = {
      ...next,
      company: next.companyId ? companies.find((company) => company.id === next.companyId) : undefined
    };
    setContacts((current) =>
      current.some((contact) => contact.id === localId)
        ? current.map((contact) => (contact.id === localId ? hydrated : contact))
        : [hydrated, ...current]
    );
    setContactPersistenceStatus("Saving contact...");

    try {
      const saved = await saveContact(hydrated);
      const company = saved.companyId ? companies.find((candidate) => candidate.id === saved.companyId) : undefined;
      setContacts((current) => current.map((contact) => (contact.id === localId || contact.id === saved.id ? { ...saved, company } : contact)));
      setContactPersistenceStatus(`Saved ${saved.name} to Supabase.`);
      return saved;
    } catch {
      setContactPersistenceStatus(`${next.name} is local only. Supabase contact save failed.`);
      return next;
    }
  }

  async function linkContactToOpportunity(opportunityId: string, contactId: string) {
    const contact = contacts.find((candidate) => candidate.id === contactId);
    if (!contact) return;
    const localJoin = {
      id: makeLocalId("opp-contact"),
      contactId: contact.id,
      contact,
      role: contact.title ?? "Project contact"
    };

    setOpportunities((current) =>
      current.map((opportunity) =>
        opportunity.id === opportunityId
          ? { ...opportunity, contacts: [...(opportunity.contacts ?? []), localJoin] }
          : opportunity
      )
    );

    if (!isUuid(opportunityId) || !isUuid(contactId)) {
      setContactPersistenceStatus("Contact attached locally. Save the opportunity and contact before it can persist.");
      return;
    }

    try {
      const saved = await addOpportunityContact(opportunityId, contactId, localJoin.role);
      setOpportunities((current) =>
        current.map((opportunity) =>
          opportunity.id === opportunityId
            ? {
                ...opportunity,
                contacts: (opportunity.contacts ?? []).map((item) =>
                  item.id === localJoin.id ? { ...saved, contact } : item
                )
              }
            : opportunity
        )
      );
      setContactPersistenceStatus(`Attached ${contact.name} to the opportunity.`);
    } catch {
      setOpportunities((current) =>
        current.map((opportunity) =>
          opportunity.id === opportunityId
            ? { ...opportunity, contacts: (opportunity.contacts ?? []).filter((item) => item.id !== localJoin.id) }
            : opportunity
        )
      );
      setContactPersistenceStatus(`Could not attach ${contact.name}.`);
    }
  }

  async function unlinkContactFromOpportunity(opportunityId: string, joinId: string) {
    setOpportunities((current) =>
      current.map((opportunity) =>
        opportunity.id === opportunityId
          ? { ...opportunity, contacts: (opportunity.contacts ?? []).filter((item) => item.id !== joinId) }
          : opportunity
      )
    );

    if (!isUuid(joinId)) return;
    try {
      await removeOpportunityContact(joinId);
      setContactPersistenceStatus("Removed opportunity contact.");
    } catch {
      setContactPersistenceStatus("Could not remove opportunity contact from Supabase.");
    }
  }

  async function linkContactToJob(jobId: string, contactId: string) {
    const contact = contacts.find((candidate) => candidate.id === contactId);
    if (!contact) return;
    const localJoin = {
      id: makeLocalId("job-contact"),
      contactId: contact.id,
      contact,
      role: contact.title ?? "Project contact"
    };

    setJobs((current) =>
      current.map((job) =>
        job.id === jobId ? { ...job, contacts: [...(job.contacts ?? []), localJoin] } : job
      )
    );

    if (!isUuid(jobId) || !isUuid(contactId)) {
      setContactPersistenceStatus("Contact attached locally. Save the job and contact before it can persist.");
      return;
    }

    try {
      const saved = await addJobContact(jobId, contactId, localJoin.role);
      setJobs((current) =>
        current.map((job) =>
          job.id === jobId
            ? {
                ...job,
                contacts: (job.contacts ?? []).map((item) => (item.id === localJoin.id ? { ...saved, contact } : item))
              }
            : job
        )
      );
      setContactPersistenceStatus(`Attached ${contact.name} to the job.`);
    } catch {
      setJobs((current) =>
        current.map((job) =>
          job.id === jobId ? { ...job, contacts: (job.contacts ?? []).filter((item) => item.id !== localJoin.id) } : job
        )
      );
      setContactPersistenceStatus(`Could not attach ${contact.name}.`);
    }
  }

  async function unlinkContactFromJob(jobId: string, joinId: string) {
    setJobs((current) =>
      current.map((job) =>
        job.id === jobId ? { ...job, contacts: (job.contacts ?? []).filter((item) => item.id !== joinId) } : job
      )
    );

    if (!isUuid(joinId)) return;
    try {
      await removeJobContact(joinId);
      setContactPersistenceStatus("Removed job contact.");
    } catch {
      setContactPersistenceStatus("Could not remove job contact from Supabase.");
    }
  }

  async function persistEstimateSnapshot(estimate: Estimate) {
    const localId = estimate.id;
    setEstimatePersistenceStatus("Saving workbook, line items, and snapshot...");

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

      await saveEstimateAreas(persistedEstimate.id, persistedEstimate.areas);
      await saveEstimateSubItems(persistedEstimate.id, persistedEstimate.subItems);
      await saveEstimateAlternates(persistedEstimate.id, persistedEstimate.alternates);
      await saveEstimateSnapshot(persistedEstimate);
      setEstimatePersistenceStatus(`Saved workbook and snapshot for ${persistedEstimate.proposalNumber || persistedEstimate.projectName}.`);
    } catch {
      setEstimatePersistenceStatus("Workbook is local only. Sign in and use persisted opportunity/job ids before saving.");
    }
  }

  function openJobRoute(jobId: string) {
    const job = jobs.find((candidate) => candidate.id === jobId || candidate.jobNumber === jobId);
    if (!job) return;
    setDetailJobId(job.id);
    const hash = buildJobRouteHash(job);
    setCurrentHash(hash);
    if (typeof window !== "undefined") {
      window.location.hash = hash;
    }
  }

  function backToJobsView() {
    setDetailJobId(null);
    setView("jobs");
    setCurrentHash("#jobs");
    if (typeof window !== "undefined") {
      window.location.hash = "#jobs";
    }
  }

  async function persistStartedEstimate(estimate: Estimate) {
    const localId = estimate.id;
    setEstimatePersistenceStatus("Starting estimate in Supabase...");

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
      setActiveEstimateId((current) => (current === localId ? persistedEstimate.id : current));

      await saveEstimateAreas(persistedEstimate.id, persistedEstimate.areas);
      await saveEstimateSubItems(persistedEstimate.id, persistedEstimate.subItems);
      await saveEstimateAlternates(persistedEstimate.id, persistedEstimate.alternates);
      setEstimatePersistenceStatus(`Started estimate for ${persistedEstimate.projectName}.`);
    } catch {
      setEstimatePersistenceStatus("Estimate started locally. Sign in and use a persisted opportunity before saving.");
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
    if (!currentUser) return true;
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
    const newOpportunity = buildNewOpportunity({
      date: today,
      id: makeLocalId("opp"),
      jobs,
      opportunities
    });

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
    const doc = new jsPDF();
    buildProposalPdf(doc, selectedEstimate);
    doc.save(`${selectedEstimate.projectName.replace(/[^a-z0-9]+/gi, "-")}-proposal.pdf`);
  }

  function exportChangeOrderPdf(jobId: string, coId: string) {
    const job = jobs.find((candidate) => candidate.id === jobId);
    const changeOrder = job?.changeOrders.find((candidate) => candidate.id === coId);
    if (!job || !changeOrder) return;

    const sourceEstimate = estimates.find((estimate) =>
      estimate.documentType === "Change Order" &&
      estimate.jobId === job.id &&
      estimate.proposalNumber?.toLowerCase() === changeOrder.number.toLowerCase()
    );
    const printableEstimate = createChangeOrderEstimateForPdf({
      changeOrder,
      date: today,
      job,
      sourceEstimate
    });
    const doc = new jsPDF();
    buildProposalPdf(doc, printableEstimate);
    doc.save(`${job.jobNumber}-${changeOrder.number}-change-order.pdf`.replace(/[^a-z0-9.-]+/gi, "-"));
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

  async function sendHandoffToPm(jobId: string) {
    const job = jobs.find((candidate) => candidate.id === jobId);
    if (!job) return;

    const { files, missingSlots } = pickHandoffFiles(job.files);

    // Re-sign with the 30-day handoff expiry; the URLs loaded with the job
    // only last an hour. In local/no-Supabase mode, fall back to whatever
    // URL the file already carries.
    const links: HandoffLink[] = [];
    for (const file of files) {
      const signed = supabase ? await signProjectFileUrl(file, supabase, HANDOFF_LINK_EXPIRY_SECONDS) : file;
      if (signed.url) links.push({ slot: file.slot, name: file.name, url: signed.url });
    }

    const email = buildHandoffEmail({
      job,
      links,
      missingSlots,
      currentContract: currentContractValue(job.baseContract, job.changeOrders)
    });

    const activity: ActivityEvent = {
      id: makeLocalId("act"),
      ownerType: "job",
      ownerId: job.id,
      author: sessionEmail || "System",
      message: buildHandoffActivityMessage(job, links),
      createdAt: today
    };
    setJobs((current) =>
      current.map((candidate) =>
        candidate.id === job.id ? { ...candidate, activity: [activity, ...candidate.activity] } : candidate
      )
    );
    void persistActivity(activity);

    window.location.href = buildMailtoUrl(email);
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
    setSelectedJobId(sourceJob.id);
    setDetailJobId(sourceJob.id);
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
    setDetailJobId(null);
    navCollapsedBeforeJobRoute.current = null;
    const hash = `#${nextView}`;
    setCurrentHash(hash);
    window.location.hash = hash;
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

  return (
    <main className={`${mainNavCollapsed ? "app-shell main-nav-collapsed" : "app-shell"} ${isJobRoute ? "job-cockpit-shell" : ""}`}>
      {!isJobRoute ? <aside className="side-nav">
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
      </aside> : null}

      <section className="workspace">
        {!isJobRoute ? <header className="topbar">
          <div>
            <h1>{isJobRoute && detailJob ? detailJob.jobNumber : nav.find((item) => item.id === renderedView)?.label}</h1>
            <p>{isJobRoute && detailJob ? `${detailJob.projectName} PM cockpit` : "Manual-first Supabase-ready rebuild of the FS bid, estimate, proposal, and job workflow."}</p>
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
        </header> : null}
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

        {isJobRoute && detailJob ? (
          <JobDetailPage
            canEditHeader={canWrite("pm")}
            contacts={contacts}
            job={detailJob}
            onAddContact={(jobId, contactId) => void linkContactToJob(jobId, contactId)}
            onApproveCos={approveSubmittedCo}
            onBackToJobs={backToJobsView}
            onCreatePmNote={createPmNote}
            onCreatePurchaseOrder={createPurchaseOrder}
            onCreateSubmittal={createJobSubmittal}
            onDeletePmNote={deletePmNote}
            onEditPurchaseOrder={editPurchaseOrder}
            onEditSubmittal={editJobSubmittal}
            onExportChangeOrderPdf={exportChangeOrderPdf}
            onJobFile={attachJobFile}
            onPurchaseOrderFile={attachPurchaseOrderFile}
            onRemoveContact={(jobId, joinId) => void unlinkContactFromJob(jobId, joinId)}
            onSendHandoff={(jobId) => void sendHandoffToPm(jobId)}
            onStartChangeOrder={startChangeOrderFromJob}
            onSubmittalAction={updateSubmittal}
            onSubmittalChecklist={updateSubmittalChecklist}
            onSubmittalFile={attachSubmittalFile}
            onUpdateCoStatus={updateChangeOrderStatus}
            onUpdateJob={updateJobHeader}
            onUpdatePmNoteStatus={updatePmNoteStatus}
            onUpdatePmNoteText={updatePmNoteText}
            pmNotes={detailJobData?.notes ?? pmNotes.filter((note) => note.jobId === detailJob.id)}
          />
        ) : null}

        {!isJobRoute && renderedView === "dashboard" && (
          <HomeDashboard
            analytics={analytics}
            canSwitchHomeRole={currentUser?.role === "admin"}
            homeRole={homeRole}
            jobs={jobs}
            onHomeRoleChange={setHomeRoleOverride}
            onCreateOpportunity={createNewOpportunity}
            onCreatePmNote={createPmNote}
            onDeletePmNote={deletePmNote}
            onOpenJob={openJobRoute}
            onOpenOpportunity={setSelectedOpportunityId}
            onUpdatePmNoteText={updatePmNoteText}
            onUpdatePmNoteStatus={updatePmNoteStatus}
            opportunities={opportunities}
            pipelineOpportunities={pipelineOpportunities}
            pmNotes={pmNotes}
          />
        )}
        {!isJobRoute && renderedView === "opportunities" && (
          <OpportunityRegister
            opportunities={opportunities}
            query={query}
            setQuery={setQuery}
            onOpenOpportunity={setSelectedOpportunityId}
          />
        )}
        {!isJobRoute && renderedView === "kanban" && <PipelineKanban opportunities={pipelineOpportunities} onOpenOpportunity={setSelectedOpportunityId} />}
        {!isJobRoute && renderedView === "estimator" && (
          <BidWorkbook
            estimate={selectedEstimate}
            onChange={(next) => setEstimates((current) => current.map((estimate) => (estimate.id === next.id ? next : estimate)))}
            onExportPdf={exportProposalPdf}
            onSaveSnapshot={(estimate) => void persistEstimateSnapshot(estimate)}
            saveStatus={estimatePersistenceStatus}
            onSubmitChangeOrder={submitEstimateAsChangeOrder}
          />
        )}
        {!isJobRoute && renderedView === "jobs" && (
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
            onOpenJob={openJobRoute}
            onSubmittalChecklist={updateSubmittalChecklist}
            onSubmittalAction={updateSubmittal}
            onSubmittalFile={attachSubmittalFile}
            saveStatus={jobPersistenceStatus}
          />
        )}
        {!isJobRoute && renderedView === "calendar" && <CalendarCapacityView jobs={jobs} onOpenJob={openJobRoute} />}
        {!isJobRoute && renderedView === "service" && <ServiceView jobs={jobs} onCreateServiceJob={createServiceJob} />}
        {!isJobRoute && renderedView === "files" && <FilesView jobs={jobs} opportunities={opportunities} />}
        {!isJobRoute && renderedView === "directory" && (
          <DirectoryView
            companies={companies}
            contacts={contacts}
            onSaveCompany={(company) => void persistCompany(company)}
            onSaveContact={(contact) => void persistContact(contact)}
            persistenceStatus={contactPersistenceStatus}
          />
        )}
        {!isJobRoute && renderedView === "analytics" && <AnalyticsView analytics={analytics} jobs={jobs} opportunities={opportunities} />}
      </section>
      {selectedOpportunity ? (
        <OpportunityModal
          opportunity={selectedOpportunity}
          onAttachFile={persistOpportunityFile}
          onClose={() => setSelectedOpportunityId(null)}
          onUpdate={(next) => void persistOpportunity(next)}
          existingJobs={jobs}
          canConvertToJob={canWrite("estimating")}
          onReopenOpportunity={reopenOpportunity}
          contacts={contacts}
          onAddContact={(opportunityId, contactId) => void linkContactToOpportunity(opportunityId, contactId)}
          onRemoveContact={(opportunityId, joinId) => void unlinkContactFromOpportunity(opportunityId, joinId)}
          onConvertToJob={(opportunity, award) => {
            const { awardedOpportunity, job: newJob } = buildAwardedOpportunityJob({
              activityId: makeLocalId("act"),
              award,
              jobId: `job-${opportunity.id}`,
              makeContactId: () => makeLocalId("job-contact"),
              opportunity,
              today
            });

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
              const estimate = buildOpportunityEstimate({
                id: `est-${opportunity.id}`,
                opportunity
              });
              setEstimates((current) => [estimate, ...current]);
              setActiveEstimateId(estimate.id);
              void persistStartedEstimate(estimate);
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
  canSwitchHomeRole,
  homeRole,
  opportunities,
  pipelineOpportunities,
  jobs,
  pmNotes,
  onHomeRoleChange,
  onCreateOpportunity,
  onCreatePmNote,
  onDeletePmNote,
  onOpenJob,
  onOpenOpportunity,
  onUpdatePmNoteText,
  onUpdatePmNoteStatus
}: {
  analytics: DashboardAnalytics;
  canSwitchHomeRole: boolean;
  homeRole: HomeRole;
  opportunities: Opportunity[];
  pipelineOpportunities: Opportunity[];
  jobs: Job[];
  pmNotes: PMNote[];
  onHomeRoleChange: (role: HomeRole) => void;
  onCreateOpportunity: () => void;
  onCreatePmNote: (text: string, jobId?: string) => void;
  onDeletePmNote: (noteId: string) => void;
  onOpenJob: (jobId: string) => void;
  onOpenOpportunity: (opportunityId: string) => void;
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
  const pmActions = buildPmActionItems({ jobs, notes: pmNotes, today }).slice(0, 5);
  const upcomingInstalls = activeJobs
    .filter((job) => job.installStart)
    .sort((a, b) => a.installStart.localeCompare(b.installStart))
    .slice(0, 5);

  const roleCopy = {
    estimator: {
      title: "Estimator Home",
      detail: `${pipelineOpportunities.length} active bids are moving. ${nextSubmitted.length} submitted bids need follow-up.`
    },
    pm: {
      title: "PM Home",
      detail: `${activeJobs.length} active jobs are open. ${pmActions.length} items need PM attention.`
    },
    admin: {
      title: "Admin Home",
      detail: "Owner-level pulse for backlog, revenue, bid health, and production load."
    }
  } satisfies Record<HomeRole, { title: string; detail: string }>;

  return (
    <div className="stack home-stack">
      <section className="home-hero">
        <div>
          <span className="eyebrow">Thu, May 7, 2026</span>
          <h2>{roleCopy[homeRole].title}</h2>
          <p>{roleCopy[homeRole].detail}</p>
        </div>
        <div className="home-hero-actions">
          {canSwitchHomeRole ? (
            <div className="role-switch" aria-label="Home role preview">
              {(["estimator", "pm", "admin"] as HomeRole[]).map((role) => (
                <button
                  className={homeRole === role ? "active" : ""}
                  key={role}
                  onClick={() => onHomeRoleChange(role)}
                  type="button"
                >
                  {role === "pm" ? "PM" : role[0].toUpperCase() + role.slice(1)}
                </button>
              ))}
            </div>
          ) : null}
          {homeRole === "estimator" ? <button className="primary" onClick={onCreateOpportunity}>New ITB</button> : null}
        </div>
      </section>

      {homeRole === "estimator" ? (
        <>
          <div className="metric-grid home-metrics">
            <Metric label="Revenue this Q" value={money.format(quarterRevenue)} detail="Jobs installing this quarter" />
            <Metric label="Active jobs" value={activeJobs.length} detail={`${money.format(backlogSummary.activeProduction)} in production`} />
            <Metric label="Active bids" value={pipelineOpportunities.length} detail={`${dueSoon.length} due in the next two weeks`} />
            <Metric label="Submitted bids" value={nextSubmitted.length} detail={money.format(submittedBidValue)} />
          </div>
          <section className="home-grid">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Bid calendar</h2>
                  <p>Pipeline due dates for the next two weeks.</p>
                </div>
              </div>
              <BidCalendar opportunities={dueSoon} onOpenOpportunity={onOpenOpportunity} />
            </div>
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Estimator focus</h2>
                  <p>Active bid work and submitted-bid follow-up.</p>
                </div>
              </div>
              <div className="focus-list">
                {[...pipelineOpportunities, ...nextSubmitted].slice(0, 6).map((opportunity) => (
                  <button className="focus-row interactive-row" key={opportunity.id} onClick={() => onOpenOpportunity(opportunity.id)} type="button">
                    <div>
                      <strong>{opportunity.projectName}</strong>
                      <span>{opportunity.client} - {opportunity.jobId}</span>
                    </div>
                    <Status value={opportunity.status} />
                  </button>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}

      {homeRole === "pm" ? (
        <>
          <div className="metric-grid home-metrics">
            <Metric label="Active jobs" value={activeJobs.length} detail={`${money.format(backlogSummary.activeProduction)} in production`} />
            <Metric label="Installs queued" value={upcomingInstalls.length} detail="Upcoming install windows" />
            <Metric label="PM actions" value={pmActions.length} detail="Notes and job alerts" />
            <Metric label="Open CO value" value={money.format(analytics.approvedCos)} detail="Approved change orders" />
          </div>
          <section className="home-grid pm-home-grid">
            <PMActionBoard
              actions={pmActions}
              jobs={jobs}
              onCreateNote={onCreatePmNote}
              onDeleteNote={onDeletePmNote}
              onOpenJob={onOpenJob}
              onUpdateNoteText={onUpdatePmNoteText}
              onUpdateNoteStatus={onUpdatePmNoteStatus}
              title="PM action board"
            />
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Install lookahead</h2>
                  <p>Upcoming job starts for PM coordination.</p>
                </div>
              </div>
              <div className="focus-list">
                {upcomingInstalls.map((job) => (
                  <button className="focus-row interactive-row" key={job.id} onClick={() => onOpenJob(job.id)} type="button">
                    <div>
                      <strong>{job.jobNumber} - {job.projectName}</strong>
                      <span>{formatDateRange(job.installStart, job.installEnd)} - {job.pm}</span>
                    </div>
                    <Status value={job.installStatus} />
                  </button>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}

      {homeRole === "admin" ? (
        <>
          <div className="metric-grid home-metrics">
            <Metric label="Contract backlog" value={money.format(backlogSummary.totalBacklog)} detail={`${money.format(backlogSummary.wonNotStarted)} won not started`} />
            <Metric label="Current contract" value={money.format(yearlyRevenue)} detail="Base plus approved COs" />
            <Metric label="Win rate" value={`${analytics.winRate}%`} detail={`${analytics.wonValue ? money.format(analytics.wonValue) : "$0"} won value`} />
            <Metric label="Projected margin" value={`${analytics.margin}%`} detail="From stored final costs" />
          </div>
          <section className="home-grid">
            <div className="panel forecast-card">
              <span className="eyebrow">Backlog / forecast</span>
              <div className="forecast-total">{money.format(backlogSummary.totalBacklog)}</div>
              <div className="forecast-lines">
                <div><span>Current contract value</span><strong>{money.format(yearlyRevenue)}</strong></div>
                <div><span>Won not started</span><strong>{money.format(backlogSummary.wonNotStarted)}</strong></div>
                <div><span>Submitted bid value</span><strong>{money.format(submittedBidValue)}</strong></div>
                <div><span>Active production</span><strong>{money.format(backlogSummary.activeProduction)}</strong></div>
              </div>
            </div>
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Operating risk</h2>
                  <p>Admin preview. Deeper forecasting belongs in Analytics.</p>
                </div>
              </div>
              <div className="focus-list">
                <div className="focus-row"><strong>PM action load</strong><Status value={`${pmActions.length} open`} /></div>
                <div className="focus-row"><strong>Submitted bids pending</strong><Status value={`${nextSubmitted.length} bids`} /></div>
                <div className="focus-row"><strong>Due in two weeks</strong><Status value={`${dueSoon.length} bids`} /></div>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function BidCalendar({
  opportunities,
  onOpenOpportunity
}: {
  opportunities: Opportunity[];
  onOpenOpportunity: (opportunityId: string) => void;
}) {
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
        const visibleBids = bids.slice(0, 3);
        const hiddenCount = bids.length - visibleBids.length;
        return (
          <article className={bids.length ? "has-bids" : ""} key={iso}>
            <span>{day.toLocaleDateString("en-US", { weekday: "short" })}</span>
            <strong>{day.getDate()}</strong>
            {visibleBids.map((bid) => (
              <button className="calendar-bid" key={bid.id} onClick={() => onOpenOpportunity(bid.id)} type="button">
                {bid.jobId} {bid.projectName}
              </button>
            ))}
            {hiddenCount > 0 ? <em>+{hiddenCount} more</em> : null}
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
  onOpenJob,
  onUpdateNoteText,
  onUpdateNoteStatus,
  title
}: {
  actions: PMActionItem[];
  compact?: boolean;
  jobs: Job[];
  onCreateNote: (text: string, jobId?: string) => void;
  onDeleteNote: (noteId: string) => void;
  onOpenJob?: (jobId: string) => void;
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
          <article
            className={`pm-action ${action.severity} ${action.jobId && onOpenJob ? "interactive-action" : ""}`}
            key={action.id}
            onClick={() => {
              if (action.jobId && onOpenJob) onOpenJob(action.jobId);
            }}
          >
            {editingNoteId === action.id ? (
              <form
                className="pm-note-edit"
                onClick={(event) => event.stopPropagation()}
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
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditingNoteId(action.id);
                    setEditingText(action.title);
                  }}
                >
                  Edit
                </button>
                <button onClick={(event) => { event.stopPropagation(); onUpdateNoteStatus(action.id, "Done"); }}>Done</button>
                <button className="danger-text" onClick={(event) => { event.stopPropagation(); onDeleteNote(action.id); }}>Delete</button>
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
    weekCount: 6,
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
            <p>Month view shows only installs inside this month. Adjacent-month days stay blank.</p>
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
            <h2>PM 6-week look ahead</h2>
            <p>Near-term install and shop capacity, separate from the monthly install calendar.</p>
          </div>
        </div>
        <div className="lookahead-grid">
          {weeks.map((week) => (
            <article className={`lookahead-week ${week.installStatus} ${week.shopStatus === "overloaded" ? "shop-overloaded" : ""}`} key={week.weekStart}>
              <div className="lookahead-week-head">
                <strong>{formatDateRange(week.weekStart, week.weekEnd)}</strong>
                <span>{week.installStatus === "overloaded" || week.shopStatus === "overloaded" ? "Needs review" : "Open"}</span>
              </div>
              <div className="lookahead-metrics">
                <span>Install <b>{week.installJobCount}</b></span>
                <span>Peak crew <b>{week.installCrewPeak}</b> / {installCrewCapacity}</span>
                <span>Shop <b>{week.shopJobCount}</b> / {shopJobCapacity}</span>
              </div>
              {week.installJobs.length ? (
                <div className="lookahead-jobs">
                  {week.installJobs.map((job) => (
                    <button key={job.id} onClick={() => onOpenJob(job.id)} type="button">
                      <strong>{job.jobNumber}</strong>
                      <span>{job.installStart} to {job.installEnd || job.installStart}</span>
                    </button>
                  ))}
                </div>
              ) : <p className="lookahead-empty">No installs scheduled.</p>}
              {week.warnings.length ? <p className="lookahead-warning">{week.warnings.join(" | ")}</p> : null}
            </article>
          ))}
        </div>
      </section>
      {selectedDay ? <InstallDayModal day={selectedDay} onClose={() => setSelectedDay(null)} onOpenJob={onOpenJob} /> : null}
    </div>
  );
}

function InstallCalendarDayCell({ day, onOpen }: { day: InstallCalendarDay; onOpen: (day: InstallCalendarDay) => void }) {
  return (
    <button
      className={`install-day ${day.inMonth ? "" : "muted"} ${day.jobs.length ? "has-install" : ""} ${day.isOverloaded ? "overloaded" : ""}`}
      onClick={() => onOpen(day)}
      style={{ gridColumnStart: day.dayNumber === 1 ? day.weekdayIndex : undefined }}
      type="button"
    >
      <div className="install-day-number">
        <span>{day.monthTag ? <><b>{day.monthTag}</b> {day.dayNumber}</> : day.dayNumber}</span>
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

function DirectoryView({
  companies,
  contacts,
  onSaveCompany,
  onSaveContact,
  persistenceStatus
}: {
  companies: Company[];
  contacts: Contact[];
  onSaveCompany: (company: Company) => void;
  onSaveContact: (contact: Contact) => void;
  persistenceStatus: string;
}) {
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newContact, setNewContact] = useState({ name: "", title: "", email: "", phone: "", mobile: "" });
  const visibleContacts = selectedCompanyId ? contacts.filter((contact) => contact.companyId === selectedCompanyId) : contacts;
  const sortedCompanies = [...companies].sort((a, b) => a.name.localeCompare(b.name));

  function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newCompanyName.trim();
    if (!name) return;
    const company: Company = { id: makeLocalId("company"), name, companyType: "GC", tags: [], active: true };
    onSaveCompany(company);
    setNewCompanyName("");
    setSelectedCompanyId(company.id);
  }

  function createContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newContact.name.trim();
    if (!name) return;
    onSaveContact({
      id: makeLocalId("contact"),
      companyId: selectedCompanyId || undefined,
      name,
      title: nullableInput(newContact.title),
      email: nullableInput(newContact.email),
      phone: nullableInput(newContact.phone),
      mobile: nullableInput(newContact.mobile),
      tags: [],
      active: true
    });
    setNewContact({ name: "", title: "", email: "", phone: "", mobile: "" });
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Directory</h2>
            <p>Shared GC, owner, architect, vendor, and project contact roster.</p>
            <small className="persistence-note">{persistenceStatus}</small>
          </div>
          <Users size={28} />
        </div>
        <div className="metric-grid small">
          <Metric label="Companies" value={String(companies.length)} />
          <Metric label="Contacts" value={String(contacts.length)} />
          <Metric label="GC contacts" value={String(contacts.filter((contact) => contact.companyId && companies.find((company) => company.id === contact.companyId)?.companyType === "GC").length)} />
          <Metric label="Unassigned" value={String(contacts.filter((contact) => !contact.companyId).length)} />
        </div>
        <div className="directory-layout">
          <aside className="directory-sidebar">
            <label>
              Company
              <select value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)}>
                <option value="">All companies</option>
                {sortedCompanies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </label>
            <form className="compact-form" onSubmit={createCompany}>
              <input value={newCompanyName} onChange={(event) => setNewCompanyName(event.target.value)} placeholder="New company" />
              <button className="primary" type="submit">Add company</button>
            </form>
          </aside>
          <div className="directory-main">
            <form className="directory-contact-form" onSubmit={createContact}>
              <input value={newContact.name} onChange={(event) => setNewContact((current) => ({ ...current, name: event.target.value }))} placeholder="Contact name" />
              <input value={newContact.title} onChange={(event) => setNewContact((current) => ({ ...current, title: event.target.value }))} placeholder="Role / title" />
              <input value={newContact.email} onChange={(event) => setNewContact((current) => ({ ...current, email: event.target.value }))} placeholder="Email" />
              <input value={newContact.phone} onChange={(event) => setNewContact((current) => ({ ...current, phone: event.target.value }))} placeholder="Office" />
              <input value={newContact.mobile} onChange={(event) => setNewContact((current) => ({ ...current, mobile: event.target.value }))} placeholder="Mobile" />
              <button className="primary" type="submit">Add contact</button>
            </form>
            <div className="table-wrap">
              <table className="jobs-table directory-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Company</th>
                    <th>Role</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Mobile</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleContacts.length ? visibleContacts.map((contact) => {
                    const company = contact.company ?? companies.find((candidate) => candidate.id === contact.companyId);
                    return (
                      <tr key={contact.id}>
                        <td><strong>{contact.name}</strong></td>
                        <td>{company?.name ?? "-"}</td>
                        <td>{contact.title ?? "-"}</td>
                        <td>{contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : "-"}</td>
                        <td>{contact.phone ?? "-"}</td>
                        <td>{contact.mobile ?? "-"}</td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={6}>No contacts yet. Add a company, then add the GC PM, super, estimator, or vendor contact.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
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

function makeLocalId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

function nullableInput(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
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
  contacts,
  onAddContact,
  onRemoveContact,
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
  contacts: Contact[];
  onAddContact: (opportunityId: string, contactId: string) => void;
  onRemoveContact: (opportunityId: string, joinId: string) => void;
  onReopenOpportunity?: (opportunityId: string, targetStatus: OpportunityStatus) => void;
}) {
  const [draft, setDraft] = useState(opportunity);
  const [awardPm, setAwardPm] = useState("Geoff");
  const [awardDate, setAwardDate] = useState(today);
  const [awardJobNumber, setAwardJobNumber] = useState(() =>
    suggestJobNumber({ pm: "Geoff", awardDate: today, existingJobs })
  );
  const [awardContract, setAwardContract] = useState(draft.initialContractValue ?? draft.estimatedValue);
  const [contactPickerId, setContactPickerId] = useState("");
  const canConvert = draft.status !== "Lost" && draft.status !== "Archived" && draft.winLoss !== "Lost";
  const linkedContactIds = new Set((draft.contacts ?? []).map((contact) => contact.contactId));
  const availableContacts = contacts.filter((contact) => !linkedContactIds.has(contact.id));

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

          <section className="modal-section">
            <div className="modal-section-head">
              <div>
                <h3>Project contacts</h3>
                <p>These carry into Job Detail when the opportunity is awarded.</p>
              </div>
              {availableContacts.length ? (
                <label className="contact-picker">
                  <select value={contactPickerId} onChange={(event) => setContactPickerId(event.target.value)}>
                    <option value="">Attach contact</option>
                    {availableContacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>{contact.name}</option>
                    ))}
                  </select>
                  <button
                    className="ghost-button compact"
                    disabled={!contactPickerId}
                    onClick={() => {
                      onAddContact(draft.id, contactPickerId);
                      const contact = contacts.find((candidate) => candidate.id === contactPickerId);
                      if (contact) {
                        setDraft((current) => ({
                          ...current,
                          contacts: [
                            ...(current.contacts ?? []),
                            {
                              id: makeLocalId("opp-contact"),
                              contactId: contact.id,
                              contact,
                              role: contact.title ?? "Project contact"
                            }
                          ]
                        }));
                      }
                      setContactPickerId("");
                    }}
                    type="button"
                  >
                    Add
                  </button>
                </label>
              ) : null}
            </div>
            <div className="project-contact-strip">
              {(draft.contacts ?? []).length ? (draft.contacts ?? []).map((item) => (
                <span className="contact-pill" key={item.id}>
                  {item.contact?.name ?? item.contactId}
                  <small>{item.role}</small>
                  <button
                    onClick={() => {
                      onRemoveContact(draft.id, item.id);
                      setDraft((current) => ({
                        ...current,
                        contacts: (current.contacts ?? []).filter((contact) => contact.id !== item.id)
                      }));
                    }}
                    type="button"
                  >
                    x
                  </button>
                </span>
              )) : <span className="empty-note">No contacts attached yet.</span>}
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

