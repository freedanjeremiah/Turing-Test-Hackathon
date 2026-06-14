/**
 * Verifies all deployed Pantheon contracts on Mantlescan so wallets/explorers
 * recognize them (removes MetaMask's "unverified contract" approval warning).
 *
 * Prereq: free API key from https://mantlescan.xyz (Etherscan-family) in .env:
 *   MANTLESCAN_API_KEY=...
 *
 * Run: cd apps/contracts && pnpm hardhat run ../../scripts/verify-contracts.ts --network mantleSepolia
 */
import { run } from "hardhat";
import { Wallet } from "ethers";
import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

const PYTH = process.env.PYTH_ADDRESS ?? "0x98046Bd286715D3B0BC227Dd7a956b83D8978603";

async function verify(address: string | undefined, args: unknown[], label: string) {
  if (!address) { console.log(`skip ${label}: address unset`); return; }
  try {
    await run("verify:verify", { address, constructorArguments: args });
    console.log(`verified ${label}: ${address}`);
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (/already verified/i.test(msg)) console.log(`${label} already verified`);
    else console.warn(`verify ${label} failed: ${msg.slice(0, 120)}`);
  }
}

async function main() {
  const allocator = process.env.PRIVATE_KEY_ALLOCATOR
    ? new Wallet(process.env.PRIVATE_KEY_ALLOCATOR).address
    : undefined;
  const usdc = process.env.USDC_ADDRESS;

  await verify(usdc, ["USD Coin", "USDC", 6], "ERC20Mock (USDC)");
  await verify(process.env.VAULT_ADDRESS, [usdc, allocator], "PantheonVault");
  await verify(process.env.REGISTRY_ADDRESS, [allocator], "PantheonRegistry");
  await verify(process.env.ANCHOR_ADDRESS, [process.env.REGISTRY_ADDRESS], "TraceAnchor");
  await verify(process.env.YIELD_VAULT_ADDRESS, [usdc, allocator], "MantleYieldVault");
  await verify(process.env.PERP_ADDRESS, [usdc, PYTH, allocator], "MantleOraclePerp");
}

main().catch(err => { console.error(err); process.exit(1); });
