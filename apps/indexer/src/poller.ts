import { ethers } from "ethers";
import { PantheonVaultABI } from "@pantheon/shared/abis";
import { insertDeposit, insertAllocation, insertSettlement, hasTxHash } from "./db.js";
import { broadcast } from "./server.js";
import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

const ADDRESS_TO_ID: Record<string, string> = {
  [process.env.AGENT_ADDRESS_HERMES?.toLowerCase() ?? ""]: "hermes",
  [process.env.AGENT_ADDRESS_PYTHIA?.toLowerCase() ?? ""]: "pythia",
  [process.env.AGENT_ADDRESS_DEMETER?.toLowerCase() ?? ""]: "demeter",
};

// Mantle Sepolia testnet limits eth_getLogs to a 10,000 block range — paginate in chunks.
const BACKFILL_CHUNK = 9000;
// How far back the initial backfill scans. Kept small so the public RPC isn't hammered
// with dozens of rate-limited getLogs calls (which would abort the whole backfill and
// leave the deposits table empty). Override with INDEXER_BACKFILL_BLOCKS.
const BACKFILL_BLOCKS = Number(process.env.INDEXER_BACKFILL_BLOCKS ?? 30_000);
// Mantle Sepolia may drop eth_newFilter subscriptions ("filter not found"), so contract.on()
// never delivers live events. We poll forward with getLogs instead.
const POLL_MS = Number(process.env.INDEXER_POLL_MS ?? 12_000);
// Spacing between getLogs calls so the public RPC's rate limiter doesn't trip.
const CALL_GAP_MS = Number(process.env.INDEXER_CALL_GAP_MS ?? 400);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function queryChunked(vault: ethers.Contract, filter: ethers.ContractEventName, from: number, to: number): Promise<ethers.EventLog[]> {
  const results: ethers.EventLog[] = [];
  for (let start = from; start <= to; start += BACKFILL_CHUNK) {
    const end = Math.min(start + BACKFILL_CHUNK - 1, to);
    // Tolerate a rate-limited/failed chunk: log and continue so one bad call doesn't
    // abort the entire backfill (which previously stuck lastBlock at 0 forever).
    try {
      const chunk = await vault.queryFilter(filter, start, end) as ethers.EventLog[];
      if (chunk.length) results.push(...chunk);
    } catch (err) {
      console.warn(`[indexer] getLogs ${start}-${end} failed (skip): ${(err as Error).message?.slice(0, 60)}`);
    }
    await sleep(CALL_GAP_MS);
  }
  return results;
}

// Insert + (optionally) broadcast a batch of events. Dedups by tx hash so a
// re-scanned block range never double-counts. `live` controls WS broadcast —
// off during the initial backfill (no clients care about history replay),
// on during forward polling so the dashboard updates in real time.
function ingest(
  deposited: ethers.EventLog[],
  allocated: ethers.EventLog[],
  settled: ethers.EventLog[],
  live: boolean,
): { d: number; a: number; s: number } {
  let d = 0, a = 0, s = 0;
  const now = () => Math.floor(Date.now() / 1000);

  for (const e of deposited) {
    if (hasTxHash.get(e.transactionHash)) continue;
    const [wallet, amount, shares] = e.args;
    insertDeposit.run(wallet, Number(amount), Number(shares), e.transactionHash, now());
    if (live) broadcast({ event: "deposit", data: { wallet, amount: Number(amount), shares: Number(shares) } });
    d++;
  }
  for (const e of allocated) {
    if (hasTxHash.get(e.transactionHash)) continue;
    const [agent, amount, cycleId] = e.args;
    const agentId = ADDRESS_TO_ID[String(agent).toLowerCase()];
    if (!agentId) continue;
    insertAllocation.run(agentId, Number(amount), Number(cycleId), e.transactionHash, now());
    if (live) broadcast({ event: "allocation", data: { agentId, amount: Number(amount), cycleId: Number(cycleId) } });
    a++;
  }
  for (const e of settled) {
    if (hasTxHash.get(e.transactionHash)) continue;
    const [agent, pnl, totalAssets] = e.args;
    const agentId = ADDRESS_TO_ID[String(agent).toLowerCase()];
    if (!agentId) continue;
    insertSettlement.run(agentId, Number(pnl), Number(totalAssets), e.transactionHash, now());
    if (live) broadcast({ event: "settlement", data: { agentId, pnl: Number(pnl), totalAssets: Number(totalAssets) } });
    s++;
  }
  return { d, a, s };
}

async function scan(vault: ethers.Contract, from: number, to: number, live: boolean) {
  // Sequential (not Promise.all) to avoid a 3x burst of getLogs that trips rate limits.
  const deposited = await queryChunked(vault, vault.filters.Deposited(), from, to);
  const allocated = await queryChunked(vault, vault.filters.Allocated(), from, to);
  const settled = await queryChunked(vault, vault.filters.Settled(), from, to);
  return ingest(deposited, allocated, settled, live);
}

export function startPolling(): void {
  const provider = new ethers.JsonRpcProvider(process.env.MANTLE_RPC_URL!);
  const vault = new ethers.Contract(process.env.VAULT_ADDRESS!, PantheonVaultABI as ethers.InterfaceAbi, provider);

  let lastBlock = 0;
  let scanning = false;

  async function tick() {
    if (scanning) return;
    scanning = true;
    try {
      const head = await provider.getBlockNumber();
      if (lastBlock === 0) {
        // Initial backfill: a bounded recent window, no broadcast.
        const from = Math.max(0, head - BACKFILL_BLOCKS);
        console.log(`[indexer] backfilling vault events (blocks ${from}-${head})...`);
        const { d, a, s } = await scan(vault, from, head, false);
        console.log(`[indexer] backfill done — ${d} deposits, ${a} allocations, ${s} settlements`);
      } else if (head > lastBlock) {
        // Forward poll: only new blocks, broadcast live so the dashboard updates.
        const { d, a, s } = await scan(vault, lastBlock + 1, head, true);
        if (d || a || s) console.log(`[indexer] live: +${d} deposits, +${a} allocations, +${s} settlements`);
      }
      lastBlock = head;
    } catch (err) {
      console.warn("[indexer] poll error (will retry):", (err as Error).message?.slice(0, 80));
    } finally {
      scanning = false;
    }
  }

  void tick();
  setInterval(() => void tick(), POLL_MS);
  console.log(`[indexer] polling Mantle Sepolia events via getLogs every ${POLL_MS}ms`);
}
