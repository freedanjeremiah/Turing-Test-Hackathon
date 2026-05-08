/**
 * Set the allocator address on PantheonVault.
 * Run after deploying contracts if admin != allocator wallet.
 * tsx scripts/set-allocator.ts
 */
import { ethers } from "ethers";
import { PantheonVaultABI } from "@pantheon/shared/abis";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const provider = new ethers.JsonRpcProvider(process.env.MANTLE_RPC_URL!);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_ALLOCATOR!, provider);
const vault = new ethers.Contract(
  process.env.VAULT_ADDRESS!,
  PantheonVaultABI as unknown[],
  wallet
);

async function main() {
  console.log("Setting allocator to:", wallet.address);
  const tx = await vault.setAllocator(wallet.address);
  await tx.wait();
  console.log("✓ Allocator set to:", wallet.address);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
