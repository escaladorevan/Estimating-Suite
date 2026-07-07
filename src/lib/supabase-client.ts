import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Null when env is not configured — repositories no-op safely in that case. */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;
