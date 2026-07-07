"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { listActivity, listChangeOrders, listJobs, saveJob } from "@/lib/repos/jobs";
import { listFiles } from "@/lib/repos/files";
import { currentContractValue, JOB_STATUS_LABELS, type ActivityEvent, type ChangeOrder, type Job, type JobStatus, type ProjectFile } from "@/lib/types";
import { formatInstallWindow, installDurationDays, pmColor } from "@/lib/jobs/derive";
import { money } from "@/lib/estimator/math";
import { ChangeOrdersSection, DocSlots, ActivityLog } from "./JobDetailSections";

export function JobDetail() {
  const params = useParams<{ id: string }>();
  const { profile } = useAuth();
  const author = profile?.fullName || "Unknown";
  const [job, setJob] = useState<Job | null>(null);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let mounted = true;
    Promise.all([listJobs(), listChangeOrders(), listFiles("job", params.id), listActivity(params.id)])
      .then(([jobs, cos, fileRows, events]) => {
        if (!mounted) return;
        setJob(jobs.find((row) => row.id === params.id) ?? null);
        setChangeOrders(cos.filter((co) => co.jobId === params.id));
        setFiles(fileRows);
        setActivity(events);
      })
      .catch(() => setNotice("Could not load this job."));
    return () => { mounted = false; };
  }, [params.id]);

  const persistJob = useCallback(async (next: Job) => {
    setJob(next);
    setNotice("Saving…");
    try {
      setJob(await saveJob(next));
      setNotice("Saved.");
    } catch {
      setNotice("Save failed — change is local only.");
    }
  }, []);

  async function sendToPm() {
    if (!job) return;
    const { buildHandoffEmail, buildMailtoUrl, HANDOFF_LINK_EXPIRY_SECONDS, HANDOFF_SLOTS } = await import("@/lib/jobs/handoff");
    const { signFileUrl } = await import("@/lib/repos/files");
    const { addActivity } = await import("@/lib/repos/jobs");

    const links: { slot: (typeof HANDOFF_SLOTS)[number]; url: string }[] = [];
    const missingSlots: (typeof HANDOFF_SLOTS)[number][] = [];
    for (const slot of HANDOFF_SLOTS) {
      const file = files.find((f) => f.slot === slot);
      if (!file) { missingSlots.push(slot); continue; }
      const signed = await signFileUrl(file, HANDOFF_LINK_EXPIRY_SECONDS).catch(() => file);
      if (signed.url) links.push({ slot, url: signed.url });
      else missingSlots.push(slot);
    }

    const email = buildHandoffEmail({ job, changeOrders, links, missingSlots });
    const sent = links.length ? links.map((link) => link.slot).join(", ") : "no documents";
    const event = await addActivity(job.id, author, `Handoff sent to ${job.pm || "PM"}: ${sent}.`).catch(() => null);
    if (event) setActivity((current) => [event, ...current]);
    window.location.href = buildMailtoUrl(email);
  }

  if (!job) return <p className="muted">{notice || "Loading…"}</p>;

  const currentValue = currentContractValue(job, changeOrders);
  const approvedTotal = currentValue - job.contractValue;

  return (
    <div className="job-detail">
      <div className="job-breadcrumb">
        <Link href="/jobs">Jobs</Link>
        <span>/</span>
        <strong className="mono">{job.jobNumber}</strong>
        <span className="muted">{notice}</span>
      </div>

      <header className="page-header">
        <div>
          <h1>{job.jobNumber} — {job.client}</h1>
          <p>{job.projectName}</p>
        </div>
        <button className="primary" onClick={() => void sendToPm()} type="button">Send to PM</button>
      </header>

      <section className="panel overview-grid">
        <div><span>Project Manager</span><strong><span className="pm-dot" style={{ background: pmColor(job.pm) }}>{job.pm.slice(0, 1)}</span> {job.pm || "—"}</strong></div>
        <div><span>Status</span><strong><span className={`status status-${job.status}`}>{JOB_STATUS_LABELS[job.status]}</span></strong></div>
        <div>
          <span>Contract Value</span>
          <strong className={approvedTotal ? "co-value" : ""}>{money(currentValue)}</strong>
          {approvedTotal ? <small>orig. {money(job.contractValue)} {approvedTotal > 0 ? "+" : "−"}{money(Math.abs(approvedTotal))} CO</small> : null}
        </div>
        <div><span>Install Start</span><strong>{job.installStart || "—"}</strong></div>
        <div><span>Install End</span><strong>{job.installEnd || (job.installStart ? "Same day" : "—")}</strong></div>
        <div><span>Duration & Crew</span><strong>{job.installStart ? `${installDurationDays(job)} day(s) · 👷 ${job.crewSize}` : `👷 ${job.crewSize}`}</strong></div>
        <div><span>GC / Contractor</span><strong>{job.gc || "—"}</strong></div>
        <div><span>Job Number</span><strong className="mono">{job.jobNumber}</strong></div>
      </section>

      {job.notes ? (
        <section className="notes-callout">
          <span>NOTES</span>
          <p>{job.notes}</p>
        </section>
      ) : null}

      <section className="panel">
        <h3>Update Status</h3>
        <div className="status-buttons">
          {(["ready", "active", "completed", "installed"] as JobStatus[]).map((status) => (
            <button
              className={`status-btn status-${status}${job.status === status ? " current" : ""}`}
              key={status}
              onClick={() => void persistJob({ ...job, status })}
              type="button"
            >
              {JOB_STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      </section>

      <details className="panel edit-panel">
        <summary>Edit job</summary>
        <div className="form-grid">
          <label>PM<input onBlur={(e) => void persistJob({ ...job, pm: e.target.value })} defaultValue={job.pm} /></label>
          <label>GC<input onBlur={(e) => void persistJob({ ...job, gc: e.target.value })} defaultValue={job.gc} /></label>
          <label>Install start<input onBlur={(e) => void persistJob({ ...job, installStart: e.target.value })} defaultValue={job.installStart} type="date" /></label>
          <label>Install end<input onBlur={(e) => void persistJob({ ...job, installEnd: e.target.value })} defaultValue={job.installEnd} type="date" /></label>
          <label>Crew size<input max={6} min={1} onBlur={(e) => void persistJob({ ...job, crewSize: Math.min(6, Math.max(1, Number(e.target.value) || 1)) })} defaultValue={job.crewSize} type="number" /></label>
          <label>Original contract<input onBlur={(e) => void persistJob({ ...job, contractValue: Number(e.target.value) || 0 })} defaultValue={job.contractValue || ""} type="number" /></label>
          <label className="span-2">Notes<textarea onBlur={(e) => void persistJob({ ...job, notes: e.target.value })} defaultValue={job.notes} rows={2} /></label>
          <label>Void job
            <button className="danger-link" onClick={() => void persistJob({ ...job, status: "void" })} type="button">Mark Void</button>
          </label>
        </div>
      </details>

      <DocSlots author={author} files={files} jobId={job.id} setFiles={setFiles} setNotice={setNotice} />
      <ChangeOrdersSection
        activitySink={(event) => setActivity((current) => [event, ...current])}
        author={author}
        changeOrders={changeOrders}
        job={job}
        setChangeOrders={setChangeOrders}
        setNotice={setNotice}
      />
      <ActivityLog activity={activity} author={author} jobId={job.id} setActivity={setActivity} setNotice={setNotice} />

      <div className="muted">Install window: {formatInstallWindow(job)}</div>
    </div>
  );
}
