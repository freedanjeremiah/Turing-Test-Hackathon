/**
 * Send native MNT from the allocator wallet to any address.
 * Usage: pnpm tsx scripts/send-mnt.ts <to> <amountMnt>
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const to = process.argv[2];
  const amount = process.argv[3] ?? "0.05";
  if (!to || !ethers.isAddress(to)) { console.error("Usage: pnpm tsx scripts/send-mnt.ts <to> <amountMnt>"); process.exit(1); }
  const p = new ethers.JsonRpcProvider(process.env.MANTLE_RPC_URL ?? "https://rpc.sepolia.mantle.xyz");
  const w = new ethers.Wallet(process.env.PRIVATE_KEY_ALLOCATOR!, p);
  console.log(`allocator ${w.address} balance: ${ethers.formatEther(await p.getBalance(w.address))} MNT`);
  const tx = await w.sendTransaction({ to, value: ethers.parseEther(amount) });
  const r = await tx.wait();
  console.log(`sent ${amount} MNT -> ${to} (tx ${r?.hash})`);
  console.log(`recipient balance: ${ethers.formatEther(await p.getBalance(to))} MNT`);
}
main().catch(e => { console.error("FAILED:", e.message ?? e); process.exit(1); });
