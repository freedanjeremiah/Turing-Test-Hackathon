import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

// Mantle uses USDC as native gas. Transactions cost USDC directly — no ETH needed.
// Circle Paymaster endpoint (PAYMASTER_URL) can sponsor gas; omit for direct USDC gas.
const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    Mantle: {
      url: process.env.MANTLE_RPC_URL ?? "",
      chainId: 5003,
      accounts: process.env.PRIVATE_KEY_ALLOCATOR
        ? [process.env.PRIVATE_KEY_ALLOCATOR]
        : [],
    },
  },
};
export default config;
