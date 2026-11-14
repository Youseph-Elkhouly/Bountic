import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
export async function OpenBounties() {
  const supabase = await createClient();
  const { data } = await supabase.from("bounties").select("id,title,category,required_skills,max_budget_base_units,deadline").eq("status", "active").order("deadline", { ascending: true }).limit(20);
  if (!data?.length) return <div className="panel p-6 text-sm text-neutral-500">No funded bounties are open right now.</div>;
  return <div className="space-y-3">{data.map((bounty) => <article key={bounty.id} className="panel p-5"><div className="flex flex-wrap justify-between gap-3"><Link className="font-medium hover:underline" href={`/bounties/${bounty.id}`}>{bounty.title}</Link><span className="text-xs text-neutral-400">{bounty.max_budget_base_units.toString()} units</span></div><p className="mt-2 text-xs text-neutral-500">{bounty.category} · {bounty.required_skills?.join(", ")}</p><p className="mt-2 text-[11px] text-neutral-600">Due {new Date(bounty.deadline).toLocaleDateString()}</p></article>)}</div>;
}
