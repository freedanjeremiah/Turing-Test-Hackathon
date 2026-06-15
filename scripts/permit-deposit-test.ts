/**
 * Proves the deployed permit path: signs an EIP-2612 permit and calls
 * vault.depositWithPermit — NO approve() transaction — against the LIVE contracts.
 *
 * Usage: pnpm tsx scripts/permit-deposit-test.ts [amountUsdc]   (default 5)
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const USDC_ABI = [
  "function mint(address,uint256)",
  "function nonces(address) view returns (uint256)",
  "function name() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
] as const;
const VAULT_ABI = [
  "function depositWithPermit(uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
  "function shareBalances(address) view returns (uint256)",
  "function totalAssets() view returns (uint256)",
] as const;

async function main() {
  const amount = ethers.parseUnits(process.argv[2] ?? "5", 6);
  const provider = new ethers.JsonRpcProvider(process.env.MANTLE_RPC_URL!);
  const w = new ethers.Wallet(process.env.PRIVATE_KEY_ALLOCATOR!, provider);
  const usdcAddr = process.env.USDC_ADDRESS!;
  const vaultAddr = process.env.VAULT_ADDRESS!;
  const usdc = new ethers.Contract(usdcAddr, USDC_ABI, w);
  const vault = new ethers.Contract(vaultAddr, VAULT_ABI, w);

  // ensure balance
  const bal: bigint = await usdc.balanceOf(w.address);
  if (bal < amount) { await (await usdc.mint(w.address, amount - bal)).wait(); }

  const allowanceBefore: bigint = await usdc.allowance(w.address, vaultAddr);
  const name: string = await usdc.name();
  const nonce: bigint = await usdc.nonces(w.address);
  const { chainId } = await provider.getNetwork();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const domain = { name, version: "1", chainId, verifyingContract: usdcAddr };
  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };
  const message = { owner: w.address, spender: vaultAddr, value: amount, nonce, deadline };
  const sig = await w.signTypedData(domain, types, message);
  const { v, r, s } = ethers.Signature.from(sig);

  console.log(`allowance before: ${allowanceBefore} (0 = no approve tx happened)`);
  console.log(`signed permit for ${ethers.formatUnits(amount, 6)} USDC, submitting depositWithPermit...`);
  const tx = await vault.depositWithPermit(amount, deadline, v, r, s);
  const rcpt = await tx.wait();
  console.log(`depositWithPermit tx: ${rcpt?.hash}`);
  console.log(`shares: ${await vault.shareBalances(w.address)}, vault TVL: $${ethers.formatUnits(await vault.totalAssets(), 6)}`);
}

main().catch(e => { console.error("FAILED:", e.message ?? e); process.exit(1); });
