"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress, type Hex } from "viem";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { apiFetch } from "@/lib/api";
import { goatTestnet } from "@/lib/wagmi";

type Transaction = { to: string; data: string; value?: string | number; chainId?: number };

/** Two wallet prompts: create the bounty on-chain, then lock its budget in escrow. */
export function FundEscrow({ bountyId, primary = false }: { bountyId: string; primary?: boolean }) {
  const router = useRouter(); const { address, chainId } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();
  const [hash, setHash] = useState<Hex>(); const [phase, setPhase] = useState<"idle" | "create" | "fund" | "complete">("idle");
  const [error, setError] = useState(""); const [onchainBountyId, setOnchainBountyId] = useState(""); const processed = useRef<string>("");
  const receipt = useWaitForTransactionReceipt({ hash, chainId: goatTestnet.id, query: { enabled: Boolean(hash && phase !== "idle" && phase !== "complete") } });

  async function submitTransaction(tx: Transaction) {
    if (!address || !isAddress(tx.to)) throw new Error("Connect a GOAT-compatible wallet first.");
    if (tx.chainId !== undefined && tx.chainId !== goatTestnet.id) throw new Error("The payment service returned a transaction for the wrong chain.");
    const result = await sendTransactionAsync({ to: tx.to, data: tx.data as Hex, value: tx.value === undefined ? undefined : BigInt(tx.value), chainId: goatTestnet.id });
    setHash(result); return result;
  }

  async function begin() {
    setError("");
    if (!address) { setError("Connect your wallet first, using the button at the top of the page."); return; }
    if (chainId !== goatTestnet.id) { setError("Switch your wallet to GOAT Testnet3 first, from the wallet menu at the top of the page."); return; }
    try {
      const result = await apiFetch<{ intent: { phase?: "create" | "fund"; onchainBountyId?: string; transaction?: Transaction } }>(`/api/bounties/${bountyId}/funding-intent`, { method: "POST", body: "{}" });
      if (!result.intent?.transaction) throw new Error("The payment service has not provided the create transaction yet.");
      processed.current = "";
      if (result.intent.phase === "fund") {
        if (!result.intent.onchainBountyId) throw new Error("The payment service returned an invalid funding step.");
        setOnchainBountyId(result.intent.onchainBountyId); setPhase("fund");
      } else setPhase("create");
      await submitTransaction(result.intent.transaction);
    } catch (e) { setPhase("idle"); setError(e instanceof Error ? e.message : "Could not prepare escrow."); }
  }

  useEffect(() => {
    if (!receipt.isSuccess || !hash || processed.current === hash || phase === "idle" || phase === "complete") return;
    processed.current = hash;
    void (async () => {
      try {
        if (phase === "create") {
          const result = await apiFetch<{ onchainBountyId: string; transaction?: Transaction }>(`/api/bounties/${bountyId}/funding-ready`, { method: "POST", body: JSON.stringify({ txHash: hash }) });
          if (!result.transaction) throw new Error("The payment service has not provided the escrow funding transaction yet.");
          setOnchainBountyId(result.onchainBountyId);
          setPhase("fund"); setHash(undefined);
          const nextHash = await sendTransactionAsync({ to: result.transaction.to as `0x${string}`, data: result.transaction.data as Hex, value: result.transaction.value === undefined ? undefined : BigInt(result.transaction.value), chainId: goatTestnet.id });
          setHash(nextHash);
        } else if (phase === "fund") {
          await apiFetch(`/api/bounties/${bountyId}/funding-confirm`, { method: "POST", body: JSON.stringify({ txHash: hash, onchainBountyId }) });
          setPhase("complete"); router.refresh();
        }
      } catch (e) { setError(e instanceof Error ? e.message : "Could not confirm funding."); setPhase("idle"); }
    })();
  }, [receipt.isSuccess, hash, phase, bountyId, onchainBountyId, router, sendTransactionAsync]);

  const label = phase === "idle" ? "Fund escrow" : phase === "create" ? "Step 1 of 2: creating bounty…" : phase === "fund" ? "Step 2 of 2: locking escrow…" : "Escrow funded";
  return <div>
    <button className={`btn ${primary ? "btn-primary" : ""}`} disabled={phase !== "idle"} onClick={begin}>{label}</button>
    <div aria-live="polite" className="max-w-xs text-[12px] leading-snug">
      {receipt.isError && <p className="mt-2 text-bad">The transaction did not confirm. The bounty is still unfunded.</p>}
      {error && <p className="mt-2 text-bad">{error}</p>}
      {hash && <a className="link mt-2 inline-block text-dim" href={`${goatTestnet.blockExplorers.default.url}/tx/${hash}`} target="_blank" rel="noreferrer noopener">View transaction</a>}
    </div>
  </div>;
}
