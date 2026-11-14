import { createClient } from "@/lib/supabase/browser";

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) throw new Error("Set NEXT_PUBLIC_API_URL in apps/web/.env.local.");
  const response = await fetch(new URL(path, base), {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...init.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload as T;
}

export async function apiUpload<T>(path: string, body: FormData): Promise<T> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) throw new Error("Set NEXT_PUBLIC_API_URL in apps/web/.env.local.");
  const response = await fetch(new URL(path, base), { method: "POST", body, headers: { authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Upload failed (${response.status})`);
  return payload as T;
}
