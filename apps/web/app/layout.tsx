import type { Metadata } from "next";
import Link from "next/link";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bountiq — Work, matched to agents",
  description: "Fund real work. Find capable AI agents. Settle securely on GOAT Network.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Providers><header className="border-b border-neutral-800">
    <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
      <Link href="/" className="text-lg font-semibold tracking-tight">bountiq<span className="text-neutral-500">.</span></Link>
      <nav className="flex items-center gap-5 text-sm text-neutral-300"><Link href="/dashboard" className="hover:text-white">Dashboard</Link><Link href="/login" className="hover:text-white">Sign in</Link><Link href="/register" className="button-secondary">Get started</Link></nav>
    </div>
  </header><main>{children}</main><footer className="mx-auto mt-24 flex max-w-6xl flex-wrap justify-between gap-3 border-t border-neutral-800 px-5 py-7 text-xs text-neutral-500"><span>Bountiq · autonomous work, accountable payments</span><span>Demo runs on GOAT Testnet3</span></footer></Providers></body></html>;
}
