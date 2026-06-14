import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { mantleSepoliaTestnet } from "viem/chains";

export const mantleSepolia = mantleSepoliaTestnet;

export const wagmiConfig = createConfig({
  chains: [mantleSepolia],
  connectors: [injected()],
  transports: { [mantleSepolia.id]: http("https://rpc.sepolia.mantle.xyz") },
  ssr: true,
});
