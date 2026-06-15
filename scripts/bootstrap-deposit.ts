/**
 * Bootstraps vault liquidity from the allocator wallet (no MetaMask needed) so the
 * allocator has capital to allocate to agents. Mints test USDC to the allocator (mock
 * USDC is openly mintable), approves the vault, and deposits up to the wallet cap.
 *
 * Usage: pnpm tsx scripts/bootstrap-deposit.ts [amountUsdc]   (default 100, the cap)
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const ERC20_ABI = [
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function mint(address,uint256)",
] as const;
const VAULT_ABI = [
  "function deposit(uint256 amount) external",
  "function totalAssets() view returns (uint256)",
  "function depositedBy(address) view returns (uint256)",
  "function WALLET_CAP() view returns (uint256)",
] as const;

async function main() {
  const amountArg = process.argv[2] ?? "100";
  const provider = new ethers.JsonRpcProvider(process.env.MANTLE_RPC_URL!);
  const w = new ethers.Wallet(process.env.PRIVATE_KEY_ALLOCATOR!, provider);
  const usdc = new ethers.Contract(process.env.USDC_ADDRESS!, ERC20_ABI, w);
  const vault = new ethers.Contract(process.env.VAULT_ADDRESS!, VAULT_ABI, w);

  const cap: bigint = await vault.WALLET_CAP();
  const already: bigint = await vault.depositedBy(w.address);
  let amount = ethers.parseUnits(amountArg, 6);
  if (already + amount > cap) amount = cap - already;
  if (amount <= 0n) { console.log("already at wallet cap; nothing to deposit"); return; }

  let bal: bigint = await usdc.balanceOf(w.address);
  if (bal < amount) {
    console.log(`minting ${ethers.formatUnits(amount - bal, 6)} USDC to allocator...`);
    await (await usdc.mint(w.address, amount - bal)).wait();
  }

  console.log(`approving vault for ${ethers.formatUnits(amount, 6)} USDC...`);
  await (await usdc.approve(process.env.VAULT_ADDRESS!, amount)).wait();
  console.log("depositing...");
  const r = await (await vault.deposit(amount)).wait();
  console.log(`deposit tx: ${r?.hash}`);

  const tvl: bigint = await vault.totalAssets();
  console.log(`Vault totalAssets now: $${ethers.formatUnits(tvl, 6)}`);
}

main().catch(e => { console.error("FAILED:", e.message ?? e); process.exit(1); });
