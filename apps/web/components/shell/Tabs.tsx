"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type Tab = { label: string; href: string; /** Path prefixes that also belong to this tab. */ also?: string[] };

export function Tabs({ tabs, root, label }: { tabs: Tab[]; root: string; label: string }) {
  const pathname = usePathname();
  const active = (tab: Tab) => tab.href === root
    ? pathname === root || (tab.also || []).some((prefix) => pathname.startsWith(prefix))
    : pathname.startsWith(tab.href) || (tab.also || []).some((prefix) => pathname.startsWith(prefix));
  return <nav aria-label={label} className="-mb-px flex gap-5 overflow-x-auto">
    {tabs.map((tab) => {
      const on = active(tab);
      return <Link key={tab.href} href={tab.href} aria-current={on ? "page" : undefined} className={`whitespace-nowrap border-b-2 py-3 text-[14px] transition-colors ${on ? "border-ink text-ink" : "border-transparent text-dim hover:text-ink"}`}>{tab.label}</Link>;
    })}
  </nav>;
}
