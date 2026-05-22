import type { ActivityEvent, Estimate, Job, Opportunity } from "@/types";

type JobNumberLike = {
  jobNumber?: string;
  bidRef?: string;
};

type OpportunityLike = {
  jobId?: string;
  status?: string;
  winLoss?: string;
  bidDueDate?: string;
  sentDate?: string;
  receivedDate?: string;
  wonLostDate?: string;
};

type AwardDetails = {
  pm: string;
  jobNumber: string;
  contractValue: number;
  ntpDate: string;
};

export type RegisterView =
  | "this-year"
  | "carryover"
  | "submitted"
  | "cold"
  | "won"
  | "lost"
  | "archived"
  | "all";

const pmInitials: Record<string, string> = {
  geoff: "G",
  pat: "P",
  joe: "J",
  evan: "E"
};

export function suggestJobNumber(input: {
  pm: string;
  awardDate: string;
  existingJobs: JobNumberLike[];
}): string {
  const initial = pmInitials[input.pm.toLowerCase()] ?? (input.pm.trim().slice(0, 1).toUpperCase() || "J");
  const year = twoDigitYear(input.awardDate);
  const prefix = `${initial}${year}-`;
  const max = input.existingJobs.reduce((highest, job) => {
    const number = job.jobNumber ?? "";
    if (!number.startsWith(prefix)) return highest;
    const parsed = Number(number.slice(prefix.length));
    return Number.isFinite(parsed) ? Math.max(highest, parsed) : highest;
  }, 0);

  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export function nextOpportunityId({
  date,
  jobs,
  opportunities
}: {
  date: string;
  jobs: JobNumberLike[];
  opportunities: OpportunityLike[];
}): string {
  const year = twoDigitYear(date);
  const pattern = new RegExp(`^Q-${year}-(\\d{3})$`);
  const numbers = [
    ...opportunities.map((opportunity) => opportunity.jobId ?? ""),
    ...jobs.map((job) => job.bidRef ?? "")
  ]
    .map((value) => value.match(pattern)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value));
  const next = Math.max(0, ...numbers) + 1;

  return `Q-${year}-${String(next).padStart(3, "0")}`;
}

