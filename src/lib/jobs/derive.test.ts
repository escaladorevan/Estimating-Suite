import { describe, expect, it } from "vitest";
import {
  addMonths,
  buildCalendarMonth,
  coversDay,
  dayCapacityClass,
  formatInstallWindow,
  installDurationDays,
  isInstallingSoon,
  monthLoad
} from "./derive";
import type { Job } from "../types";

function makeJob(overrides: Partial<Job>): Job {
  return {
    id: Math.random().toString(36).slice(2),
    jobNumber: "G001",
    pm: "Geoff",
    client: "SUNDT",
    projectName: "Lobby",
    status: "active",
    contractValue: 10000,
    bidRef: "",
    opportunityId: null,
    estimateId: null,
    installStart: "",
    installEnd: "",
    crewSize: 2,
    gc: "",
    fabStatus: "",
    invoiceStatus: "",
    notes: "",
    ...overrides
  };
}

describe("install window math", () => {
  it("computes inclusive durations and window labels", () => {
    const job = makeJob({ installStart: "2026-08-10", installEnd: "2026-08-14" });
    expect(installDurationDays(job)).toBe(5);
    expect(formatInstallWindow(job)).toBe("Aug 10 → Aug 14 (5 days)");
    expect(formatInstallWindow(makeJob({ installStart: "2026-08-10" }))).toBe("Aug 10");
    expect(formatInstallWindow(makeJob({}))).toBe("—");
  });

  it("installing-soon: overlap with the 21-day window; started jobs count; void never", () => {
    const today = "2026-07-06";
    expect(isInstallingSoon(makeJob({ installStart: "2026-07-20" }), today)).toBe(true);
    expect(isInstallingSoon(makeJob({ installStart: "2026-08-15" }), today)).toBe(false);
    expect(isInstallingSoon(makeJob({ installStart: "2026-07-01", installEnd: "2026-07-08" }), today)).toBe(true);
    expect(isInstallingSoon(makeJob({ installStart: "2026-07-01", installEnd: "2026-07-03" }), today)).toBe(false);
    expect(isInstallingSoon(makeJob({ installStart: "2026-07-10", status: "void" }), today)).toBe(false);
  });

  it("coversDay walks the whole window", () => {
    const job = makeJob({ installStart: "2026-08-10", installEnd: "2026-08-12" });
    expect(coversDay(job, "2026-08-10")).toBe(true);
    expect(coversDay(job, "2026-08-12")).toBe(true);
    expect(coversDay(job, "2026-08-13")).toBe(false);
  });
});

describe("calendar month", () => {
  it("builds a Sunday-first grid with crew totals and crew-days", () => {
    const jobs = [
      makeJob({ installStart: "2026-08-10", installEnd: "2026-08-12", crewSize: 3 }),
      makeJob({ installStart: "2026-08-11", installEnd: "2026-08-11", crewSize: 4 })
    ];
    const month = buildCalendarMonth(jobs, "2026-08");
    expect(month.label).toBe("August 2026");
    expect(month.days[0].iso.endsWith("26-07-26")).toBe(true); // Aug 1 2026 is a Saturday → grid starts Jul 26
    const aug11 = month.days.find((day) => day.iso === "2026-08-11")!;
    expect(aug11.crewTotal).toBe(7);
    expect(aug11.jobs).toHaveLength(2);
    expect(month.jobCount).toBe(2);
    expect(month.crewDays).toBe(3 * 3 + 4); // 3 crew × 3 days + 4 crew × 1 day
  });

  it("capacity classes and month load thresholds", () => {
    expect(dayCapacityClass(0)).toBe("");
    expect(dayCapacityClass(2)).toBe("cap-lt");
    expect(dayCapacityClass(5)).toBe("cap-md");
    expect(dayCapacityClass(8)).toBe("cap-hv");
    expect(dayCapacityClass(9)).toBe("cap-mx");
    expect(monthLoad(9).label).toBe("Light load");
    expect(monthLoad(20).label).toBe("Moderate");
    expect(monthLoad(30).label).toBe("Heavy load");
    expect(monthLoad(31).label).toBe("Very busy");
  });

  it("addMonths rolls years", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
});
