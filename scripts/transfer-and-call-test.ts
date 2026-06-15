/**
 * Proves the deployed ERC-1363 deposit path: usdc.transferAndCall(vault, amount) — a
 * single plain token transfer, NO approve, NO permit — credits vault shares.
 *
 * Usage: pnpm tsx scripts/transfer-and-call-test.ts [amountUsdc]   (default 5)
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const amount = ethers.parseUnits(process.argv[2] ?? "5", 6);
  const p = new ethers.JsonRpcProvider(process.env.MANTLE_RPC_URL!);
  const w = new ethers.Wallet(process.env.PRIVATE_KEY_ALLOCATOR!, p);
  const usdc = new ethers.Contract(process.env.USDC_ADDRESS!, [
    "function mint(address,uint256)",
    "function transferAndCall(address,uint256) returns (bool)",
    "function allowance(address,address) view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
  ], w);
  const vault = new ethers.Contract(process.env.VAULT_ADDRESS!, [
    "function shareBalances(address) view returns (uint256)",
    "function totalAssets() view returns (uint256)",
  ], p);

  const bal: bigint = await usdc.balanceOf(w.address);
  if (bal < amount) await (await usdc.mint(w.address, amount - bal)).wait();

  const tx = await usdc.transferAndCall(process.env.VAULT_ADDRESS!, amount);
  const r = await tx.wait();
  console.log("transferAndCall tx:", r?.hash);
  console.log("allowance (0 = no approve ever):", (await usdc.allowance(w.address, process.env.VAULT_ADDRESS!)).toString());
  console.log("vault shares:", (await vault.shareBalances(w.address)).toString());
  console.log("vault TVL: $" + ethers.formatUnits(await vault.totalAssets(), 6));
}

main().catch(e => { console.error("FAILED:", e.message ?? e); process.exit(1); });
