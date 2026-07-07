"use client";

import Link from "next/link";
import { useState } from "react";
import { addMonths, buildCalendarMonth, dayCapacityClass, monthLoad, PM_COLORS, pmColor } from "@/lib/jobs/derive";
import type { JobsData } from "./JobsView";

export function InstallCalendar({ data }: { data: JobsData }) {
  const { jobs, today } = data;
  const [month, setMonth] = useState(today.slice(0, 7));
  const calendar = buildCalendarMonth(jobs, month);
  const load = monthLoad(calendar.crewDays);

  return (
    <div className="install-calendar-wrap">
      <div className="calendar-legend">
        {Object.entries(PM_COLORS).map(([pm, color]) => (
          <span className="legend-item" key={pm}><span className="pm-dot" style={{ background: color }} />{pm}</span>
        ))}
        <span className="legend-item"><span className="cap-swatch cap-lt" />Light</span>
        <span className="legend-item"><span className="cap-swatch cap-md" />Moderate</span>
        <span className="legend-item"><span className="cap-swatch cap-hv" />Heavy</span>
        <span className="legend-item"><span className="cap-swatch cap-mx" />Full</span>
      </div>

      <div className="panel calendar-panel">
        <div className="calendar-nav">
          <button onClick={() => setMonth(addMonths(month, -1))} type="button">← Previous</button>
          <h3>{calendar.label}</h3>
          <button onClick={() => setMonth(addMonths(month, 1))} type="button">Next →</button>
        </div>

        <div className="capacity-bar">
          {calendar.jobCount === 0 ? (
            <span className="muted">No installs scheduled in {calendar.label}.</span>
          ) : (
            <>
              <span><strong>{calendar.label}</strong> — {calendar.jobCount} job{calendar.jobCount === 1 ? "" : "s"} installing · <strong>{calendar.crewDays}</strong> crew-days booked</span>
              <span className={`load-meter ${load.className}`}>
                <span className="load-fill" style={{ width: `${Math.min(100, calendar.crewDays * 2)}%` }} />
              </span>
              <span className={`load-label ${load.className}`}>{load.label}</span>
            </>
          )}
        </div>

        <div className="calendar-grid">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span className="dow" key={day}>{day}</span>)}
          {calendar.days.map((day) => (
            <div
              className={`cal-day ${day.inMonth ? "" : "other-month"} ${dayCapacityClass(day.crewTotal)} ${day.iso === today ? "is-today" : ""}`}
              key={day.iso}
            >
              <div className="cal-day-head">
                <span className="day-number">{day.dayNumber}</span>
                {day.crewTotal ? <span className={`crew-tag ${dayCapacityClass(day.crewTotal)}`}>👷{day.crewTotal}</span> : null}
              </div>
              {day.jobs.slice(0, 3).map((job) => (
                <Link
                  className="cal-pill"
                  href={`/jobs/${job.id}`}
                  key={job.id}
                  style={{ background: `${pmColor(job.pm)}22`, color: pmColor(job.pm) }}
                  title={`${job.client} — ${job.projectName} (${job.crewSize} crew)`}
                >
                  {job.jobNumber}: {job.client}
                </Link>
              ))}
              {day.jobs.length > 3 ? <span className="muted more">+{day.jobs.length - 3} more</span> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
