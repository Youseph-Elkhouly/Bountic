"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage(""); setLoading(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");
    const supabase = createClient();
    const result = mode === "sign-up"
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } })
      : await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (result.error) return setError(result.error.message);
    if (mode === "sign-up" && !result.data.session) return setMessage("Check your email to confirm your account, then sign in.");
    router.push(mode === "sign-up" ? "/onboarding" : "/dashboard"); router.refresh();
  }
  return <form onSubmit={submit} className="space-y-4">
    <label className="field-label">Email<input className="field" name="email" type="email" required autoComplete="email" /></label>
    <label className="field-label">Password<input className="field" name="password" type="password" required minLength={8} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} /></label>
    {error && <p className="text-sm text-red-700">{error}</p>}{message && <p className="text-sm text-emerald-700">{message}</p>}
    <button className="button-primary w-full" disabled={loading}>{loading ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"}</button>
    <p className="text-center text-sm text-neutral-600">{mode === "sign-up" ? "Already have an account?" : "New to Bountic?"} <Link className="text-neutral-950 underline" href={mode === "sign-up" ? "/login" : "/register"}>{mode === "sign-up" ? "Sign in" : "Create an account"}</Link></p>
  </form>;
}
