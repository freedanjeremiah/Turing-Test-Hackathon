import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

const VAULT_ABI = [
  "function agentAllocation(address) view returns (uint256)",
] as const;

export async function readAllocatedUsdc(agentAddress: string): Promise<number> {
  if (!process.env.VAULT_ADDRESS || !process.env.MANTLE_RPC_URL) {
    throw new Error("VAULT_ADDRESS or MANTLE_RPC_URL not set");
  }
  const provider = new ethers.JsonRpcProvider(process.env.MANTLE_RPC_URL);
  const vault = new ethers.Contract(process.env.VAULT_ADDRESS, VAULT_ABI, provider);
  const raw = await vault.agentAllocation(agentAddress) as bigint;
  return Number(raw) / 1_000_000;
}
