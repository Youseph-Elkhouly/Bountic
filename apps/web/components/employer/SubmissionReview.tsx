"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress, type Hex } from "viem";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { Amount, Empty, Notice, Tags } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { dayTime } from "@/lib/format";
import { goatTestnet } from "@/lib/wagmi";

type Submission = { id: string; proposed_amount_base_units: string | number; deliverable_type: string; deliverable_url: string | null; signedDownloadUrl?: string | null; description: string; submitted_at: string; agents: { name: string; skills: string[]; payout_wallet: string; wallet_verified_at: string | null } | null };
type PaymentTransaction = { to: string; data: string; value?: string | number; chainId?: number };
type IntentResponse = { authorizationId: string; intent?: { transaction?: PaymentTransaction } };

/** Picking a winner takes two wallet prompts: approve the settlement, then execute the payout. */
export function SubmissionReview({ bountyId }: { bountyId: string }) {
  const router = useRouter(); const { address, chainId } = useAccount(); const { sendTransactionAsync } = useSendTransaction();
  const [items, setItems] = useState<Submission[] | null>(null); const [error, setError] = useState(""); const [paid, setPaid] = useState(false); const [busy, setBusy] = useState("");
  const [phase, setPhase] = useState<"idle" | "approval" | "execution">("idle"); const [hash, setHash] = useState<Hex>(); const [authorizationId, setAuthorizationId] = useState(""); const processed = useRef("");
  const receipt = useWaitForTransactionReceipt({ hash, chainId: goatTestnet.id, query: { enabled: Boolean(hash && phase !== "idle") } });
  useEffect(() => { void apiFetch<{ submissions: Submission[] }>(`/api/bounties/${bountyId}/submissions`).then((r) => setItems(r.submissions)).catch((e) => { setItems([]); setError(e instanceof Error ? e.message : "Could not load submissions."); }); }, [bountyId]);

  async function choose(id: string) {
    setBusy(id); setError("");
    try {
      if (!address || chainId !== goatTestnet.id) throw new Error("Connect your employer wallet on GOAT Testnet3 first, using the button at the top of the page.");
      const result = await apiFetch<IntentResponse>(`/api/bounties/${bountyId}/select-winner`, { method: "POST", body: JSON.stringify({ submissionId: id }) });
      const tx = result.intent?.transaction;
      if (!tx || !isAddress(tx.to) || (tx.chainId !== undefined && tx.chainId !== goatTestnet.id)) throw new Error("The payment service has not returned the settlement approval transaction.");
      setAuthorizationId(result.authorizationId); processed.current = ""; setPhase("approval");
      const txHash = await sendTransactionAsync({ to: tx.to, data: tx.data as Hex, value: tx.value === undefined ? undefined : BigInt(tx.value), chainId: goatTestnet.id });
      setHash(txHash);
    } catch (e) { setPhase("idle"); setError(e instanceof Error ? e.message : "Could not prepare the settlement."); }
    setBusy("");
  }

  useEffect(() => {
    if (!receipt.isSuccess || !hash || processed.current === hash || phase === "idle") return;
    processed.current = hash;
    void (async () => {
      try {
        if (phase === "approval") {
          const result = await apiFetch<{ intent?: { transaction?: PaymentTransaction } }>(`/api/bounties/${bountyId}/settlement-confirm`, { method: "POST", body: JSON.stringify({ txHash: hash, authorizationId }) });
          const tx = result.intent?.transaction;
          if (!tx || !isAddress(tx.to)) throw new Error("The settlement approval confirmed, but the payout transaction is unavailable from the payment service.");
          setPhase("execution"); setHash(undefined);
          const nextHash = await sendTransactionAsync({ to: tx.to, data: tx.data as Hex, value: tx.value === undefined ? undefined : BigInt(tx.value), chainId: goatTestnet.id });
          setHash(nextHash);
        } else {
          await apiFetch(`/api/bounties/${bountyId}/settlement-finalize`, { method: "POST", body: JSON.stringify({ txHash: hash, authorizationId }) });
          setPhase("idle"); setHash(undefined); setPaid(true); router.refresh();
        }
      } catch (e) { setError(e instanceof Error ? e.message : "Could not confirm the settlement."); setPhase("idle"); }
    })();
  }, [receipt.isSuccess, hash, phase, bountyId, authorizationId, router, sendTransactionAsync]);

  if (items === null) return <div aria-busy="true" className="space-y-3"><div className="skeleton h-28" /><div className="skeleton h-28" /></div>;

  return <div>
    <div aria-live="polite" className="space-y-3 empty:hidden">
      {paid && <Notice tone="ok" title="Winner paid">The settlement confirmed on GOAT Testnet3.</Notice>}
      {error && <Notice>{error}</Notice>}
      {phase !== "idle" && <Notice tone="plain" title={phase === "approval" ? "Step 1 of 2: approve the settlement in your wallet" : "Step 2 of 2: confirm the payout in your wallet"}>
        Keep this page open until both transactions confirm.{hash && <> <a className="link text-ink" href={`${goatTestnet.blockExplorers.default.url}/tx/${hash}`} target="_blank" rel="noreferrer noopener">View current transaction</a></>}
      </Notice>}
    </div>

    {items.length ? <ul className="rows mt-6">{items.map((item) => {
      const verified = Boolean(item.agents?.wallet_verified_at);
      return <li key={item.id} className="grid gap-x-10 gap-y-4 py-7 md:grid-cols-[1fr_15rem]">
        <div className="min-w-0">
          <h3 className="text-[18px] tracking-[-0.02em]">{item.agents?.name || "Agent"}</h3>
          <p className="mt-0.5 text-[13px] text-dim">Submitted {dayTime(item.submitted_at)}</p>
          <p className="mt-4 max-w-[68ch] whitespace-pre-wrap text-[15px] leading-relaxed">{item.description || <span className="text-faint">No notes from the agent.</span>}</p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            {item.deliverable_url && <a className="link" href={item.deliverable_url} target="_blank" rel="noreferrer noopener">Open deliverable link</a>}
            {item.signedDownloadUrl && <a className="link" href={item.signedDownloadUrl} target="_blank" rel="noreferrer noopener">Download deliverable file</a>}
          </div>
          <div className="mt-4"><Tags items={item.agents?.skills} /></div>
        </div>
        <div className="md:text-right">
          <p className="text-[13px] text-dim">Asking</p>
          <p className="mt-0.5"><Amount base={item.proposed_amount_base_units} className="text-[20px]" /></p>
          <button className="btn btn-primary mt-4" disabled={Boolean(busy) || phase !== "idle" || !verified || paid} onClick={() => choose(item.id)}>{busy === item.id ? "Preparing…" : "Pay this submission"}</button>
          {!verified && <p className="mt-2 text-[12px] leading-snug text-dim">This agent has not verified its payout wallet, so it cannot be paid yet.</p>}
        </div>
      </li>;
    })}</ul> : !error && <Empty title="No submissions yet">Invited agents submit here before the deadline. You will see each one&apos;s notes, deliverable and asking payout.</Empty>}
  </div>;
}
