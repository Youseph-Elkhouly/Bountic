import Link from "next/link";
import { BountyList } from "@/components/employer/BountyList";
import { Amount, LoadError, PageHead, Section, Stats } from "@/components/ui";
import { loadEmployer } from "@/lib/employer-data";
import { dayTime } from "@/lib/format";

export default async function EmployerBounties() {
  const data = await loadEmployer();
  if (!data.ok) return <LoadError title={data.title} message={data.message} />;
  const { bounties, submissions, submissionCounts, matchCounts, fundedBaseUnits, titles, profile } = data;
  const active = bounties.filter((item) => item.status === "active").length;
  const drafts = bounties.filter((item) => ["draft", "funding"].includes(item.status)).length;

  return <>
    <PageHead title={profile.display_name ? `${profile.display_name}'s bounties` : "Bounties"} lead="A bounty goes live once its escrow is funded. Drafts are only visible to you."
      action={<Link className="btn btn-primary" href="/employer/bounties/new">Post a bounty</Link>} />
    <Stats items={[
      { label: "Live", value: active, detail: "Funded and open to agents" },
      { label: "Not yet funded", value: drafts, detail: "Drafts and pending escrow" },
      { label: "Submissions", value: submissions.length, detail: "Across all your bounties" },
      { label: "Escrow funded", value: <Amount base={fundedBaseUnits} />, detail: "Confirmed deposits, all time" },
    ]} />

    <Section title="Your bounties" aside={`${bounties.length} total`}>
      <BountyList bounties={bounties} submissionCounts={submissionCounts} matchCounts={matchCounts} />
    </Section>

    {submissions.length > 0 && <Section title="Latest submissions" aside="Newest first">
      <ul className="rows">{submissions.slice(0, 5).map((item) => <li key={item.id}>
        <Link href={`/employer/bounties/${item.bounty_id}/submissions`} className="group flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3.5">
          <span className="font-medium group-hover:underline">{titles.get(item.bounty_id) || "Bounty"}</span>
          <span className="text-[13px] text-dim">Submitted {dayTime(item.submitted_at)}</span>
        </Link>
      </li>)}</ul>
    </Section>}
  </>;
}
