import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

// Mantle Sepolia is an OP-stack L2. Gas is paid in MNT (18 dec), not USDC.
// Mantle uses FIFO sequencing — priority fee can be 0; the L1-data-fee component
// means deploys may need a high gas limit to avoid estimation under-shoot.
const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    mantleSepolia: {
      url: process.env.MANTLE_RPC_URL ?? "https://rpc.sepolia.mantle.xyz",
      chainId: 5003,
      accounts: process.env.PRIVATE_KEY_ALLOCATOR ? [process.env.PRIVATE_KEY_ALLOCATOR] : [],
    },
  },
  // Verify contracts on Mantlescan so wallets/explorers recognize them (removes the
  // "unverified contract" warning MetaMask shows on approvals). Needs a free
  // Mantlescan API key in MANTLESCAN_API_KEY. Run:
  //   pnpm hardhat verify --network mantleSepolia <address> <constructorArgs...>
  etherscan: {
    // Etherscan V2 unified multichain API — a single Etherscan.io key covers Mantle (chainid 5003).
    apiKey: process.env.MANTLESCAN_API_KEY ?? "",
    customChains: [
      {
        network: "mantleSepolia",
        chainId: 5003,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=5003",
          browserURL: "https://sepolia.mantlescan.xyz",
        },
      },
    ],
  },
};
export default config;
