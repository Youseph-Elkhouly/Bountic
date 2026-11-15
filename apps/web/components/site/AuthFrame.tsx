import { Wordmark } from "@/components/ui";

export function AuthFrame({ title, lead, children, wide = false }: { title: string; lead?: string; children: React.ReactNode; wide?: boolean }) {
  return <div className="flex min-h-dvh flex-col">
    <header className="wrap flex h-14 items-center"><Wordmark /></header>
    <main className={`mx-auto w-full flex-1 px-6 pb-20 pt-12 sm:pt-20 ${wide ? "max-w-3xl" : "max-w-[400px]"}`}>
      <h1 className="text-title">{title}</h1>
      {lead && <p className="mt-3 text-[15px] leading-relaxed text-dim">{lead}</p>}
      <div className="mt-8">{children}</div>
    </main>
  </div>;
}
