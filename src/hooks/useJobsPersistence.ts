"use client";

import { useCallback, useState } from "react";
import { saveEstimateHeader } from "@/lib/estimate-repository";
import { pruneProjectFileSlotMetadata, saveProjectFileMetadata, uploadProjectFile } from "@/lib/file-repository";
import { replaceJobDetail } from "@/lib/job-detail-data";
import { reconcilePersistedJobIdentity } from "@/lib/job-persistence-reconciliation";
import {
  deletePMNote,
  listJobDetail,
  listJobs,
  listPMNotes,
  saveActivityEvent,
  saveChangeOrder,
  saveJobHeader,
  savePMNote,
  savePurchaseOrder,
  saveSubmittal
} from "@/lib/job-repository";
import type { Dispatch, SetStateAction } from "react";
import type { ActivityEvent, ChangeOrder, Estimate, Job, PMNote, ProjectFile, PurchaseOrder, SubmittalPackage } from "@/types";

type UseJobsPersistenceInput = {
  detailJobId: string | null;
  estimates: Estimate[];
  jobs: Job[];
  pmNotes: PMNote[];
  selectedJobId: string;
  setDetailJobId: Dispatch<SetStateAction<string | null>>;
  setEstimates: Dispatch<SetStateAction<Estimate[]>>;
  setJobs: Dispatch<SetStateAction<Job[]>>;
  setPmNotes: Dispatch<SetStateAction<PMNote[]>>;
  setSelectedJobId: Dispatch<SetStateAction<string>>;
};