export function buildNewOpportunity({
  date,
  id,
  jobs,
  opportunities
}: {
  date: string;
  id: string;
  jobs: JobNumberLike[];
  opportunities: OpportunityLike[];
}): Opportunity {
  return {
    id,
    jobId: nextOpportunityId({ date, jobs, opportunities }),
    month: monthFromDate(date),
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
}

export function buildOpportunityEstimate({
  id,
  opportunity
}: {
  id: string;
  opportunity: Opportunity;
}): Estimate {
  return {
    id,
    opportunityId: opportunity.id,
    documentType: opportunity.workType === "Service" ? "Service Quote" : "Proposal",
    proposalNumber: opportunity.jobId,
    projectId: opportunity.jobId,
    projectName: opportunity.projectName,
    client: opportunity.client,
    bidDate: opportunity.sentDate || "",
    dueDate: opportunity.bidDueDate,
    pricingMode: "byarea",
    ohPct: 12,
    delPct: 3,
    insPct: 8,
    areas: [
      {
        id: `${id}-area-1`,
        name: "Base Bid",
        qty: 1,
        sections: [
          {
            id: `${id}-section-1`,
            name: "Unpriced Scope",
            items: [{ id: `${id}-item-1`, name: "Add takeoff item", qty: 1, unit: "LS", unitCost: 0 }]
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
}

export function buildAwardedOpportunityJob({
  activityId,
  award,
  jobId,
  makeContactId,
  opportunity,
  today
}: {
  activityId: string;
  award: AwardDetails;
  jobId: string;
  makeContactId: () => string;
  opportunity: Opportunity;
  today: string;
}): { awardedOpportunity: Opportunity; job: Job; activity: ActivityEvent } {
  const contractValue = award.contractValue || opportunity.initialContractValue || opportunity.estimatedValue;
  const ntpDate = award.ntpDate || today;
  const awardedOpportunity: Opportunity = {
    ...opportunity,
    status: "Won",
    winLoss: "Won",
    ntpReceived: true,
    initialContractValue: contractValue
  };
  const activity: ActivityEvent = {
    id: activityId,
    ownerType: "job",
    ownerId: jobId,
    author: "System",
    message: `Created from won opportunity ${opportunity.jobId}. NTP ${ntpDate}.`,
    createdAt: today
  };
  const files = (opportunity.files ?? []).map((file) => ({
    ...file,
    id: `job-file-${file.id}`,
    ownerType: "job" as const,
    ownerId: jobId
  }));
  const job: Job = {
    id: jobId,
    opportunityId: isUuid(opportunity.id) ? opportunity.id : undefined,
    companyId: opportunity.companyId,
    jobNumber: award.jobNumber,
    pm: award.pm,
    client: opportunity.client,
    projectName: opportunity.projectName,
    baseContract: contractValue,
    bidRef: opportunity.jobId,
    awardDate: ntpDate,
    ntpDate,
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
    files,
    contacts: (opportunity.contacts ?? []).map((contact) => ({
      ...contact,
      id: makeContactId()
    })),
    activity: [activity]
  };

  return { awardedOpportunity, job, activity };
}

export function filterOpportunitiesForView<T extends OpportunityLike>(
  opportunities: T[],
  input: {
    view: RegisterView;
    year: number | "all";
    today: string;
  }
): T[] {
  return opportunities.filter((opportunity) => {
    const matchesView = viewPredicate(opportunity, input.view, input.today);
    if (input.view === "carryover") return matchesView;
    const matchesYear = input.year === "all" || opportunityBelongsToYear(opportunity, input.year);
    if (input.view === "this-year" && input.year !== "all") {
      return matchesView && (matchesYear || isCarryover(opportunity, input.today));
    }
    return matchesView && matchesYear;
  });
}

export function opportunityBelongsToYear(opportunity: OpportunityLike, year: number): boolean {
  const candidates = [
    opportunity.receivedDate,
    opportunity.bidDueDate,
    opportunity.sentDate,
    opportunity.wonLostDate,
    opportunity.jobId?.match(/^Q-(\d{2})-/)?.[1] ? `20${opportunity.jobId.match(/^Q-(\d{2})-/)?.[1]}-01-01` : ""
  ];

  return candidates.some((value) => getYear(value) === year);
}

function viewPredicate(opportunity: OpportunityLike, view: RegisterView, today: string): boolean {
  switch (view) {
    case "this-year":
      return opportunity.status !== "Archived";
    case "carryover":
      return isCarryover(opportunity, today);
    case "submitted":
      return opportunity.status === "Submitted" && !opportunity.winLoss;
    case "cold":
      return opportunity.status === "Cold";
    case "won":
      return opportunity.winLoss === "Won" || opportunity.status === "Won";
    case "lost":
      return opportunity.winLoss === "Lost" || opportunity.status === "Lost";
    case "archived":
      return opportunity.status === "Archived";
    case "all":
      return true;
  }
}

function isCarryover(opportunity: OpportunityLike, today: string): boolean {
  if (opportunity.winLoss || opportunity.status === "Archived") return false;
  const currentYear = getYear(today);
  const originalYear = getYear(opportunity.receivedDate || opportunity.bidDueDate || opportunity.sentDate);
  if (!currentYear || !originalYear) return false;
  return originalYear < currentYear;
}

function twoDigitYear(value: string): string {
  const year = getYear(value) ?? new Date().getFullYear();
  return String(year).slice(-2);
}

function getYear(value?: string): number | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.getFullYear();
}

function monthFromDate(value: string): string {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "long" });
}

function isUuid(value?: string): boolean {
  return Boolean(value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i));
}
