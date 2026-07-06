/**
 * Live V1 lifecycle smoke test — runs against the REAL Supabase project.
 *
 * Not part of `npm test` (which is scoped to src/lib). Run explicitly:
 *
 *   set -a; . ./.env.local; set +a
 *   SMOKE_EMAIL=... SMOKE_PASSWORD=... npx vitest run --dir scripts --globals --environment node
 *
 * Exercises the V1 critical path with real auth + RLS + Storage:
 *   sign in → create opportunity → upload file + metadata → award to job
 *   → carry file/contact/activity → reload everything → clean up.
 */
import { afterAll, describe, expect, it } from "vitest";
import { supabase } from "../src/lib/supabase-client";
import { listOpportunities, saveOpportunity } from "../src/lib/opportunity-repository";
import { saveProjectFileMetadata, uploadProjectFile, listProjectFiles } from "../src/lib/file-repository";
import { listJobs, saveJobHeader, saveActivityEvent, listJobDetail } from "../src/lib/job-repository";
import { saveContact, persistCarriedJobContacts } from "../src/lib/contact-repository";
import { buildAwardedOpportunityJob } from "../src/lib/opportunity-workflow";
import type { Opportunity } from "../src/types";

const marker = `Smoke Lifecycle ${new Date().toISOString().replace(/[:.]/g, "-")}`;
const today = new Date().toISOString().slice(0, 10);

const cleanup: { table: string; id: string }[] = [];
const storageCleanup: string[] = [];

function makeOpportunity(): Opportunity {
  return {
    id: `opp-smoke-${Date.now()}`,
    jobId: "Q-99-990",
    bidRefNumber: "Q-99-990",
    month: "July",
    client: "Smoke GC",
    projectName: marker,
    bidDueDate: today,
    drawingStage: "IFC",
    bidType: "Competitive",
    submissionMethod: "Email",
    status: "Lead / ITB",
    winLoss: "",
    estimatedValue: 12345,
    jobType: "Commercial",
    ntpReceived: false,
    notes: "smoke test row — safe to delete",
    bidFeedback: "",
    links: {},
    files: [],
    contacts: []
  } as unknown as Opportunity;
}