export function useJobsPersistence({
  detailJobId,
  estimates,
  jobs,
  pmNotes,
  selectedJobId,
  setDetailJobId,
  setEstimates,
  setJobs,
  setPmNotes,
  setSelectedJobId
}: UseJobsPersistenceInput) {
  const [jobPersistenceStatus, setJobPersistenceStatus] = useState("Jobs load on sign-in.");

  const loadPersistedJobs = useCallback(async (isMounted = true) => {
    try {
      const persisted = await listJobs();
      if (!isMounted) return;

      if (persisted.length) {
        const reconciled = reconcilePersistedJobIdentity({
          currentJobs: jobs,
          persistedJobs: persisted,
          estimates,
          pmNotes,
          selectedJobId,
          detailJobId
        });
        setJobs(reconciled.jobs);
        setEstimates(reconciled.estimates);
        setPmNotes((current) =>
          current.map((note) => ({
            ...note,
            jobId: note.jobId ? reconciled.localToPersistedJobIds.get(note.jobId) ?? note.jobId : note.jobId
          }))
        );
        setSelectedJobId(reconciled.selectedJobId);
        setDetailJobId(reconciled.detailJobId);
        setJobPersistenceStatus(`Loaded ${persisted.length} jobs from Supabase.`);
        return;
      }

      setJobPersistenceStatus("Supabase connected. Using sample jobs until real rows are added.");
    } catch {
      if (!isMounted) return;
      setJobPersistenceStatus("Local sample mode. Sign in before Supabase can read and save jobs.");
    }
  }, [detailJobId, estimates, jobs, pmNotes, selectedJobId, setDetailJobId, setEstimates, setJobs, setPmNotes, setSelectedJobId]);

  const loadPersistedPMNotes = useCallback(async (isMounted = true) => {
    try {
      const persisted = await listPMNotes();
      if (!isMounted) return;

      if (persisted.length) {
        setPmNotes(persisted);
      }
    } catch {
      if (!isMounted) return;
      setJobPersistenceStatus("Local sample mode. Sign in before Supabase can read and save PM notes.");
    }
  }, [setPmNotes]);

  const loadPersistedJobDetail = useCallback(async (jobId: string, isMounted = true) => {
    if (!isUuid(jobId)) return;
    try {
      const persisted = await listJobDetail(jobId);
      if (!isMounted || !persisted) return;

      setJobs((current) => replaceJobDetail(current, persisted));
      setSelectedJobId((current) => (current === jobId ? persisted.id : current));
      setDetailJobId((current) => (current === jobId ? persisted.id : current));
      setJobPersistenceStatus(`Loaded job detail for ${persisted.jobNumber} from Supabase.`);
    } catch {
      if (!isMounted) return;
      setJobPersistenceStatus("Job detail is showing local data. Supabase detail refresh failed.");
    }
  }, [setDetailJobId, setJobs, setSelectedJobId]);

  const persistJobHeader = useCallback(async (job: Job, forceCreate = false) => {
    if (!isUuid(job.id) && !forceCreate) return;
    const localId = job.id;
    setJobPersistenceStatus(`Saving job ${job.jobNumber}...`);

    try {
      const saved = await saveJobHeader(job);
      const reconciled = reconcilePersistedJobIdentity({
        currentJobs: jobs,
        persistedJobs: [saved],
        estimates,
        pmNotes,
        selectedJobId,
        detailJobId
      });
      setJobs(reconciled.jobs);
      setEstimates(reconciled.estimates);
      setPmNotes((current) =>
        current.map((note) => ({
          ...note,
          jobId: note.jobId ? reconciled.localToPersistedJobIds.get(note.jobId) ?? note.jobId : note.jobId
        }))
      );
      setSelectedJobId(reconciled.selectedJobId);
      setDetailJobId(reconciled.detailJobId);
      setJobPersistenceStatus(`Job ${saved.jobNumber} saved to Supabase.`);

      if (forceCreate && saved.opportunityId && isUuid(saved.id)) {
        const linked = estimates.find((estimate) => estimate.opportunityId === saved.opportunityId && !estimate.jobId);
        if (linked && isUuid(linked.id)) {
          const updated = { ...linked, jobId: saved.id };
          setEstimates((current) => current.map((estimate) => (estimate.id === linked.id ? updated : estimate)));
          void saveEstimateHeader(updated).catch(() => {});
        }
      }
    } catch {
      setJobPersistenceStatus(`Job save failed. ${job.jobNumber} is local only.`);
    }
  }, [detailJobId, estimates, jobs, pmNotes, selectedJobId, setDetailJobId, setEstimates, setJobs, setPmNotes, setSelectedJobId]);

  const persistChangeOrder = useCallback(async (co: ChangeOrder) => {
    const localId = co.id;
    setJobPersistenceStatus(`Saving CO ${co.number}...`);
    try {
      const saved = await saveChangeOrder(co);
      setJobs((current) =>
        current.map((job) =>
          job.id !== co.jobId
            ? job
            : { ...job, changeOrders: job.changeOrders.map((candidate) => (candidate.id === localId ? saved : candidate)) }
        )
      );
      setJobPersistenceStatus(`CO ${co.number} saved.`);
    } catch {
      setJobPersistenceStatus(`CO ${co.number} save failed - local only.`);
    }
  }, [setJobs]);

  const persistPurchaseOrder = useCallback(async (po: PurchaseOrder, activity?: ActivityEvent) => {
    const localId = po.id;
    setJobPersistenceStatus(`Saving PO ${po.poNumber}...`);
    try {
      const saved = await savePurchaseOrder(po);
      const remappedActivity = activity ? { ...activity, ownerId: saved.id } : null;
      let persistedActivity: ActivityEvent | null = null;
      let activityFailed = false;

      if (remappedActivity && isUuid(saved.id)) {
        try {
          persistedActivity = await saveActivityEvent(remappedActivity);
        } catch {
          activityFailed = true;
        }
      }

      setJobs((current) =>
        current.map((job) =>
          job.id !== po.jobId
            ? job
            : {
                ...job,
                purchaseOrders: job.purchaseOrders.map((candidate) => (candidate.id === localId ? saved : candidate)),
                activity: remappedActivity
                  ? job.activity.map((candidate) =>
                      candidate.id === remappedActivity.id ? persistedActivity ?? remappedActivity : candidate
                    )
                  : job.activity
              }
        )
      );
      setJobPersistenceStatus(activityFailed ? `PO ${po.poNumber} saved; activity is local only.` : `PO ${po.poNumber} saved.`);
    } catch {
      setJobPersistenceStatus(`PO ${po.poNumber} save failed - local only.`);
    }
  }, [setJobs]);

  const persistSubmittal = useCallback(async (submittal: SubmittalPackage) => {
    const localId = submittal.id;
    setJobPersistenceStatus(`Saving submittal ${submittal.name}...`);
    try {
      const saved = await saveSubmittal(submittal);
      setJobs((current) =>
        current.map((job) =>
          job.id !== submittal.jobId
            ? job
            : { ...job, submittals: job.submittals.map((candidate) => (candidate.id === localId ? saved : candidate)) }
        )
      );
      setJobPersistenceStatus(`Submittal ${submittal.name} saved.`);
    } catch {
      setJobPersistenceStatus(`Submittal ${submittal.name} save failed - local only.`);
    }
  }, [setJobs]);

  const persistPMNote = useCallback(async (note: PMNote) => {
    const normalizedNote = {
      ...note,
      jobId: normalizeUuid(note.jobId) ?? note.jobId
    };

    if (normalizedNote.jobId && !isUuid(normalizedNote.jobId)) {
      const blockedJob = jobs.find((job) => job.id === normalizedNote.jobId);
      const blockedLabel = blockedJob ? `${blockedJob.jobNumber} (${blockedJob.id})` : normalizedNote.jobId;
      setJobPersistenceStatus(`PM note saved locally. Job reference ${blockedLabel} is not a persisted Supabase UUID.`);
      return;
    }

    try {
      const saved = await savePMNote(normalizedNote);
      setPmNotes((current) => current.map((candidate) => (candidate.id === note.id ? saved : candidate)));
      setJobPersistenceStatus("PM note saved.");
    } catch (error) {
      setJobPersistenceStatus(`PM note save failed - local only. ${errorMessage(error)}`);
    }
  }, [jobs, setPmNotes]);

  const persistDeletePMNote = useCallback(async (note: PMNote) => {
    if (!isUuid(note.id)) {
      setJobPersistenceStatus("PM note removed locally.");
      return;
    }

    try {
      await deletePMNote(note.id);
      setJobPersistenceStatus("PM note deleted.");
    } catch (error) {
      setPmNotes((current) => [note, ...current]);
      setJobPersistenceStatus(`PM note delete failed. ${errorMessage(error)}`);
    }
  }, [setPmNotes]);

  const persistActivity = useCallback(async (event: ActivityEvent) => {
    if (!isUuid(event.ownerId)) return;

    try {
      const saved = await saveActivityEvent(event);
      setJobs((current) =>
        current.map((job) =>
          job.activity.some((candidate) => candidate.id === event.id)
            ? { ...job, activity: job.activity.map((candidate) => (candidate.id === event.id ? saved : candidate)) }
            : job
        )
      );
    } catch {
      setJobPersistenceStatus("Activity log save failed - local only.");
    }
  }, [setJobs]);

  const persistProjectFileAttachment = useCallback(async (
    localFile: ProjectFile,
    file: File,
    options: { replaceSlot?: boolean } = {}
  ) => {
    if (!isUuid(localFile.ownerId)) {
      setJobPersistenceStatus("File attached locally. Save the job item before storing files.");
      return;
    }

    setJobPersistenceStatus(`Uploading ${file.name}...`);

    try {
      const storagePath = await uploadProjectFile({
        file,
        ownerType: localFile.ownerType,
        ownerId: localFile.ownerId,
        slot: localFile.slot,
        fileName: file.name,
        mimeType: file.type
      });
      if (!storagePath) throw new Error("Upload did not return a storage path.");

      const saved = await saveProjectFileMetadata({
        ownerType: localFile.ownerType,
        ownerId: localFile.ownerId,
        slot: localFile.slot,
        name: file.name,
        storagePath,
        mimeType: file.type || null,
        sizeBytes: file.size
      });

      if (saved) {
        if (options.replaceSlot) {
          await pruneProjectFileSlotMetadata({
            ownerType: localFile.ownerType,
            ownerId: localFile.ownerId,
            slot: localFile.slot,
            keepId: saved.id
          });
        }
        setJobs((current) =>
          current.map((job) =>
            job.files.some((candidate) => candidate.id === localFile.id)
              ? { ...job, files: job.files.map((candidate) => (candidate.id === localFile.id ? saved : candidate)) }
              : job
          )
        );
      }
      setJobPersistenceStatus(saved ? `Stored ${file.name} in Supabase Storage.` : `Uploaded ${file.name}; metadata is local only.`);
    } catch (error) {
      setJobPersistenceStatus(`File attached locally only. ${errorMessage(error)}`);
    }
  }, [setJobs]);

  return {
    jobPersistenceStatus,
    loadPersistedJobDetail,
    loadPersistedJobs,
    loadPersistedPMNotes,
    persistActivity,
    persistChangeOrder,
    persistJobHeader,
    persistDeletePMNote,
    persistPMNote,
    persistProjectFileAttachment,
    persistPurchaseOrder,
    persistSubmittal,
    setJobPersistenceStatus
  };
}

function normalizeUuid(value?: string) {
  const trimmed = value?.trim() ?? "";
  return isUuid(trimmed) ? trimmed : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") return error.message;
  return "Unknown Supabase error.";
}
