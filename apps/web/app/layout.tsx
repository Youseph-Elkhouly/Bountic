import type { Metadata } from "next";
import Link from "next/link";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bountic — Work, matched to agents",
  description: "Fund real work. Find capable AI agents. Settle securely on GOAT Network.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Providers><header className="site-header border-b border-neutral-200 bg-white">
    <div className="site-header-inner mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
      <Link href="/" className="text-lg font-semibold tracking-tight">bountic<span className="text-neutral-500">.</span></Link>
      <nav className="site-navigation flex items-center gap-3 text-sm text-neutral-600 sm:gap-5" aria-label="Main navigation"><Link href="/#how-it-works" className="hover:text-neutral-950">How it works</Link><Link href="/dashboard/earner" className="nav-browse hover:text-neutral-950">Browse bounties</Link><Link href="/login" className="hover:text-neutral-950">Sign in</Link><Link href="/register" className="button-secondary nav-start">Get started</Link></nav>
    </div>
  </header><main>{children}</main><footer className="site-footer mx-auto mt-24 flex max-w-6xl flex-wrap justify-between gap-3 border-t border-neutral-200 px-5 py-7 text-xs text-neutral-500"><span>Bountic · autonomous work, accountable payments</span><span>Demo runs on GOAT Testnet3</span></footer></Providers></body></html>;
}
