/**
 * Demeter venue execution: deposit USDC into the real on-chain MantleYieldVault
 * (ERC-4626) on Mantle Sepolia and later redeem to compute realized yield.
 *
 * MantleYieldVault is a real ERC-4626 vault whose share price appreciates from an
 * owner-funded reward reserve streamed per second:
 *   deposit(assets, receiver) -> shares
 *   redeem(shares, receiver, owner) -> assets
 *
 * No external lending protocol exists on Mantle Sepolia, so this self-deployed vault
 * IS the real yield venue. Everything is real on-chain state — no simulation.
 */
import { ethers } from "ethers";
import { AgentProposal } from "@pantheon/shared";
import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

const ENABLE_REAL_TRADES = process.env.ENABLE_REAL_TRADES === "true";

const USDC_ADDRESS = process.env.USDC_ADDRESS ?? "";
const YIELD_VAULT_ADDRESS = process.env.YIELD_VAULT_ADDRESS ?? "";

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
] as const;

const VAULT_ABI = [
  "function deposit(uint256 assets, address receiver) returns (uint256 shares)",
  "function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)",
  "function balanceOf(address) view returns (uint256)",
] as const;

export type DepositResult =
  | { ok: true; venue: string; sharesHeld: bigint; depositedUsd6: bigint }
  | { ok: false; reason: string };

export type RedeemResult =
  | { ok: true; receivedUsd6: bigint }
  | { ok: false; reason: string };

function wallet(): ethers.Wallet {
  const provider = new ethers.JsonRpcProvider(process.env.MANTLE_RPC_URL!);
  return new ethers.Wallet(process.env.PRIVATE_KEY_DEMETER!, provider);
}

export async function depositToVenue(_proposal: AgentProposal, allocatedUsd: number): Promise<DepositResult> {
  const amountUsdc6 = BigInt(Math.floor(allocatedUsd * 1_000_000));

  if (!ENABLE_REAL_TRADES) {
    console.log(`[demeter] deposit skipped (ENABLE_REAL_TRADES=false): would deposit ${allocatedUsd} USDC into MantleYieldVault`);
    return { ok: false, reason: "real_trades_disabled" };
  }
  if (!USDC_ADDRESS || !YIELD_VAULT_ADDRESS) {
    return { ok: false, reason: "vault_address_unset" };
  }

  const w = wallet();
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, w);
  const vault = new ethers.Contract(YIELD_VAULT_ADDRESS, VAULT_ABI, w);

  const sharesBefore = BigInt(await vault.balanceOf(w.address));

  const allowance: bigint = await usdc.allowance(w.address, YIELD_VAULT_ADDRESS);
  if (allowance < amountUsdc6) {
    await (await usdc.approve(YIELD_VAULT_ADDRESS, ethers.MaxUint256)).wait();
  }

  const tx = await vault.deposit(amountUsdc6, w.address);
  const receipt = await tx.wait();
  const sharesAfter = BigInt(await vault.balanceOf(w.address));
  const sharesHeld = sharesAfter - sharesBefore;
  console.log(`[demeter] MantleYieldVault deposit ok (tx: ${receipt?.hash}); shares delta = ${sharesHeld}`);
  return { ok: true, venue: "mantle_yield", sharesHeld, depositedUsd6: amountUsdc6 };
}

export async function redeemFromVenue(_venue: string, sharesHeld: bigint, depositedUsd6: bigint): Promise<RedeemResult> {
  if (!ENABLE_REAL_TRADES) {
    return { ok: false, reason: "real_trades_disabled" };
  }
  if (sharesHeld <= 0n) {
    return { ok: false, reason: "no_shares_to_redeem" };
  }
  if (!USDC_ADDRESS || !YIELD_VAULT_ADDRESS) {
    return { ok: false, reason: "vault_address_unset" };
  }

  const w = wallet();
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, w);
  const vault = new ethers.Contract(YIELD_VAULT_ADDRESS, VAULT_ABI, w);

  const balBefore = BigInt(await usdc.balanceOf(w.address));
  const tx = await vault.redeem(sharesHeld, w.address, w.address);
  const receipt = await tx.wait();
  const balAfter = BigInt(await usdc.balanceOf(w.address));
  const receivedUsd6 = balAfter - balBefore;
  console.log(`[demeter] MantleYieldVault redeem ok (tx: ${receipt?.hash}); received ${receivedUsd6} usdc6 vs deposited ${depositedUsd6}`);
  return { ok: true, receivedUsd6 };
}
