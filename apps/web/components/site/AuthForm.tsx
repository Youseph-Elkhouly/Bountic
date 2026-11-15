"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Notice } from "@/components/ui";

/** Remembers which side a visitor signed up for, so onboarding can preselect it. */
export const INTENT_KEY = "bountic.side";

export function AuthForm({ mode, intent }: { mode: "sign-in" | "sign-up"; intent?: "employer" | "developer" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage(""); setLoading(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");
    try {
      if (intent) { try { window.localStorage.setItem(INTENT_KEY, intent); } catch { /* storage unavailable */ } }
      const supabase = createClient();
      const result = mode === "sign-up"
        ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) { setError(result.error.message); return; }
      if (mode === "sign-up" && !result.data.session) { setMessage("Check your email to confirm your account, then sign in."); return; }
      router.push(mode === "sign-up" ? "/onboarding" : "/dashboard"); router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not reach the sign-in service.");
    } finally { setLoading(false); }
  }

  const other = mode === "sign-up" ? { href: "/login", text: "Sign in", ask: "Already have an account?" } : { href: "/register", text: "Create an account", ask: "New to Bountic?" };
  return <form onSubmit={submit} className="space-y-5">
    <label className="label">Email<input className="field" name="email" type="email" required autoComplete="email" /></label>
    <label className="label">Password<input className="field" name="password" type="password" required minLength={8} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} />{mode === "sign-up" && <span className="hint">At least 8 characters.</span>}</label>
    {error && <Notice>{error}</Notice>}
    {message && <Notice tone="ok">{message}</Notice>}
    <button className="btn btn-primary btn-lg w-full" disabled={loading}>{loading ? "Working…" : mode === "sign-up" ? "Create account" : "Sign in"}</button>
    <p className="text-[13px] text-dim">{other.ask} <Link className="link text-ink" href={other.href}>{other.text}</Link></p>
  </form>;
}
