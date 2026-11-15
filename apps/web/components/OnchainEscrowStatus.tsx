"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Escrow = { onchainBountyId: string; status: "draft" | "funding" | "active" | "settled" | "refunded" | "unknown"; fundedAmountBaseUnits: string; payoutAmountBaseUnits: string; remainingEscrowBaseUnits: string; settlementApproved: boolean };
export function OnchainEscrowStatus({ bountyId }: { bountyId: string }) {
  const [escrow, setEscrow] = useState<Escrow | null>(null);
  const [reason, setReason] = useState("");
  useEffect(() => {
    void apiFetch<{ escrow: Escrow | { status: "unavailable"; reason: string } }>(`/api/payments/${bountyId}`)
      .then((result) => { if (result.escrow.status === "unavailable") setReason(result.escrow.reason); else setEscrow(result.escrow); })
      .catch((error) => setReason(error instanceof Error ? error.message : "Could not load escrow state"));
  }, [bountyId]);
  if (reason) return <p className="mt-2 text-xs text-neutral-500">Live escrow state unavailable · {reason}</p>;
  if (!escrow) return <p className="mt-2 text-xs text-neutral-500">Checking GOAT Testnet3 escrow…</p>;
  const amount = (value: string) => BigInt(value).toLocaleString();
  return <div className="mt-3 space-y-1 text-xs text-neutral-600"><p>On-chain status: <span className="font-medium capitalize">{escrow.status}</span> · bounty #{escrow.onchainBountyId}</p><p>Funded: {amount(escrow.fundedAmountBaseUnits)} base units · remaining in escrow: {amount(escrow.remainingEscrowBaseUnits)}</p>{escrow.settlementApproved && <p>Requester settlement approval is recorded on-chain; payout confirmation is still required.</p>}</div>;
}
