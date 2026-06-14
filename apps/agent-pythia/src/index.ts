import { fetchNewsHeadlines, StaleHeadlinesError } from "./data.js";
import { reason } from "./reason.js";
import { anchorTrace } from "./anchor.js";
import { submitProposal, reportSettlement, postStuck } from "./propose.js";
import { executePythiaTrade, PerpPosition } from "./execute.js";
import { closePerpPosition } from "@pantheon/mantle-perp-client";
import { AGENT_CYCLE_MS, PYTHIA_HOLD_MS } from "@pantheon/shared";

async function holdAndClose(position: PerpPosition, _allocatedUsd: number): Promise<number | null> {
  await new Promise(r => setTimeout(r, PYTHIA_HOLD_MS));
  // closePerpPosition returns realized PnL in USD straight from the on-chain event.
  return closePerpPosition(process.env.PRIVATE_KEY_PYTHIA!, position, "pythia");
}

async function cycle(): Promise<void> {
  console.log(`[pythia] cycle start ${new Date().toISOString()}`);
  try {
    let news;
    try {
      news = await fetchNewsHeadlines();
    } catch (err) {
      if (err instanceof StaleHeadlinesError) {
        console.warn(`[pythia] skipping cycle: ${err.message}`);
        return;
      }
      throw err;
    }

    const proposal = await reason(news);
    if (proposal.action === "hold") {
      console.log("[pythia] holding this cycle");
      return;
    }

    const { cid, hash } = await anchorTrace(
      { proposal, news },
      proposal.tradeIdea,
      proposal.confidence,
    );

    const { reasoning, ...clean } = proposal;
    clean.reasoningTraceCid = cid;
    clean.reasoningHash = hash;
    clean.timestamp = Math.floor(Date.now() / 1000);

    await submitProposal(clean);
    console.log(`[pythia] submitted: ${clean.tradeIdea}`);

    await new Promise(r => setTimeout(r, 70_000));

    const { ethers } = await import("ethers");
    const pythiaAddress = new ethers.Wallet(process.env.PRIVATE_KEY_PYTHIA!).address;
    const { readAllocatedUsdc } = await import("./vault-read.js");
    const allocatedUsd = await readAllocatedUsdc(pythiaAddress);
    if (allocatedUsd <= 0) {
      console.log(`[pythia] not allocated this cycle (alloc=${allocatedUsd}); skipping execute`);
      return;
    }

    const exec = await executePythiaTrade(clean, allocatedUsd);
    if (!exec.ok) {
      if (exec.reason === "real_trades_disabled") return;
      console.warn(`[pythia] execute failed: ${exec.reason}`);
      await postStuck("pythia", `execute:${exec.reason}`);
      return;
    }

    const pnlUsd = await holdAndClose(exec.position, allocatedUsd);
    if (pnlUsd === null) {
      await postStuck("pythia", "perp_close_failed");
      return;
    }
    console.log(`[pythia] real Mantle perp PnL: $${pnlUsd.toFixed(4)}`);

    await reportSettlement("pythia", pnlUsd);
    console.log(`[pythia] settlement reported: $${pnlUsd.toFixed(4)}`);
  } catch (err) {
    console.error(`[pythia] cycle error:`, err);
    await postStuck("pythia", `unhandled:${(err as Error).message?.slice(0, 80) ?? "unknown"}`).catch(() => {});
  }
}

cycle();
setInterval(cycle, AGENT_CYCLE_MS);
