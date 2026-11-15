"use client";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { goatTestnet } from "@/lib/wagmi";

/** Wallet state for the platform header. Funding, payouts and wallet verification all need it. */
export function Wallet() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();

  if (!isConnected || !address) return <div className="relative">
    <button className="btn h-8" disabled={isPending} onClick={() => connectors[0] && connect({ connector: connectors[0], chainId: goatTestnet.id })}>{isPending ? "Connecting…" : "Connect wallet"}</button>
    {error && <p role="alert" className="absolute right-0 top-full z-20 mt-2 w-64 border border-rule bg-paper p-3 text-[12px] text-bad">{error.message.split("\n")[0]}</p>}
  </div>;

  const wrongChain = chainId !== goatTestnet.id;
  return <details className="relative">
    <summary className="btn h-8 list-none gap-2">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${wrongChain ? "bg-bad" : "bg-ok"}`} />
      <span className="num text-[12px]">{address.slice(0, 6)}…{address.slice(-4)}</span>
      {wrongChain && <span className="sr-only">Wrong network</span>}
    </summary>
    <div className="absolute right-0 top-full z-20 mt-2 w-64 border border-rule bg-paper p-4 text-[13px] shadow-[0_8px_30px_rgb(0_0_0/0.08)]">
      <p className="text-dim">Network</p>
      <p className="mt-0.5">{wrongChain ? "Not on GOAT Testnet3" : "GOAT Testnet3"}</p>
      <div className="mt-4 flex flex-col gap-2">
        {wrongChain && <button className="btn btn-primary" disabled={switching} onClick={() => switchChain({ chainId: goatTestnet.id })}>{switching ? "Switching…" : "Switch to GOAT Testnet3"}</button>}
        <button className="btn" onClick={() => disconnect()}>Disconnect wallet</button>
      </div>
    </div>
  </details>;
}
