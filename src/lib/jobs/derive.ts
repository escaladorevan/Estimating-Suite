// Pure derivations for the Job Dashboard — install windows, crew capacity,
// and the calendar month grid, per docs/spec-job-dashboard.md.

import type { Job } from "../types";

export const PM_COLORS: Record<string, string> = {
  Geoff: "#7c3aed",
  Pat: "#d97706",
  Joe: "#0284c7"
};

export function pmColor(pm: string): string {
  return PM_COLORS[pm] ?? "#64748b";
}

/** Inclusive duration in days; 1 when the window is a single day or open-ended. */
export function installDurationDays(job: Pick<Job, "installStart" | "installEnd">): number {
  if (!job.installStart) return 0;
  const start = new Date(`${job.installStart}T12:00:00`);
  const end = new Date(`${job.installEnd || job.installStart}T12:00:00`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

export function formatInstallWindow(job: Pick<Job, "installStart" | "installEnd">): string {
  if (!job.installStart) return "—";
  const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (!job.installEnd || job.installEnd === job.installStart) return fmt(job.installStart);
  return `${fmt(job.installStart)} → ${fmt(job.installEnd)} (${installDurationDays(job)} days)`;
}

/** Window overlaps [today, today + windowDays]; jobs already started count while their end is ahead. */
export function isInstallingSoon(job: Job, today: string, windowDays = 21): boolean {
  if (job.status === "void" || !job.installStart) return false;
  const start = new Date(`${job.installStart}T12:00:00`).getTime();
  const end = new Date(`${job.installEnd || job.installStart}T12:00:00`).getTime();
  const now = new Date(`${today}T12:00:00`).getTime();
  return start <= now + windowDays * 86_400_000 && end >= now;
}

export function coversDay(job: Job, isoDay: string): boolean {
  if (job.status === "void" || !job.installStart) return false;
  return job.installStart <= isoDay && isoDay <= (job.installEnd || job.installStart);
}

export type CalendarDay = {
  iso: string;
  dayNumber: number;
  inMonth: boolean;
  crewTotal: number;
  jobs: Job[];
};

export type CalendarMonth = {
  label: string;
  days: CalendarDay[]; // full Sun–Sat weeks
  jobCount: number;
  crewDays: number; // Σ crewSize per job per in-month day of its window
};

/** month = "YYYY-MM". Grid runs Sunday-first, padded with adjacent-month days. */
export function buildCalendarMonth(jobs: Job[], month: string): CalendarMonth {
  const [year, monthIndex] = [Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1];
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const gridStart = new Date(first);
  gridStart.setUTCDate(1 - first.getUTCDay());

  const days: CalendarDay[] = [];
  const monthJobs = new Set<string>();
  let crewDays = 0;

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + i);
    const iso = date.toISOString().slice(0, 10);
    const inMonth = date.getUTCMonth() === monthIndex;
    const dayJobs = jobs.filter((job) => coversDay(job, iso));
    const crewTotal = dayJobs.reduce((sum, job) => sum + job.crewSize, 0);
    if (inMonth) {
      crewDays += crewTotal;
      dayJobs.forEach((job) => monthJobs.add(job.id));
    }
    days.push({ iso, dayNumber: date.getUTCDate(), inMonth, crewTotal, jobs: dayJobs });
  }
  // Trim a fully-adjacent trailing week.
  const trimmed = days.slice(35).every((day) => !day.inMonth) ? days.slice(0, 35) : days;

  return {
    label: first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    days: trimmed,
    jobCount: monthJobs.size,
    crewDays
  };
}

/** Day-cell capacity class by total crew booked: ≤2 light, ≤5 moderate, ≤8 heavy, 9+ max. */
export function dayCapacityClass(crewTotal: number): string {
  if (crewTotal === 0) return "";
  if (crewTotal <= 2) return "cap-lt";
  if (crewTotal <= 5) return "cap-md";
  if (crewTotal <= 8) return "cap-hv";
  return "cap-mx";
}

/** Monthly load label by crew-days: ≤10 Light, ≤20 Moderate, ≤30 Heavy, >30 Very busy. */
export function monthLoad(crewDays: number): { label: string; className: string } {
  if (crewDays <= 10) return { label: "Light load", className: "load-lt" };
  if (crewDays <= 20) return { label: "Moderate", className: "load-md" };
  if (crewDays <= 30) return { label: "Heavy load", className: "load-hv" };
  return { label: "Very busy", className: "load-mx" };
}

export function addMonths(month: string, delta: number): string {
  const [year, monthIndex] = [Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1];
  const date = new Date(Date.UTC(year, monthIndex + delta, 1));
  return date.toISOString().slice(0, 7);
}
