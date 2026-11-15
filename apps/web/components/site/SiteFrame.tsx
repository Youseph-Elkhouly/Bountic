import Link from "next/link";
import { Wordmark } from "@/components/ui";

/** Header and footer for the public pages. The two platforms have their own shell. */
export function SiteFrame({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col">
    <header className="sticky top-0 z-10 border-b border-rule bg-paper/90 backdrop-blur">
      <div className="wrap flex h-14 items-center justify-between gap-4">
        <Wordmark />
        <nav aria-label="Main" className="flex items-center gap-1 text-[13px] sm:gap-2">
          <Link href="/hire" className="px-2 py-1.5 text-dim hover:text-ink max-[480px]:hidden">Employers</Link>
          <Link href="/earn" className="px-2 py-1.5 text-dim hover:text-ink max-[480px]:hidden">Developers</Link>
          <Link href="/login" className="px-2 py-1.5 text-dim hover:text-ink">Sign in</Link>
          <Link href="/register" className="btn btn-primary ml-1 h-8">Create account</Link>
        </nav>
      </div>
    </header>
    <main className="flex-1">{children}</main>
    <footer className="border-t border-rule">
      <div className="wrap flex flex-wrap items-center justify-between gap-x-8 gap-y-3 py-6 text-[13px] text-dim">
        <span className="flex items-center gap-2"><span aria-hidden="true" className="size-1.5 rounded-full bg-sat" />Running on GOAT Testnet3, chain <span className="num">48816</span></span>
        <nav aria-label="Footer" className="flex gap-5">
          <Link href="/hire" className="hover:text-ink">Employers</Link>
          <Link href="/earn" className="hover:text-ink">Developers</Link>
          <a href="https://explorer.testnet3.goat.network" target="_blank" rel="noreferrer noopener" className="hover:text-ink">Explorer</a>
        </nav>
      </div>
    </footer>
  </div>;
}

/** The bounty lifecycle, using the same state names the product shows. */
export function Lifecycle({ steps }: { steps: { state: string; who: string; text: string }[] }) {
  return <ol className="rows">
    {steps.map((step, index) => <li key={step.state} className="grid grid-cols-[2.5rem_1fr] gap-x-4 gap-y-1 py-5 sm:grid-cols-[2.5rem_11rem_7rem_1fr] sm:items-baseline">
      <span className="num text-[13px] text-faint">{String(index + 1).padStart(2, "0")}</span>
      <span className="text-[22px] font-semibold leading-tight tracking-[-0.04em] sm:text-[26px]">{step.state}</span>
      <span className="col-start-2 text-[13px] text-dim sm:col-start-auto">{step.who}</span>
      <span className="col-start-2 max-w-xl text-[15px] leading-relaxed sm:col-start-auto">{step.text}</span>
    </li>)}
  </ol>;
}

export function Points({ items }: { items: { title: string; text: string }[] }) {
  return <dl className="grid border-t border-rule sm:grid-cols-2">
    {items.map((item, index) => <div key={item.title} className={`border-b border-rule py-7 ${index % 2 ? "sm:border-l sm:pl-8" : "sm:pr-8"}`}>
      <dt className="text-[17px] font-semibold tracking-[-0.02em]">{item.title}</dt>
      <dd className="mt-2 max-w-md text-[15px] leading-relaxed text-dim">{item.text}</dd>
    </div>)}
  </dl>;
}
