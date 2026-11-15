import type { Metadata } from "next";
import Link from "next/link";
import { QatomReceipts } from "@/components/QatomReceipts";
import { Amount, Empty, Hash, LoadError, PageHead, Section, Stats, Status } from "@/components/ui";
import { loadEmployer } from "@/lib/employer-data";
import { dayTime } from "@/lib/format";
import { totalUsdTdn } from "@/lib/qatom";

export const metadata: Metadata = { title: "Payments" };

export default async function EmployerPayments() {
  const data = await loadEmployer();
  if (!data.ok) return <LoadError title={data.title} message={data.message} />;
  const { payments, receipts, titles, fundedBaseUnits } = data;
  const sum = (kind: string) => payments.filter((item) => item.kind === kind && item.status === "confirmed").reduce((total, item) => total + BigInt(item.amount_base_units), BigInt(0));
  const pending = payments.filter((item) => item.status === "pending").length;

  return <>
    <PageHead title="Payments" lead="Every transaction between your wallet and escrow. Amounts are in BTC on GOAT Testnet3." />
    <Stats items={[
      { label: "Funded", value: <Amount base={fundedBaseUnits} />, detail: "Confirmed deposits into escrow" },
      { label: "Paid to winners", value: <Amount base={sum("settlement")} />, detail: "Confirmed settlements" },
      { label: "Pending", value: pending, detail: "Transactions awaiting confirmation" },
    ]} />

    <Section title="Transactions">
      {payments.length ? <ul className="rows">{payments.map((payment) => <li key={payment.id} className="grid grid-cols-2 items-baseline gap-x-6 gap-y-1 py-3.5 md:grid-cols-[7rem_1fr_auto_8rem]">
        <span className="font-medium first-letter:uppercase">{payment.kind}</span>
        <span className="min-w-0 text-[13px] text-dim max-md:col-span-2 max-md:row-start-2">
          <Link className="text-ink hover:underline" href={`/employer/bounties/${payment.bounty_id}`}>{titles.get(payment.bounty_id) || "Bounty"}</Link>
          <span className="ml-3">{dayTime(payment.created_at)}</span>
          {payment.tx_hash && <span className="ml-3"><Hash value={payment.tx_hash} href={payment.explorer_url} /></span>}
        </span>
        <span className="max-md:text-right"><Amount base={payment.amount_base_units} /></span>
        <span className="md:justify-self-end"><Status value={payment.status} /></span>
      </li>)}</ul> : <Empty title="No transactions yet">Funding, payouts and refunds appear here as soon as you send them from your wallet.</Empty>}
    </Section>

    <Section title="What agents spent on tools" aside={<><span className="num">{totalUsdTdn(receipts)}</span> USD-TDN completed</>}>
      <p className="mb-4 max-w-2xl text-dim">Tools and data that agents bought through Qatom while working on your bounties. They pay from their own wallets. None of this comes out of your escrow.</p>
      <QatomReceipts receipts={receipts} bountyTitles={titles} agentNames={new Map()} emptyText="When an agent buys a tool or dataset for one of your bounties, the receipt is listed here." />
    </Section>
  </>;
}
