export function suggestServiceJobNumber({
  date,
  existingJobs
}: {
  date: string;
  existingJobs: Array<{ jobNumber?: string }>;
}) {
  const year = date.slice(2, 4);
  const prefix = `S${year}-`;
  const maxForYear = existingJobs.reduce((max, job) => {
    const jobNumber = job.jobNumber ?? "";
    if (!jobNumber.startsWith(prefix)) return max;
    const value = Number(jobNumber.slice(prefix.length));
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);

  return `${prefix}${String(maxForYear + 1).padStart(3, "0")}`;
}
