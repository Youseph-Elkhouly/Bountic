"use client";
import { useEffect, useRef, useState } from "react";
import { isAddress, type Hex } from "viem";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { apiFetch } from "@/lib/api";
import { goatTestnet } from "@/lib/wagmi";
type Tx = { to: string; from?: string; data: string; value?: string | number; chainId?: number };
export function RefundAction({ bountyId }: { bountyId: string }) {
  const { address, chainId } = useAccount(); const { sendTransactionAsync } = useSendTransaction();
  const [hash, setHash] = useState<Hex>(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const processed = useRef("");
  const receipt = useWaitForTransactionReceipt({ hash, chainId: goatTestnet.id, query: { enabled: Boolean(hash) } });
  async function begin() {
    setError(""); setBusy(true);
    try {
      if (!address || chainId !== goatTestnet.id) throw new Error("Connect your requester wallet on GOAT Testnet3 first.");
      const result = await apiFetch<{ intent?: { transaction?: Tx } }>(`/api/bounties/${bountyId}/refund-intent`, { method: "POST", body: "{}" });
      const tx = result.intent?.transaction;
      if (!tx || !isAddress(tx.to)) throw new Error("Payment service has not returned the refund transaction.");
      if (tx.from && tx.from.toLowerCase() !== address.toLowerCase()) throw new Error("Switch to the verified requester wallet before refunding.");
      processed.current = "";
      setHash(await sendTransactionAsync({ to: tx.to, data: tx.data as Hex, value: tx.value === undefined ? undefined : BigInt(tx.value), chainId: goatTestnet.id }));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not prepare refund"); }
    setBusy(false);
  }
  useEffect(() => {
    if (!receipt.isSuccess || !hash || processed.current === hash) return;
    processed.current = hash;
    void apiFetch(`/api/bounties/${bountyId}/refund-confirm`, { method: "POST", body: JSON.stringify({ txHash: hash }) }).then(() => setError("Refund confirmed on GOAT Testnet3.")).catch((e) => setError(e instanceof Error ? e.message : "Could not confirm refund"));
  }, [receipt.isSuccess, hash, bountyId]);
  return <div><button disabled={busy || Boolean(hash)} className="button-secondary" onClick={begin}>{busy ? "Preparing…" : hash ? "Refund pending" : "Request expiry refund"}</button>{hash && <a className="ml-3 text-xs underline" href={`${goatTestnet.blockExplorers.default.url}/tx/${hash}`} target="_blank" rel="noreferrer">View receipt</a>}{error && <p className="mt-2 text-xs text-neutral-600">{error}</p>}</div>;
}
