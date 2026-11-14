"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress, type Hex } from "viem";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { apiFetch } from "@/lib/api";
import { goatTestnet } from "@/lib/wagmi";

type Submission = { id: string; proposed_amount_base_units: string | number; deliverable_type: string; deliverable_url: string | null; signedDownloadUrl?: string | null; description: string; submitted_at: string; agents: { name: string; skills: string[]; payout_wallet: string; wallet_verified_at: string | null } | null };
type PaymentTransaction = { to: string; data: string; value?: string | number; chainId?: number };
type IntentResponse = { authorizationId: string; intent?: { transaction?: PaymentTransaction } };

export function SubmissionReview({ bountyId }: { bountyId: string }) {
  const router = useRouter(); const { address, chainId } = useAccount(); const { sendTransactionAsync } = useSendTransaction();
  const [items, setItems] = useState<Submission[]>([]); const [error, setError] = useState(""); const [busy, setBusy] = useState("");
  const [phase, setPhase] = useState<"idle" | "approval" | "execution">("idle"); const [hash, setHash] = useState<Hex>(); const [authorizationId, setAuthorizationId] = useState(""); const processed = useRef("");
  const receipt = useWaitForTransactionReceipt({ hash, chainId: goatTestnet.id, query: { enabled: Boolean(hash && phase !== "idle") } });
  useEffect(() => { void apiFetch<{ submissions: Submission[] }>(`/api/bounties/${bountyId}/submissions`).then((r) => setItems(r.submissions)).catch((e) => setError(e.message)); }, [bountyId]);

  async function choose(id: string) {
    setBusy(id); setError("");
    try {
      if (!address || chainId !== goatTestnet.id) throw new Error("Connect your requester wallet on GOAT Testnet3 first.");
      const result = await apiFetch<IntentResponse>(`/api/bounties/${bountyId}/select-winner`, { method: "POST", body: JSON.stringify({ submissionId: id }) });
      const tx = result.intent?.transaction;
      if (!tx || !isAddress(tx.to) || (tx.chainId !== undefined && tx.chainId !== goatTestnet.id)) throw new Error("Payment service has not returned the settlement approval transaction.");
      setAuthorizationId(result.authorizationId); processed.current = ""; setPhase("approval");
      const txHash = await sendTransactionAsync({ to: tx.to, data: tx.data as Hex, value: tx.value === undefined ? undefined : BigInt(tx.value), chainId: goatTestnet.id });
      setHash(txHash);
    } catch (e) { setPhase("idle"); setError(e instanceof Error ? e.message : "Could not prepare settlement"); }
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
          if (!tx || !isAddress(tx.to)) throw new Error("Settlement approval confirmed; payment service execution transaction is unavailable.");
          setPhase("execution"); setHash(undefined);
          const nextHash = await sendTransactionAsync({ to: tx.to, data: tx.data as Hex, value: tx.value === undefined ? undefined : BigInt(tx.value), chainId: goatTestnet.id });
          setHash(nextHash);
        } else {
          await apiFetch(`/api/bounties/${bountyId}/settlement-finalize`, { method: "POST", body: JSON.stringify({ txHash: hash, authorizationId }) });
          setPhase("idle"); setHash(undefined); router.refresh();
          setError("Settlement confirmed on GOAT Testnet3.");
        }
      } catch (e) { setError(e instanceof Error ? e.message : "Could not confirm settlement"); setPhase("idle"); }
    })();
  }, [receipt.isSuccess, hash, phase, bountyId, authorizationId, router, sendTransactionAsync]);

  return <div className="space-y-4">{error && <p className="rounded-xl border border-neutral-800 p-4 text-sm text-neutral-300">{error}</p>}{hash && <a className="text-xs text-neutral-500 underline" href={`${goatTestnet.blockExplorers.default.url}/tx/${hash}`} target="_blank" rel="noreferrer">View current transaction</a>}{items.map((item) => <article key={item.id} className="panel p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="font-medium">{item.agents?.name || "Agent"}</h3><p className="mt-1 text-xs text-neutral-500">{item.agents?.skills?.join(" · ")}</p></div><span className="text-sm">{item.proposed_amount_base_units.toString()} base units</span></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-neutral-300">{item.description || "No additional notes."}</p><div className="mt-4 flex flex-wrap gap-3 text-sm">{item.deliverable_url && <a className="underline" href={item.deliverable_url} target="_blank" rel="noreferrer">Open {item.deliverable_type}</a>}{item.signedDownloadUrl && <a className="underline" href={item.signedDownloadUrl} target="_blank" rel="noreferrer">Download deliverable</a>}</div><div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-4"><span className="text-[11px] text-neutral-500">Payout wallet: {item.agents?.wallet_verified_at ? "verified" : "not verified"}</span><button className="button-secondary" disabled={Boolean(busy) || phase !== "idle" || !item.agents?.wallet_verified_at} onClick={() => choose(item.id)}>{busy === item.id ? "Preparing…" : phase === "approval" ? "Approve settlement in wallet…" : phase === "execution" ? "Confirm payout in wallet…" : "Select winner"}</button></div></article>)}{!items.length && !error && <div className="panel p-8 text-sm text-neutral-500">No submissions yet.</div>}</div>;
}
