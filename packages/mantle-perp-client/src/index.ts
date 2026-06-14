/**
 * Real on-chain perp client for Mantle Sepolia.
 *
 * Opens and closes positions on the MantleOraclePerp contract, settled against the
 * REAL Pyth oracle live on Mantle Sepolia (0x98046Bd2...). Prices are pulled from the
 * Pyth Hermes service and posted on-chain in the same transaction, so every fill uses
 * a fresh, real oracle price. No off-chain exchange, no simulation.
 *
 * Env: MANTLE_RPC_URL, PYTH_ADDRESS, PERP_ADDRESS, USDC_ADDRESS, PYTH_HERMES_URL.
 */
import { ethers } from "ethers";
import { AgentProposal } from "@pantheon/shared";

const HERMES_URL = process.env.PYTH_HERMES_URL ?? "https://hermes.pyth.network";
const DEFAULT_LEVERAGE = Number(process.env.PERP_LEVERAGE ?? "2");

// Pyth price feed IDs (identical across all chains). Source: pyth.network price-feed-ids.
const FEED_IDS: Record<string, string> = {
  ETH: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  BTC: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  SOL: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  MNT: "0x4e3037c822d852d79af3ac80e35eb420ee3b870dca49f9344a38ef4773fb0585",
};

const PYTH_ABI = [
  "function getUpdateFee(bytes[] updateData) view returns (uint256)",
] as const;

const PERP_ABI = [
  "function openPosition(bytes32 priceId, uint256 collateral, uint256 sizeUsd, bool isLong, bytes[] priceUpdate) payable returns (uint256 id)",
  "function closePosition(uint256 id, bytes[] priceUpdate) payable",
  "event PositionOpened(uint256 indexed id, address indexed trader, bytes32 priceId, uint256 entryPrice, uint256 sizeUsd, uint256 collateral, bool isLong)",
  "event PositionClosed(uint256 indexed id, address indexed trader, uint256 exitPrice, int256 pnl, uint256 payout)",
] as const;

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
] as const;

export type PerpPosition = {
  positionId: bigint;
  entryPrice: bigint;
  isLong: boolean;
  coin: string;
  priceId: string;
};

export function parseCoin(tradeIdea: string): string {
  const m = tradeIdea.match(/\b(ETH|BTC|SOL|MNT)\b/i);
  return m ? m[1].toUpperCase() : "ETH";
}

function feedFor(coin: string): string {
  return FEED_IDS[coin] ?? FEED_IDS.ETH;
}

/** Fetch a fresh Pyth price update blob for `feedId` from Hermes (hex, ready for on-chain). */
async function fetchPythUpdate(feedId: string): Promise<string> {
  const id = feedId.startsWith("0x") ? feedId.slice(2) : feedId;
  const url = `${HERMES_URL}/v2/updates/price/latest?ids[]=${id}&encoding=hex`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Hermes ${resp.status} for ${id}`);
  const json = (await resp.json()) as { binary: { data: string[] } };
  const data = json.binary?.data?.[0];
  if (!data) throw new Error("Hermes returned no update data");
  return data.startsWith("0x") ? data : "0x" + data;
}

function clients(privateKey: string) {
  const provider = new ethers.JsonRpcProvider(process.env.MANTLE_RPC_URL!);
  const wallet = new ethers.Wallet(privateKey, provider);
  const perp = new ethers.Contract(process.env.PERP_ADDRESS!, PERP_ABI, wallet);
  const pyth = new ethers.Contract(process.env.PYTH_ADDRESS!, PYTH_ABI, provider);
  return { provider, wallet, perp, pyth };
}

async function ensureApproval(wallet: ethers.Wallet) {
  const usdc = new ethers.Contract(process.env.USDC_ADDRESS!, ERC20_ABI, wallet);
  const allowance: bigint = await usdc.allowance(wallet.address, process.env.PERP_ADDRESS!);
  if (allowance < ethers.MaxUint256 / 2n) {
    await (await usdc.approve(process.env.PERP_ADDRESS!, ethers.MaxUint256)).wait();
  }
}

/**
 * Open a real perp position. collateral = allocatedUsd; notional = allocatedUsd * leverage.
 * Returns null on any failure (caller treats as unfilled).
 */
export async function openPerpPosition(
  privateKey: string,
  proposal: AgentProposal,
  allocatedUsd: number,
  agentName: string,
): Promise<PerpPosition | null> {
  const tag = `[${agentName}][perp]`;
  try {
    const { wallet, perp, pyth } = clients(privateKey);
    const coin = parseCoin(proposal.tradeIdea);
    const priceId = feedFor(coin);
    const isLong = proposal.action !== "short";

    const collateral = BigInt(Math.floor(allocatedUsd * 1_000_000));
    const sizeUsd = collateral * BigInt(Math.max(1, Math.min(10, Math.floor(DEFAULT_LEVERAGE))));

    await ensureApproval(wallet);

    const update = await fetchPythUpdate(priceId);
    const fee: bigint = await pyth.getUpdateFee([update]);

    const tx = await perp.openPosition(priceId, collateral, sizeUsd, isLong, [update], { value: fee });
    const receipt = await tx.wait();

    // Parse PositionOpened for the id + entry price.
    const iface = new ethers.Interface(PERP_ABI as unknown as string[]);
    for (const log of receipt!.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed?.name === "PositionOpened") {
          console.log(`${tag} opened #${parsed.args.id} ${isLong ? "LONG" : "SHORT"} ${coin} entry=${parsed.args.entryPrice} (tx ${receipt!.hash})`);
          return { positionId: parsed.args.id, entryPrice: parsed.args.entryPrice, isLong, coin, priceId };
        }
      } catch { /* not our event */ }
    }
    console.warn(`${tag} open tx mined but no PositionOpened event`);
    return null;
  } catch (err) {
    console.warn(`${tag} open failed: ${(err as Error).message?.slice(0, 120)}`);
    return null;
  }
}

/**
 * Close a real perp position. Returns realized PnL in USD (signed), read from the
 * on-chain PositionClosed event. Returns null on failure.
 */
export async function closePerpPosition(
  privateKey: string,
  position: PerpPosition,
  agentName: string,
): Promise<number | null> {
  const tag = `[${agentName}][perp]`;
  try {
    const { perp, pyth } = clients(privateKey);
    const update = await fetchPythUpdate(position.priceId);
    const fee: bigint = await pyth.getUpdateFee([update]);

    const tx = await perp.closePosition(position.positionId, [update], { value: fee });
    const receipt = await tx.wait();

    const iface = new ethers.Interface(PERP_ABI as unknown as string[]);
    for (const log of receipt!.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed?.name === "PositionClosed") {
          const pnlUsd = Number(parsed.args.pnl) / 1_000_000;
          console.log(`${tag} closed #${position.positionId} exit=${parsed.args.exitPrice} pnl=$${pnlUsd.toFixed(4)} (tx ${receipt!.hash})`);
          return pnlUsd;
        }
      } catch { /* not our event */ }
    }
    console.warn(`${tag} close tx mined but no PositionClosed event`);
    return null;
  } catch (err) {
    console.warn(`${tag} close failed: ${(err as Error).message?.slice(0, 120)}`);
    return null;
  }
}
