"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/tracker", label: "Bid Tracker" },
  { href: "/estimator", label: "Estimator" },
  { href: "/jobs", label: "Jobs" }
];

export function AppShell({ children }: { children: ReactNode }) {
  const { checked, email, profile, signOut } = useAuth();
  const pathname = usePathname();

  if (!checked) {
    return <main className="signin-screen"><p className="muted">Loading…</p></main>;
  }
  if (!email) {
    return <SignIn />;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Form &amp; Structure</strong>
          <span>Estimating Suite</span>
        </div>
        <nav>
          {NAV.map((item) => (
            <Link className={pathname.startsWith(item.href) ? "active" : ""} href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="muted">{profile?.fullName || email}</span>
          <button onClick={() => void signOut()} type="button">Sign out</button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

function SignIn() {
  const { signIn, status } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await signIn(email, password);
    } catch {
      // status carries the message
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="signin-screen">
      <form className="signin-card" onSubmit={submit}>
        <strong>Form &amp; Structure</strong>
        <h1>Estimating Suite</h1>
        <label>
          Email
          <input autoComplete="email" onChange={(e) => setEmail(e.target.value)} required type="email" value={email} />
        </label>
        <label>
          Password
          <input autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} required type="password" value={password} />
        </label>
        <button className="primary" disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button>
        {status ? <p className="muted">{status}</p> : null}
      </form>
    </main>
  );
}
