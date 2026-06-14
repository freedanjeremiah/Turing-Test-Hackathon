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
};
export default config;
