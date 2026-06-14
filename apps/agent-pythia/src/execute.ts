/**
 * Execute a Pythia trade: open a real perp position on the MantleOraclePerp contract
 * (Mantle Sepolia), settled against the real Pyth oracle. Uses @pantheon/mantle-perp-client.
 *
 * Gated by ENABLE_REAL_TRADES=true. The cycle in index.ts handles the hold, close,
 * stuck reporting and settle.
 */
import { AgentProposal } from "@pantheon/shared";
import { openPerpPosition, PerpPosition } from "@pantheon/mantle-perp-client";
import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

const ENABLE_REAL_TRADES = process.env.ENABLE_REAL_TRADES === "true";

export type { PerpPosition };

export type ExecuteResult =
  | { ok: true; position: PerpPosition }
  | { ok: false; reason: string };

export async function executePythiaTrade(
  proposal: AgentProposal,
  allocatedUsd: number,
): Promise<ExecuteResult> {
  if (!ENABLE_REAL_TRADES) {
    console.log(`[pythia] trade skipped (ENABLE_REAL_TRADES=false): would open ${allocatedUsd} USDC perp for ${proposal.tradeIdea}`);
    return { ok: false, reason: "real_trades_disabled" };
  }

  console.log(`[pythia] opening real Mantle perp with $${allocatedUsd} collateral`);

  const position = await openPerpPosition(
    process.env.PRIVATE_KEY_PYTHIA!,
    proposal,
    allocatedUsd,
    "pythia",
  );

  if (!position) {
    return { ok: false, reason: "perp_open_failed" };
  }

  return { ok: true, position };
}
