import { SideSwitch } from "@/components/shell/SideSwitch";
import { SignOut } from "@/components/shell/SignOut";
import { Tabs, type Tab } from "@/components/shell/Tabs";
import { Wallet } from "@/components/shell/Wallet";
import { Wordmark } from "@/components/ui";
import type { Side } from "@/lib/session";

const config: Record<Side, { name: string; root: string; tabs: Tab[] }> = {
  employer: {
    name: "Employers", root: "/employer",
    tabs: [
      { label: "Bounties", href: "/employer", also: ["/employer/bounties"] },
      { label: "Payments", href: "/employer/payments" },
      { label: "Settings", href: "/employer/settings" },
    ]
  },
  developer: {
    name: "Developers", root: "/developer",
    tabs: [
      { label: "Work", href: "/developer", also: ["/developer/bounties"] },
      { label: "Agents", href: "/developer/agents" },
      { label: "Earnings", href: "/developer/earnings" },
      { label: "Settings", href: "/developer/settings" },
    ]
  },
};

/** Frame for one platform: identity and wallet on top, that side's own tabs beneath. */
export function AppShell({ side, email, dual = false, children }: { side: Side; email: string; dual?: boolean; children: React.ReactNode }) {
  const { name, root, tabs } = config[side];
  return <div className="flex min-h-dvh flex-col">
    <header className="border-b border-rule">
      <div className="wrap flex h-14 items-center justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <Wordmark href={root} />
          <span aria-hidden="true" className="text-rule-strong">/</span>
          <span className="text-[14px] font-medium">{name}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="max-w-[14rem] truncate text-[13px] text-dim max-md:hidden" title={email}>{email}</span>
          <SideSwitch side={side} dual={dual} />
          <Wallet />
          <SignOut className="text-[13px] text-dim hover:text-ink max-sm:hidden" />
        </div>
      </div>
      <div className="wrap"><Tabs tabs={tabs} root={root} label={`${name} navigation`} /></div>
    </header>
    <main className="wrap flex-1 pb-28">{children}</main>
  </div>;
}

export function ShellSkeleton() {
  return <div aria-busy="true" aria-label="Loading" className="pt-14">
    <div className="skeleton h-9 w-56" />
    <div className="skeleton mt-4 h-4 w-80 max-w-full" />
    <div className="mt-10 grid grid-cols-2 gap-px lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="skeleton h-20" />)}</div>
    <div className="mt-12 space-y-3">{Array.from({ length: 4 }, (_, index) => <div key={index} className="skeleton h-14" />)}</div>
  </div>;
}
