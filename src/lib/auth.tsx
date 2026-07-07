"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase-client";
import type { Profile, Role } from "./types";

type AuthState = {
  checked: boolean;
  email: string;
  profile: Profile | null;
  status: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function fetchProfile(): Promise<Profile | null> {
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;
  const { data } = await supabase.from("app_user_profiles").select("*").eq("id", userId).maybeSingle();
  if (!data) return null;
  return { id: data.id, fullName: data.full_name, role: data.role as Role, active: data.active };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [checked, setChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!supabase) {
      setStatus("Supabase env is not configured.");
      setChecked(true);
      return;
    }
    let isMounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) return;
      const sessionEmail = data.session?.user.email ?? "";
      setEmail(sessionEmail);
      if (sessionEmail) setProfile(await fetchProfile());
      setChecked(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const sessionEmail = session?.user.email ?? "";
      setEmail(sessionEmail);
      setProfile(sessionEmail ? await fetchProfile() : null);
    });

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (signInEmail: string, password: string) => {
    if (!supabase) throw new Error("Supabase env is not configured.");
    setStatus("Signing in...");
    const { error } = await supabase.auth.signInWithPassword({ email: signInEmail, password });
    if (error) {
      setStatus(error.message);
      throw error;
    }
    setStatus("");
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setEmail("");
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider value={{ checked, email, profile, status, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
