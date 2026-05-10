type JobNumberLike = {
  jobNumber?: string;
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
