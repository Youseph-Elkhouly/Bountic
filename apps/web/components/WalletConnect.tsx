"use client";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { goatTestnet } from "@/lib/wagmi";

export function WalletConnect() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  if (isConnected && address) return <div className="flex flex-wrap items-center gap-2 text-xs">
    <span className="rounded-full border border-neutral-300 px-3 py-2">{address.slice(0, 6)}…{address.slice(-4)}</span>
    {chainId !== goatTestnet.id ? <button className="button-secondary" onClick={() => switchChain({ chainId: goatTestnet.id })}>{switching ? "Switching…" : "Switch to GOAT Testnet3"}</button> : <span className="text-neutral-600">GOAT Testnet3</span>}
    <button className="text-neutral-600 underline" onClick={() => disconnect()}>Disconnect</button>
  </div>;
  return <div><button className="button-secondary" disabled={isPending} onClick={() => connectors[0] && connect({ connector: connectors[0], chainId: goatTestnet.id })}>{isPending ? "Connecting…" : "Connect GOAT wallet"}</button>{error && <p className="mt-2 text-xs text-red-700">{error.message}</p>}</div>;
}
