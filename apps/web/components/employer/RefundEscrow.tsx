"use client";
import { useEffect, useRef, useState } from "react";
import { isAddress, type Hex } from "viem";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { apiFetch } from "@/lib/api";
import { goatTestnet } from "@/lib/wagmi";

type Tx = { to: string; data: string; value?: string | number; chainId?: number };

export function RefundEscrow({ bountyId }: { bountyId: string }) {
  const { address, chainId } = useAccount(); const { sendTransactionAsync } = useSendTransaction();
  const [hash, setHash] = useState<Hex>(); const [error, setError] = useState(""); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false); const processed = useRef("");
  const receipt = useWaitForTransactionReceipt({ hash, chainId: goatTestnet.id, query: { enabled: Boolean(hash) } });
  async function begin() {
    setError(""); setBusy(true);
    try {
      if (!address || chainId !== goatTestnet.id) throw new Error("Connect your employer wallet on GOAT Testnet3 first, using the button at the top of the page.");
      const result = await apiFetch<{ intent?: { transaction?: Tx } }>(`/api/bounties/${bountyId}/refund-intent`, { method: "POST", body: "{}" });
      const tx = result.intent?.transaction;
      if (!tx || !isAddress(tx.to)) throw new Error("The payment service has not returned the refund transaction.");
      processed.current = "";
      setHash(await sendTransactionAsync({ to: tx.to, data: tx.data as Hex, value: tx.value === undefined ? undefined : BigInt(tx.value), chainId: goatTestnet.id }));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not prepare the refund."); }
    setBusy(false);
  }
  useEffect(() => {
    if (!receipt.isSuccess || !hash || processed.current === hash) return;
    processed.current = hash;
    void apiFetch(`/api/bounties/${bountyId}/refund-confirm`, { method: "POST", body: JSON.stringify({ txHash: hash }) }).then(() => setDone(true)).catch((e) => setError(e instanceof Error ? e.message : "Could not confirm the refund."));
  }, [receipt.isSuccess, hash, bountyId]);
  return <div>
    <button disabled={busy || Boolean(hash)} className="btn" onClick={begin}>{busy ? "Preparing…" : done ? "Escrow refunded" : hash ? "Refund pending…" : "Refund escrow"}</button>
    <div aria-live="polite" className="max-w-xs text-[12px] leading-snug">
      {done && <p className="mt-2 text-ok">Refund confirmed on GOAT Testnet3.</p>}
      {error && <p className="mt-2 text-bad">{error}</p>}
      {hash && <a className="link mt-2 inline-block text-dim" href={`${goatTestnet.blockExplorers.default.url}/tx/${hash}`} target="_blank" rel="noreferrer noopener">View transaction</a>}
    </div>
  </div>;
}
