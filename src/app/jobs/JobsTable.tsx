"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { currentContractValue, JOB_STATUS_LABELS, JOB_STATUSES, type Job } from "@/lib/types";
import { formatInstallWindow, pmColor } from "@/lib/jobs/derive";
import { money } from "@/lib/estimator/math";
import type { JobsData } from "./JobsView";

export function JobsTable({ data }: { data: JobsData }) {
  const { jobs, changeOrders, files } = data;
  const [query, setQuery] = useState("");
  const [pmFilter, setPmFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const pms = useMemo(() => ["All", ...new Set(jobs.map((job) => job.pm).filter(Boolean))], [jobs]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return jobs
      .filter((job) => {
        const haystack = `${job.jobNumber} ${job.client} ${job.projectName} ${job.gc} ${job.notes}`.toLowerCase();
        return (!q || haystack.includes(q)) &&
          (pmFilter === "All" || job.pm === pmFilter) &&
          (statusFilter === "All" || job.status === statusFilter);
      })
      .sort((a, b) => a.jobNumber.localeCompare(b.jobNumber, undefined, { numeric: true }));
  }, [jobs, query, pmFilter, statusFilter]);

  return (
    <div>
      <div className="toolbar">
        <input className="search" onChange={(e) => setQuery(e.target.value)} placeholder="Search client, project, job #…" value={query} />
        <select onChange={(e) => setPmFilter(e.target.value)} value={pmFilter}>
          {pms.map((pm) => <option key={pm}>{pm}</option>)}
        </select>
        <select onChange={(e) => setStatusFilter(e.target.value)} value={statusFilter}>
          <option>All</option>
          {JOB_STATUSES.map((status) => <option key={status} value={status}>{JOB_STATUS_LABELS[status]}</option>)}
        </select>
        <span className="muted count">{filtered.length} of {jobs.length} jobs</span>
      </div>
      <div className="panel table-panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Job #</th><th>Client</th><th>Project</th><th>PM</th><th>Status</th>
              <th className="num">Value</th><th>Install Window</th><th>Crew</th><th>Docs</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? <tr><td className="empty" colSpan={9}>No jobs match your filters.</td></tr> : null}
            {filtered.map((job) => {
              const cos = changeOrders.filter((co) => co.jobId === job.id);
              const approved = cos.filter((co) => co.status === "approved");
              const value = currentContractValue(job, cos);
              const docCount = files.filter((file) => file.ownerType === "job" && file.ownerId === job.id).length;
              return (
                <tr key={job.id}>
                  <td className="mono"><Link className="row-link mono" href={`/jobs/${job.id}`}>{job.jobNumber}</Link></td>
                  <td><strong>{job.client || "—"}</strong></td>
                  <td>{job.projectName || "—"}</td>
                  <td><span className="pm-cell"><span className="pm-dot" style={{ background: pmColor(job.pm) }}>{job.pm.slice(0, 1)}</span>{job.pm || "—"}</span></td>
                  <td><span className={`status status-${job.status}`}>{JOB_STATUS_LABELS[job.status]}</span></td>
                  <td className={`num${approved.length ? " co-value" : ""}`}>
                    {value ? money(value) : "—"}
                    {approved.length ? <span className="co-pill">+{approved.length} CO</span> : null}
                  </td>
                  <td>{formatInstallWindow(job)}</td>
                  <td>👷 {job.crewSize}</td>
                  <td>{docCount ? <span className="doc-pill">📎 {docCount}</span> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
