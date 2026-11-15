"use client";
import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage, useSwitchChain } from "wagmi";
import { apiFetch } from "@/lib/api";
import { goatTestnet } from "@/lib/wagmi";

type LinkedWallet = { address: string; verifiedAt: string } | null;

export function RequesterWalletLink() {
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const [linked, setLinked] = useState<LinkedWallet>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void apiFetch<{ wallet: LinkedWallet }>("/api/requester-wallet").then((data) => setLinked(data.wallet)).catch((issue) => setError(issue.message)); }, []);

  async function verify() {
    setError(""); setBusy(true);
    try {
      if (!address || chainId !== goatTestnet.id) throw new Error("Connect your wallet and switch it to GOAT Testnet3 first.");
      const challenge = await apiFetch<{ message: string }>("/api/requester-wallet/challenge", { method: "POST", body: JSON.stringify({ walletAddress: address }) });
      const signature = await signMessageAsync({ message: challenge.message });
      const result = await apiFetch<{ walletAddress: string; verified: true }>("/api/requester-wallet/verify", { method: "POST", body: JSON.stringify({ message: challenge.message, signature }) });
      setLinked({ address: result.walletAddress, verifiedAt: new Date().toISOString() });
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Could not verify wallet"); }
    setBusy(false);
  }

  return <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
    <div><h2 className="font-medium">Requester wallet</h2><p className="mt-1 text-sm text-neutral-600">Link a GOAT Testnet3 wallet once. The API checks its signature before preparing any escrow transaction.</p>
      <p className="mt-2 text-xs text-neutral-500">{linked ? `Verified · ${linked.address.slice(0, 8)}…${linked.address.slice(-6)}` : "Not linked yet"}</p>
      {error && <p className="mt-2 text-xs text-amber-800">{error}</p>}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {!isConnected ? <button className="button-secondary" disabled={connecting} onClick={() => connectors[0] && connect({ connector: connectors[0], chainId: goatTestnet.id })}>{connecting ? "Connecting…" : "Connect wallet"}</button> : <>
        {chainId !== goatTestnet.id ? <button className="button-secondary" disabled={switching} onClick={() => switchChain({ chainId: goatTestnet.id })}>{switching ? "Switching…" : "Switch to GOAT Testnet3"}</button> : <button className="button-secondary" disabled={busy || (linked?.address.toLowerCase() === address?.toLowerCase())} onClick={verify}>{busy ? "Verifying…" : linked?.address.toLowerCase() === address?.toLowerCase() ? "Wallet verified" : "Verify connected wallet"}</button>}
        <button className="text-sm text-neutral-500 underline" onClick={() => disconnect()}>Disconnect</button>
      </>}
    </div>
  </div>;
}
