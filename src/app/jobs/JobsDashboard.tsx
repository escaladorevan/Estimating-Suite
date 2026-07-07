"use client";

import Link from "next/link";
import { currentContractValue, JOB_STATUS_LABELS, type Job } from "@/lib/types";
import { formatInstallWindow, installDurationDays, isInstallingSoon, pmColor } from "@/lib/jobs/derive";
import { money } from "@/lib/estimator/math";
import type { JobsData } from "./JobsView";

export function JobsDashboard({ data }: { data: JobsData }) {
  const { jobs, changeOrders, today } = data;
  const cosFor = (job: Job) => changeOrders.filter((co) => co.jobId === job.id);
  const nonVoid = jobs.filter((job) => job.status !== "void");
  const active = nonVoid.filter((job) => !["completed", "installed"].includes(job.status));
  const inProgress = jobs.filter((job) => job.status === "active");
  const done = jobs.filter((job) => ["completed", "installed"].includes(job.status));
  const installingSoon = nonVoid
    .filter((job) => isInstallingSoon(job, today))
    .sort((a, b) => a.installStart.localeCompare(b.installStart));
  const revenue = nonVoid.reduce((sum, job) => sum + currentContractValue(job, cosFor(job)), 0);

  return (
    <div className="jobs-dashboard">
      <div className="stat-cards">
        <article className="stat-card blue">
          <span>Active Jobs</span>
          <strong>{active.length}</strong>
          <small>{inProgress.length} currently in progress</small>
        </article>
        <article className="stat-card">
          <span>Installing ≤ 21 Days</span>
          <strong>{installingSoon.length}</strong>
          <small>{installingSoon[0] ? `Next: ${formatInstallWindow(installingSoon[0]).split(" →")[0]}` : "No installs scheduled yet"}</small>
        </article>
        <article className="stat-card">
          <span>Completed / Installed</span>
          <strong>{done.length}</strong>
          <small>This year</small>
        </article>
        <article className="stat-card">
          <span>YTD Revenue</span>
          <strong>{money(revenue)}</strong>
          <small>{nonVoid.filter((job) => job.contractValue > 0).length} jobs with values</small>
        </article>
      </div>

      <div className="dash-columns">
        <section className="panel">
          <h3>Installing Soon</h3>
          {installingSoon.length === 0 ? <p className="muted empty-list">Nothing installing in the next 21 days.</p> : null}
          {installingSoon.slice(0, 6).map((job) => (
            <Link className="install-card" href={`/jobs/${job.id}`} key={job.id}>
              <span className="date-tile" style={{ background: `${pmColor(job.pm)}18`, color: pmColor(job.pm) }}>
                <strong>{Number(job.installStart.slice(8, 10))}</strong>
                <small>{new Date(`${job.installStart}T12:00:00`).toLocaleDateString("en-US", { month: "short" })}</small>
              </span>
              <span className="install-card-body">
                <small>{job.jobNumber} · {job.pm} · {formatInstallWindow(job)}{installDurationDays(job) > 1 ? "" : ""}</small>
                <strong>{job.client}</strong>
                <small>{job.projectName} · 👷 {job.crewSize}</small>
              </span>
              <span className={`status status-${job.status}`}>{JOB_STATUS_LABELS[job.status]}</span>
            </Link>
          ))}
        </section>

        <section className="panel">
          <h3>In Progress</h3>
          {inProgress.length === 0 ? <p className="muted empty-list">No jobs in progress.</p> : null}
          {inProgress.slice(0, 6).map((job) => (
            <Link className="install-card" href={`/jobs/${job.id}`} key={job.id}>
              <span className="pm-dot" style={{ background: pmColor(job.pm) }}>{job.pm.slice(0, 1)}</span>
              <span className="install-card-body">
                <small>{job.jobNumber}</small>
                <strong>{job.client}</strong>
                <small>{job.projectName}{job.contractValue ? ` · ${money(currentContractValue(job, cosFor(job)))}` : ""}</small>
              </span>
              {job.installStart ? <span className="muted install-when">Install<br />{formatInstallWindow(job)}</span> : null}
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
