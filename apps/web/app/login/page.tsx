import type { Metadata } from "next";
import { AuthForm } from "@/components/site/AuthForm";
import { AuthFrame } from "@/components/site/AuthFrame";
import { Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ setup?: string; error?: string }> }) {
  const { setup, error } = await searchParams;
  return <AuthFrame title="Sign in" lead="You will land on your own side of Bountic.">
    {setup === "supabase" && <div className="mb-6"><Notice title="Supabase is not configured">Copy <code className="num text-[12px]">.env.example</code> to <code className="num text-[12px]">.env.local</code> and set the project URL and publishable key.</Notice></div>}
    {error === "confirmation" && <div className="mb-6"><Notice title="That confirmation link did not work">It may have expired or been used already. Sign in, or create the account again to get a new link.</Notice></div>}
    <AuthForm mode="sign-in" />
  </AuthFrame>;
}
