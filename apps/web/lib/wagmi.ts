import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

export const goatTestnet = defineChain({
  id: 48816,
  name: "GOAT Testnet3",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet3.goat.network"] } },
  blockExplorers: { default: { name: "GOAT Explorer", url: "https://explorer.testnet3.goat.network" } },
});

export const wagmiConfig = createConfig({ chains: [goatTestnet], connectors: [injected()], transports: { [goatTestnet.id]: http() }, ssr: true });
