type ScheduleJobLike = {
  id: string;
  jobNumber: string;
  projectName: string;
  installStart?: string;
  installEnd?: string;
  expectedFabStart?: string;
  expectedCompletion?: string;
  crewSize?: number;
  backlogStatus?: string;
  pm?: string;
  gc?: string;
};

export type CapacityStatus = "open" | "busy" | "overloaded";

export type CapacityWeek = {
  weekStart: string;
  weekEnd: string;
  installJobCount: number;
  installCrewPeak: number;
  installStatus: CapacityStatus;
  shopJobCount: number;
  shopStatus: CapacityStatus;
  warnings: string[];
  installJobs: ScheduleJobLike[];
  shopJobs: ScheduleJobLike[];
};

export type InstallCalendarJob = Pick<ScheduleJobLike, "id" | "jobNumber" | "projectName" | "installStart" | "installEnd" | "crewSize" | "pm" | "gc">;

export type InstallCalendarDay = {
  date: string;
  dayNumber: number;
  inMonth: boolean;
  monthTag?: string;
  weekdayIndex: number;
  jobs: InstallCalendarJob[];
  crewTotal: number;
  isOverloaded: boolean;
};

export type InstallCalendarMonth = {
  month: string;
  label: string;
  days: InstallCalendarDay[];
};

export function addMonthsToCalendarMonth(month: string, amount: number): string {
  const parsed = new Date(`${month}-01T12:00:00`);
  parsed.setMonth(parsed.getMonth() + amount);
  return parsed.toISOString().slice(0, 7);
}

export function buildInstallCalendarMonth({
  jobs,
  month,
  installCrewCapacity = 5
}: {
  jobs: ScheduleJobLike[];
  month: string;
  installCrewCapacity?: number;
}): InstallCalendarMonth {
  const monthStart = `${month}-01`;
  const parsedMonth = new Date(`${monthStart}T12:00:00`);
  const label = parsedMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const dayCount = daysInMonth(parsedMonth);
  const start = startOfWeek(monthStart);
  const end = endOfWeek(`${month}-${String(dayCount).padStart(2, "0")}`);
  const calendarDayCount = daysBetween(start, end) + 1;

  const days = Array.from({ length: calendarDayCount }, (_, index) => {
    const date = addDays(start, index);
    const inMonth = date.startsWith(month);
    const dayJobs = jobs
      .filter((job) => overlaps(job.installStart, job.installEnd, date, date))
      .map((job) => ({
        id: job.id,
        jobNumber: job.jobNumber,
        projectName: job.projectName,
        installStart: job.installStart,
        installEnd: job.installEnd,
        crewSize: job.crewSize,
        pm: job.pm,
        gc: job.gc
      }));
    const crewTotal = dayJobs.reduce((sum, job) => sum + (job.crewSize ?? 1), 0);

    return {
      date,
      dayNumber: Number(date.slice(-2)),
      inMonth,
      monthTag: !inMonth && Number(date.slice(-2)) === 1 ? monthAbbreviation(date) : index === 0 && !inMonth ? monthAbbreviation(date) : undefined,
      weekdayIndex: weekdayIndex(date),
      jobs: dayJobs,
      crewTotal,
      isOverloaded: dayJobs.length > 1 || crewTotal > installCrewCapacity
    };
  });

  return { month, label, days };
}

export function buildCapacityWeeks({
  jobs,
  startDate,
  weekCount,
  installCrewCapacity,
  shopJobCapacity
}: {
  jobs: ScheduleJobLike[];
  startDate: string;
  weekCount: number;
  installCrewCapacity: number;
  shopJobCapacity: number;
}): CapacityWeek[] {
  const firstMonday = startOfWeek(startDate);

  return Array.from({ length: weekCount }, (_, index) => {
    const weekStart = addDays(firstMonday, index * 7);
    const weekEnd = addDays(weekStart, 6);
    const installJobs = jobs.filter((job) => overlaps(job.installStart, job.installEnd, weekStart, weekEnd));
    const shopJobs = jobs.filter((job) => overlaps(job.expectedFabStart, job.expectedCompletion, weekStart, weekEnd));
    const installCrewPeak = peakCrewNeed(installJobs, weekStart, weekEnd);
    const warnings = [
      installJobs.length > 1 ? `${installJobs.length} installs overlap this week` : "",
      installCrewPeak > installCrewCapacity ? `Peak install crew need is ${installCrewPeak} / ${installCrewCapacity}` : "",
      shopJobs.length > shopJobCapacity ? `Shop has ${shopJobs.length} active jobs / ${shopJobCapacity}` : ""
    ].filter(Boolean);

    return {
      weekStart,
      weekEnd,
      installJobCount: installJobs.length,
      installCrewPeak,
      installStatus: statusFor(installCrewPeak, installCrewCapacity, installJobs.length > 1),
      shopJobCount: shopJobs.length,
      shopStatus: statusFor(shopJobs.length, shopJobCapacity, false),
      warnings,
      installJobs,
      shopJobs
    };
  });
}

function peakCrewNeed(jobs: ScheduleJobLike[], weekStart: string, weekEnd: string): number {
  let peak = 0;
  let day = weekStart;

  while (day <= weekEnd) {
    const crew = jobs
      .filter((job) => overlaps(job.installStart, job.installEnd, day, day))
      .reduce((sum, job) => sum + (job.crewSize ?? 1), 0);
    peak = Math.max(peak, crew);
    day = addDays(day, 1);
  }

  return peak;
}

function statusFor(value: number, capacity: number, forceOverload: boolean): CapacityStatus {
  if (forceOverload || value > capacity) return "overloaded";
  if (value >= Math.ceil(capacity * 0.75)) return "busy";
  return "open";
}

function overlaps(start: string | undefined, end: string | undefined, rangeStart: string, rangeEnd: string): boolean {
  if (!start) return false;
  const safeEnd = end || start;
  return start <= rangeEnd && safeEnd >= rangeStart;
}

function startOfWeek(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  const day = parsed.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  parsed.setDate(parsed.getDate() + diff);
  return toIso(parsed);
}

function endOfWeek(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  const day = parsed.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  parsed.setDate(parsed.getDate() + diff);
  return toIso(parsed);
}

function addDays(date: string, amount: number): string {
  const parsed = new Date(`${date}T12:00:00`);
  parsed.setDate(parsed.getDate() + amount);
  return toIso(parsed);
}

function daysBetween(start: string, end: string): number {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function weekdayIndex(date: string): number {
  const parsed = new Date(`${date}T12:00:00`);
  const day = parsed.getDay();
  return day === 0 ? 7 : day;
}

function monthAbbreviation(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short" }).toUpperCase();
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
