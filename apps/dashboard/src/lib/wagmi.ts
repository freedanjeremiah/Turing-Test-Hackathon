import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

// Mantle uses USDC as native gas — no ETH sourcing needed. Set PAYMASTER_URL in
// .env if your Mantle deployment supports ERC-4337 Paymaster (currently optional).
export const arcTestnet = {
  id: 5003,
  name: "Mantle Sepolia",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.sepolia.mantle.xyz"] } },
} as const;

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: { [arcTestnet.id]: http("https://rpc.sepolia.mantle.xyz") },
});
