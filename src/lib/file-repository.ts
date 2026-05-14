import type { ProjectFile } from "@/types";
import { supabase } from "./supabase-client";

const PROJECT_FILES_BUCKET = "project-files";

export type ProjectFileRow = {
  id: string;
  owner_type: ProjectFile["ownerType"] | string;
  owner_id: string;
  slot: string;
  name: string;
  storage_bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | string | null;
  uploaded_at: string | null;
};

export type ProjectFileInsertInput = {
  ownerType: ProjectFile["ownerType"];
  ownerId: string;
  slot: string;
  name: string;
  storagePath?: string | null;
  storageBucket?: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

export type ProjectFileInsert = {
  owner_type: ProjectFile["ownerType"];
  owner_id: string;
  slot: string;
  name: string;
  storage_bucket: string;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
};

type SupabaseFileClient = {
  from: (table: "files") => any;
  storage?: {
    from: (bucket: string) => {
      upload: (path: string, file: any, options?: { upsert?: boolean; contentType?: string }) => Promise<{ data: unknown; error: unknown }>;
    };
  };
};

export function mapProjectFileFromRow(row: ProjectFileRow): ProjectFile {
  const bucket = row.storage_bucket ?? PROJECT_FILES_BUCKET;
  const storagePath = row.storage_path?.trim() ?? "";
  return {
    id: row.id,
    ownerType: normalizeOwnerType(row.owner_type),
    ownerId: row.owner_id,
    slot: row.slot,
    name: row.name,
    url: storagePath ? `${bucket}/${storagePath}` : undefined,
    uploadedAt: row.uploaded_at ?? ""
  };
}

export function mapProjectFileToInsert(input: ProjectFileInsertInput): ProjectFileInsert {
  if (!isUuid(input.ownerId)) {
    throw new Error("Project file metadata requires a persisted UUID owner id.");
  }

  return {
    owner_type: input.ownerType,
    owner_id: input.ownerId,
    slot: input.slot,
    name: input.name,
    storage_bucket: input.storageBucket ?? PROJECT_FILES_BUCKET,
    storage_path: input.storagePath ?? null,
    mime_type: input.mimeType ?? null,
    size_bytes: input.sizeBytes ?? null
  };
}

export function buildProjectFileStoragePath({
  ownerType,
  ownerId,
  slot,
  fileName
}: {
  ownerType: ProjectFile["ownerType"];
  ownerId: string;
  slot: string;
  fileName: string;
}) {
  return [slug(ownerType), ownerId, slug(slot), sanitizeFileName(fileName)].join("/");
}

export async function listProjectFiles(owner: Pick<ProjectFile, "ownerType" | "ownerId">, client: SupabaseFileClient | null = supabase) {
  if (!client) return [];
  const { data, error } = await client
    .from("files")
    .select("*")
    .eq("owner_type", owner.ownerType)
    .eq("owner_id", owner.ownerId)
    .order("uploaded_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapProjectFileFromRow);
}

export async function saveProjectFileMetadata(input: ProjectFileInsertInput, client: SupabaseFileClient | null = supabase) {
  if (!client) return null;
  const { data, error } = await client.from("files").insert(mapProjectFileToInsert(input)).select("*").single();

  if (error) throw error;
  return data ? mapProjectFileFromRow(data) : null;
}

export async function uploadProjectFile({
  file,
  ownerType,
  ownerId,
  slot,
  fileName,
  mimeType,
  client = supabase
}: {
  file: any;
  ownerType: ProjectFile["ownerType"];
  ownerId: string;
  slot: string;
  fileName: string;
  mimeType?: string;
  client?: SupabaseFileClient | null;
}) {
  if (!client?.storage) return null;
  const storagePath = buildProjectFileStoragePath({ ownerType, ownerId, slot, fileName });
  const { error } = await client.storage.from(PROJECT_FILES_BUCKET).upload(storagePath, file, {
    upsert: true,
    contentType: mimeType
  });

  if (error) throw error;
  return storagePath;
}

function normalizeOwnerType(value: ProjectFileRow["owner_type"]): ProjectFile["ownerType"] {
  const ownerTypes: ProjectFile["ownerType"][] = ["opportunity", "estimate", "job", "change_order", "submittal", "purchase_order"];
  return ownerTypes.includes(value as ProjectFile["ownerType"]) ? (value as ProjectFile["ownerType"]) : "job";
}

function slug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "file";
}

function sanitizeFileName(value: string) {
  const trimmed = value.trim();
  const dotIndex = trimmed.lastIndexOf(".");
  const base = dotIndex > 0 ? trimmed.slice(0, dotIndex) : trimmed;
  const extension = dotIndex > 0 ? trimmed.slice(dotIndex).replace(/[^.a-z0-9]/gi, "") : "";
  return `${slug(base)}${extension}` || "file";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
