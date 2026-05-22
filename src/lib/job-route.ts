type JobRouteLike = {
  id?: string;
  jobNumber?: string;
};

export type JobRouteParam = {
  jobNumber: string;
};

export function buildJobRouteHash(job: JobRouteLike): string {
  const token = normalizeJobRouteToken(job.jobNumber || job.id || "");
  return token ? `#job/${token}` : "#jobs";
}

export function parseJobRouteHash(hash: string): JobRouteParam | null {
  const cleaned = hash.trim().replace(/^#/, "");
  const match = cleaned.match(/^job\/(.+)$/i);
  if (!match) return null;
  const jobNumber = normalizeJobRouteToken(decodeURIComponent(match[1] ?? ""));
  return jobNumber ? { jobNumber } : null;
}

export function resolveJobRoute<T extends JobRouteLike>(hash: string, jobs: T[]): T | null {
  const route = parseJobRouteHash(hash);
  if (!route) return null;
  const normalizedRoute = normalizeComparable(route.jobNumber);
  return (
    jobs.find((job) => normalizeComparable(job.jobNumber ?? "") === normalizedRoute) ??
    jobs.find((job) => normalizeComparable(job.id ?? "") === normalizedRoute) ??
    null
  );
}

function normalizeJobRouteToken(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function normalizeComparable(value: string): string {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}
