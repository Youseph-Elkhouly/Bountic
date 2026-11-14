"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
export function SignOut() { const router = useRouter(); return <button className="text-sm text-neutral-400 hover:text-white" onClick={async () => { await createClient().auth.signOut(); router.push("/"); router.refresh(); }}>Sign out</button>; }
