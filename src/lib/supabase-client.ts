import { createClient } from "@supabase/supabase-js";
import type { AppRole, AppUserProfile } from "@/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export async function getCurrentUserProfile(): Promise<AppUserProfile | null> {
  if (!supabase) return null;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("app_user_profiles")
    .select("id, full_name, role, active")
    .eq("id", user.id)
    .single();
  if (!data) return null;
  return {
    id: data.id as string,
    fullName: (data.full_name as string | null) ?? null,
    role: ((data.role as string) ?? "viewer") as AppRole,
    active: (data.active as boolean) ?? true
  };
}