describe("V1 lifecycle against live Supabase", () => {
  it("signs in with the smoke test user", async () => {
    expect(supabase, "supabase client must be configured via env").toBeTruthy();
    const email = process.env.SMOKE_EMAIL;
    const password = process.env.SMOKE_PASSWORD;
    expect(email && password, "SMOKE_EMAIL / SMOKE_PASSWORD must be set").toBeTruthy();
    const { data, error } = await supabase!.auth.signInWithPassword({ email: email!, password: password! });
    expect(error).toBeNull();
    expect(data.session).toBeTruthy();
  });

  let persistedOpp: Opportunity;
  let storagePath: string;
  let persistedJobId: string;

  it("creates and persists an opportunity (ITB intake)", async () => {
    persistedOpp = await saveOpportunity(makeOpportunity());
    expect(persistedOpp.id).toMatch(/^[0-9a-f-]{36}$/);
    cleanup.push({ table: "opportunities", id: persistedOpp.id });
  });

  it("uploads a file to Storage and persists metadata (planset slot)", async () => {
    const file = new File([`smoke storage proof ${marker}`], "smoke-storage-proof.txt", { type: "text/plain" });
    const path = await uploadProjectFile({
      file,
      ownerType: "opportunity",
      ownerId: persistedOpp.id,
      slot: "drawings",
      fileName: "smoke-storage-proof.txt",
      mimeType: "text/plain"
    });
    expect(path, "upload must return a storage path").toBeTruthy();
    storagePath = path!;
    storageCleanup.push(storagePath);

    const saved = await saveProjectFileMetadata({
      ownerType: "opportunity",
      ownerId: persistedOpp.id,
      slot: "drawings",
      name: "smoke-storage-proof.txt",
      storagePath,
      mimeType: "text/plain",
      sizeBytes: 40
    });
    expect(saved).toBeTruthy();
    expect(saved!.storagePath).toBe(storagePath);
    cleanup.push({ table: "files", id: saved!.id });
    persistedOpp = { ...persistedOpp, files: [saved!] };
  });

  it("awards the opportunity to a job with file + contact carry-over", async () => {
    const contact = await saveContact({
      id: `cnt-smoke-${Date.now()}`,
      name: `Smoke Contact ${marker}`,
      title: "PM",
      tags: [],
      active: true
    });
    expect(contact.id).toMatch(/^[0-9a-f-]{36}$/);
    cleanup.push({ table: "contacts", id: contact.id });
    persistedOpp = {
      ...persistedOpp,
      contacts: [{ id: `oc-smoke`, contactId: contact.id, contact, role: "PM" }]
    };

    const { awardedOpportunity, job } = buildAwardedOpportunityJob({
      activityId: "act-smoke",
      award: { pm: "Smoke PM", jobNumber: "S99-999", contractValue: 12345, ntpDate: today },
      jobId: `job-smoke-${Date.now()}`,
      makeContactId: () => `jc-smoke-${Math.random().toString(16).slice(2)}`,
      opportunity: persistedOpp,
      today
    });

    await saveOpportunity(awardedOpportunity);

    // Same sequence persistJobHeader(forceCreate) runs:
    const savedJob = await saveJobHeader(job);
    expect(savedJob.id).toMatch(/^[0-9a-f-]{36}$/);
    persistedJobId = savedJob.id;
    cleanup.push({ table: "jobs", id: savedJob.id });

    const remaps = await persistCarriedJobContacts(savedJob.id, job.contacts ?? []);
    expect(remaps.size).toBe(1);
    for (const joinId of remaps.values()) cleanup.push({ table: "job_contacts", id: joinId });

    for (const f of job.files) {
      expect(f.storagePath, "carried file must keep its storage path").toBeTruthy();
      const savedFile = await saveProjectFileMetadata({
        ownerType: "job",
        ownerId: savedJob.id,
        slot: f.slot,
        name: f.name,
        storageBucket: f.storageBucket,
        storagePath: f.storagePath
      });
      expect(savedFile).toBeTruthy();
      cleanup.push({ table: "files", id: savedFile!.id });
    }

    const activity = await saveActivityEvent({
      id: "act-smoke-local",
      ownerType: "job",
      ownerId: savedJob.id,
      author: "Smoke",
      message: `Handoff smoke check ${marker}`,
      createdAt: today
    });
    expect(activity.id).toMatch(/^[0-9a-f-]{36}$/);
    cleanup.push({ table: "activity_events", id: activity.id });
  });

  it("reloads the whole lifecycle from Supabase (the refresh test)", async () => {
    const opps = await listOpportunities();
    const reloadedOpp = opps.find((o) => o.projectName === marker);
    expect(reloadedOpp, "opportunity must reload").toBeTruthy();
    expect(reloadedOpp!.status).toBe("Won");
    expect(reloadedOpp!.files?.some((f) => f.name === "smoke-storage-proof.txt"), "opportunity file must reload").toBe(true);
    expect(reloadedOpp!.files?.[0]?.url, "reloaded file must carry a signed URL").toBeTruthy();

    const jobs = await listJobs();
    const reloadedJob = jobs.find((j) => j.id === persistedJobId);
    expect(reloadedJob, "job must reload").toBeTruthy();
    expect(reloadedJob!.baseContract).toBe(12345);

    const detail = await listJobDetail(persistedJobId);
    expect(detail, "job detail must load").toBeTruthy();
    expect((detail!.files ?? []).some((f) => f.name === "smoke-storage-proof.txt"), "carried job file must reload").toBe(true);
    expect((detail!.contacts ?? []).length, "carried contact must reload").toBeGreaterThan(0);
    expect((detail!.activity ?? []).some((a) => a.message.includes("Handoff smoke check")), "activity must reload").toBe(true);

    const files = await listProjectFiles({ ownerType: "opportunity", ownerId: persistedOpp.id });
    expect(files.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    if (!supabase) return;
    for (const path of storageCleanup) {
      await supabase.storage.from("project-files").remove([path]).catch(() => {});
    }
    // Delete in FK-safe order: children first.
    const order = ["activity_events", "job_contacts", "files", "jobs", "contacts", "opportunities"];
    for (const table of order) {
      for (const row of cleanup.filter((c) => c.table === table)) {
        await supabase.from(table).delete().eq("id", row.id);
      }
    }
    await supabase.auth.signOut();
  });
});
