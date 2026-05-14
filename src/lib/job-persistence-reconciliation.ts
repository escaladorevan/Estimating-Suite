import type { Estimate, Job, PMNote } from "@/types";

type ReconcilePersistedJobIdentityInput = {
  currentJobs: Job[];
  persistedJobs: Job[];
  estimates: Estimate[];
  pmNotes: PMNote[];
  selectedJobId: string;
  detailJobId: string | null;
};

export type ReconciledPersistedJobIdentity = {
  jobs: Job[];
  estimates: Estimate[];
  pmNotes: PMNote[];
  selectedJobId: string;
  detailJobId: string | null;
  localToPersistedJobIds: Map<string, string>;
};

export function reconcilePersistedJobIdentity({
  currentJobs,
  persistedJobs,
  estimates,
  pmNotes,
  selectedJobId,
  detailJobId
}: ReconcilePersistedJobIdentityInput): ReconciledPersistedJobIdentity {
  const persistedByNumber = new Map(persistedJobs.map((job) => [normalizeJobNumber(job.jobNumber), job]));
  const localToPersistedJobIds = new Map<string, string>();
  const localChildrenByPersistedId = new Map<string, Job>();

  for (const job of currentJobs) {
    const persisted = persistedByNumber.get(normalizeJobNumber(job.jobNumber));
    if (persisted && job.id !== persisted.id) {
      localToPersistedJobIds.set(job.id, persisted.id);
      localChildrenByPersistedId.set(persisted.id, remapJobReferences(job, job.id, persisted.id));
    }
  }

  const persistedWithLocalChildren = persistedJobs.map((job) => mergePersistedJob(job, localChildrenByPersistedId.get(job.id)));
  const localOnly = currentJobs
    .filter((job) => !persistedByNumber.has(normalizeJobNumber(job.jobNumber)))
    .map((job) => remapJobReferences(job, job.id, localToPersistedJobIds.get(job.id) ?? job.id));

  return {
    jobs: [...persistedWithLocalChildren, ...localOnly],
    estimates: estimates.map((estimate) => ({
      ...estimate,
      jobId: estimate.jobId ? localToPersistedJobIds.get(estimate.jobId) ?? estimate.jobId : estimate.jobId
    })),
    pmNotes: pmNotes.map((note) => ({
      ...note,
      jobId: note.jobId ? localToPersistedJobIds.get(note.jobId) ?? note.jobId : note.jobId
    })),
    selectedJobId: localToPersistedJobIds.get(selectedJobId) ?? selectedJobId,
    detailJobId: detailJobId ? localToPersistedJobIds.get(detailJobId) ?? detailJobId : detailJobId,
    localToPersistedJobIds
  };
}

export function resolvePersistedJobForPMNote({
  jobs,
  requestedJobId,
  parsedJobNumber
}: {
  jobs: Job[];
  requestedJobId?: string;
  parsedJobNumber?: string | null;
}) {
  const requested = requestedJobId ? jobs.find((job) => job.id === requestedJobId) : undefined;
  const requestedNumber = requested?.jobNumber ?? parsedJobNumber ?? "";
  const persistedByNumber = requestedNumber
    ? jobs.find((job) => normalizeJobNumber(job.jobNumber) === normalizeJobNumber(requestedNumber) && isUuid(job.id))
    : undefined;
  const linkedJob = persistedByNumber ?? requested ?? jobs.find((job) =>
    parsedJobNumber ? normalizeJobNumber(job.jobNumber) === normalizeJobNumber(parsedJobNumber) : false
  );

  return {
    linkedJob,
    persistedJob: linkedJob && isUuid(linkedJob.id) ? linkedJob : persistedByNumber,
    blockedJobLabel: requestedNumber || requestedJobId || parsedJobNumber || ""
  };
}

function mergePersistedJob(persisted: Job, local?: Job): Job {
  if (!local) return persisted;
  return {
    ...persisted,
    changeOrders: mergeById(persisted.changeOrders, local.changeOrders),
    purchaseOrders: mergeById(persisted.purchaseOrders, local.purchaseOrders),
    submittals: mergeById(persisted.submittals, local.submittals),
    files: mergeById(persisted.files, local.files),
    activity: mergeById(persisted.activity, local.activity)
  };
}

function remapJobReferences(job: Job, localId: string, persistedId: string): Job {
  return {
    ...job,
    id: persistedId,
    changeOrders: job.changeOrders.map((item) => ({ ...item, jobId: remapId(item.jobId, localId, persistedId) })),
    purchaseOrders: job.purchaseOrders.map((item) => ({ ...item, jobId: remapId(item.jobId, localId, persistedId) })),
    submittals: job.submittals.map((item) => ({ ...item, jobId: remapId(item.jobId, localId, persistedId) })),
    files: job.files.map((item) => ({
      ...item,
      ownerId: item.ownerType === "job" ? remapId(item.ownerId, localId, persistedId) : item.ownerId
    })),
    activity: job.activity.map((item) => ({
      ...item,
      ownerId: item.ownerType === "job" ? remapId(item.ownerId, localId, persistedId) : item.ownerId
    }))
  };
}

function mergeById<T extends { id: string }>(persisted: T[], local: T[]) {
  const persistedIds = new Set(persisted.map((item) => item.id));
  return [...persisted, ...local.filter((item) => !persistedIds.has(item.id))];
}

function remapId(value: string, localId: string, persistedId: string) {
  return value === localId ? persistedId : value;
}

function normalizeJobNumber(value: string) {
  return value.trim().toLowerCase();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
