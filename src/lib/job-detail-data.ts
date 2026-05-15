import type { Job, PMNote } from "@/types";

export type JobDetailData = {
  job: Job;
  notes: PMNote[];
  isPersisted: boolean;
};

export function getJobDetailData({
  jobs,
  pmNotes,
  jobId
}: {
  jobs: Job[];
  pmNotes: PMNote[];
  jobId: string | null;
}): JobDetailData | null {
  if (!jobId) return null;
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job) return null;

  return {
    job,
    notes: pmNotes.filter((note) => note.jobId === job.id),
    isPersisted: isUuid(job.id)
  };
}

export function replaceJobDetail(jobs: Job[], persistedJob: Job) {
  let replaced = false;
  const nextJobs = jobs.map((job) => {
    if (job.id !== persistedJob.id && normalizeJobNumber(job.jobNumber) !== normalizeJobNumber(persistedJob.jobNumber)) {
      return job;
    }
    replaced = true;
    return persistedJob;
  });

  return replaced ? nextJobs : [persistedJob, ...nextJobs];
}

function normalizeJobNumber(value: string) {
  return value.trim().toLowerCase();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
