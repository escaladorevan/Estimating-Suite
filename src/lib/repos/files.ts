import { supabase } from "../supabase-client";
import type { FileOwnerType, FileSlot, ProjectFile } from "../types";
import { isUuid } from "./opportunities";

const BUCKET = "project-files";

export type FileRow = {
  id: string;
  owner_type: string;
  owner_id: string;
  slot: string;
  name: string;
  storage_bucket: string;
  storage_path: string;
  size_bytes: number | null;
  mime_type: string | null;
  uploaded_by: string;
  uploaded_at: string;
};

export function mapFileFromRow(row: FileRow): ProjectFile {
  return {
    id: row.id,
    ownerType: row.owner_type as FileOwnerType,
    ownerId: row.owner_id,
    slot: row.slot as FileSlot,
    name: row.name,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    sizeBytes: row.size_bytes,
    mimeType: row.mime_type,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at
  };
}

export async function signFileUrl(file: ProjectFile, expiresInSeconds = 3600): Promise<ProjectFile> {
  if (!supabase || !file.storagePath) return file;
  const { data, error } = await supabase.storage
    .from(file.storageBucket || BUCKET)
    .createSignedUrl(file.storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) return file;
  return { ...file, url: data.signedUrl };
}

export async function listFiles(ownerType: FileOwnerType, ownerId: string): Promise<ProjectFile[]> {
  if (!supabase || !isUuid(ownerId)) return [];
  const { data, error } = await supabase
    .from("files")
    .select("*")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId);
  if (error) throw error;
  return Promise.all(((data ?? []) as FileRow[]).map(mapFileFromRow).map((file) => signFileUrl(file)));
}

export async function listAllFiles(): Promise<ProjectFile[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("files").select("*");
  if (error) throw error;
  return ((data ?? []) as FileRow[]).map(mapFileFromRow);
}

/**
 * Upload to Storage, then upsert the slot's metadata row (one file per slot —
 * re-uploading a slot replaces it, per the dashboard rule).
 */
export async function uploadSlotFile({
  ownerType,
  ownerId,
  slot,
  file,
  uploadedBy
}: {
  ownerType: FileOwnerType;
  ownerId: string;
  slot: FileSlot;
  file: File;
  uploadedBy: string;
}): Promise<ProjectFile | null> {
  if (!supabase || !isUuid(ownerId)) return null;

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const storagePath = `${ownerType}/${ownerId}/${slot}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { upsert: true, contentType: file.type || undefined });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("files")
    .upsert(
      {
        owner_type: ownerType,
        owner_id: ownerId,
        slot,
        name: file.name,
        storage_bucket: BUCKET,
        storage_path: storagePath,
        size_bytes: file.size,
        mime_type: file.type || null,
        uploaded_by: uploadedBy
      },
      { onConflict: "owner_type,owner_id,slot" }
    )
    .select("*")
    .single();
  if (error) {
    // Metadata failed — remove the orphaned upload so Storage stays consistent.
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw error;
  }
  return signFileUrl(mapFileFromRow(data as FileRow));
}

/** Copy an opportunity's slot files onto a job (award carry-over). Same storage objects, new rows. */
export async function carryFilesToJob(opportunityId: string, jobId: string, uploadedBy: string): Promise<number> {
  if (!supabase || !isUuid(opportunityId) || !isUuid(jobId)) return 0;
  const source = await listFiles("opportunity", opportunityId);
  let carried = 0;
  for (const file of source) {
    const { error } = await supabase.from("files").upsert(
      {
        owner_type: "job",
        owner_id: jobId,
        slot: file.slot,
        name: file.name,
        storage_bucket: file.storageBucket,
        storage_path: file.storagePath,
        size_bytes: file.sizeBytes,
        mime_type: file.mimeType,
        uploaded_by: uploadedBy
      },
      { onConflict: "owner_type,owner_id,slot" }
    );
    if (!error) carried += 1;
  }
  return carried;
}
