"use client";

import { useEffect, useState } from "react";
import { listChangeOrders, listJobs } from "@/lib/repos/jobs";
import { listAllFiles } from "@/lib/repos/files";
import type { ChangeOrder, Job, ProjectFile } from "@/lib/types";
import { JobsDashboard } from "./JobsDashboard";
import { JobsTable } from "./JobsTable";
import { InstallCalendar } from "./InstallCalendar";

type Tab = "dashboard" | "all" | "calendar";

export type JobsData = {
  jobs: Job[];
  changeOrders: ChangeOrder[];
  files: ProjectFile[];
  today: string;
};

export function JobsView() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let mounted = true;
    Promise.all([listJobs(), listChangeOrders(), listAllFiles()])
      .then(([jobRows, coRows, fileRows]) => {
        if (!mounted) return;
        setJobs(jobRows);
        setChangeOrders(coRows);
        setFiles(fileRows);
      })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const data: JobsData = { jobs, changeOrders, files, today };

  return (
    <div>
      <nav className="workspace-tabs jobs-tabs">
        {([["dashboard", "Dashboard"], ["all", "All Jobs"], ["calendar", "Install Calendar"]] as [Tab, string][]).map(([id, label]) => (
          <button className={tab === id ? "active" : ""} key={id} onClick={() => setTab(id)} type="button">{label}</button>
        ))}
      </nav>
      {loading ? <p className="muted">Loading jobs…</p> : null}
      {!loading && tab === "dashboard" ? <JobsDashboard data={data} /> : null}
      {!loading && tab === "all" ? <JobsTable data={data} /> : null}
      {!loading && tab === "calendar" ? <InstallCalendar data={data} /> : null}
    </div>
  );
}
