/**
 * Mint test USDC (the deployed ERC20Mock) to any address. There is no canonical USDC
 * faucet on Mantle Sepolia, so test USDC comes from this mint. ERC20Mock.mint is public.
 *
 * Usage:
 *   pnpm tsx scripts/mint-usdc.ts <recipient> [amountUsdc]
 *   pnpm tsx scripts/mint-usdc.ts 0xYourMetaMaskAddr 1000
 *
 * Needs MANTLE_RPC_URL, USDC_ADDRESS, and a funded key (PRIVATE_KEY_ALLOCATOR) for gas (MNT).
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const ERC20_MINT_ABI = [
  "function mint(address to, uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
] as const;

async function main() {
  const to = process.argv[2];
  const amount = process.argv[3] ?? "1000";
  if (!to || !ethers.isAddress(to)) {
    console.error("Usage: pnpm tsx scripts/mint-usdc.ts <recipient> [amountUsdc]");
    process.exit(1);
  }
  const rpc = process.env.MANTLE_RPC_URL;
  const usdcAddr = process.env.USDC_ADDRESS;
  const pk = process.env.PRIVATE_KEY_ALLOCATOR;
  if (!rpc || !usdcAddr || !pk) {
    throw new Error("Missing env: MANTLE_RPC_URL, USDC_ADDRESS, PRIVATE_KEY_ALLOCATOR");
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(pk, provider);
  const usdc = new ethers.Contract(usdcAddr, ERC20_MINT_ABI, wallet);

  const dec: number = await usdc.decimals();
  const raw = ethers.parseUnits(amount, dec);
  console.log(`Minting ${amount} USDC (${raw}) to ${to} ...`);
  const tx = await usdc.mint(to, raw);
  const receipt = await tx.wait();
  const bal = await usdc.balanceOf(to);
  console.log(`Minted (tx ${receipt?.hash}). ${to} balance now ${ethers.formatUnits(bal, dec)} USDC`);
}

main().catch(err => { console.error(err); process.exit(1); });
