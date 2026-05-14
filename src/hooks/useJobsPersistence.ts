"use client";

import { useCallback, useState } from "react";
import { saveEstimateHeader } from "@/lib/estimate-repository";
import { pruneProjectFileSlotMetadata, saveProjectFileMetadata, uploadProjectFile } from "@/lib/file-repository";
import {
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
  estimates: Estimate[];
  setDetailJobId: Dispatch<SetStateAction<string | null>>;
  setEstimates: Dispatch<SetStateAction<Estimate[]>>;
  setJobs: Dispatch<SetStateAction<Job[]>>;
  setPmNotes: Dispatch<SetStateAction<PMNote[]>>;
  setSelectedJobId: Dispatch<SetStateAction<string>>;
};

export function useJobsPersistence({
  estimates,
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
        setJobs((current) => {
          const byNumber = new Map(persisted.map((job) => [job.jobNumber, job]));
          const localOnly = current.filter((job) => !byNumber.has(job.jobNumber));
          return [...persisted, ...localOnly];
        });
        setJobPersistenceStatus(`Loaded ${persisted.length} jobs from Supabase.`);
        return;
      }

      setJobPersistenceStatus("Supabase connected. Using sample jobs until real rows are added.");
    } catch {
      if (!isMounted) return;
      setJobPersistenceStatus("Local sample mode. Sign in before Supabase can read and save jobs.");
    }
  }, [setJobs]);

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

  const persistJobHeader = useCallback(async (job: Job, forceCreate = false) => {
    if (!isUuid(job.id) && !forceCreate) return;
    const localId = job.id;
    setJobPersistenceStatus(`Saving job ${job.jobNumber}...`);

    try {
      const saved = await saveJobHeader(job);
      setJobs((current) =>
        current.map((candidate) =>
          candidate.id === localId || candidate.jobNumber === saved.jobNumber ? saved : candidate
        )
      );
      setSelectedJobId((current) => (current === localId ? saved.id : current));
      setDetailJobId((current) => (current === localId ? saved.id : current));
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
  }, [estimates, setDetailJobId, setEstimates, setJobs, setSelectedJobId]);

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

  const persistPurchaseOrder = useCallback(async (po: PurchaseOrder) => {
    const localId = po.id;
    setJobPersistenceStatus(`Saving PO ${po.poNumber}...`);
    try {
      const saved = await savePurchaseOrder(po);
      setJobs((current) =>
        current.map((job) =>
          job.id !== po.jobId
            ? job
            : { ...job, purchaseOrders: job.purchaseOrders.map((candidate) => (candidate.id === localId ? saved : candidate)) }
        )
      );
      setJobPersistenceStatus(`PO ${po.poNumber} saved.`);
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
    if (note.jobId && !isUuid(note.jobId)) {
      setJobPersistenceStatus("PM note saved locally. Link it to a persisted job before saving the job reference.");
      return;
    }

    try {
      const saved = await savePMNote(note);
      setPmNotes((current) => current.map((candidate) => (candidate.id === note.id ? saved : candidate)));
      setJobPersistenceStatus("PM note saved.");
    } catch {
      setJobPersistenceStatus("PM note save failed - local only.");
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
    } catch {
      setJobPersistenceStatus("File attached locally only. Supabase Storage is waiting on sign-in or persisted owner id.");
    }
  }, [setJobs]);

  return {
    jobPersistenceStatus,
    loadPersistedJobs,
    loadPersistedPMNotes,
    persistActivity,
    persistChangeOrder,
    persistJobHeader,
    persistPMNote,
    persistProjectFileAttachment,
    persistPurchaseOrder,
    persistSubmittal,
    setJobPersistenceStatus
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}
