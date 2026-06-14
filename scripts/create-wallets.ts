/**
 * Generates fresh local EVM EOAs for the allocator + three agents and writes their
 * private keys + addresses into .env. Mantle agents sign directly with ethers using
 * PRIVATE_KEY_* — no Circle / server-side signing.
 *
 * Usage: pnpm tsx scripts/create-wallets.ts
 *
 * After running: fund each printed address with test MNT from
 * https://faucet.sepolia.mantle.xyz (gas is paid in MNT on Mantle).
 *
 * Re-running is safe: existing PRIVATE_KEY and AGENT_ADDRESS lines are NOT overwritten
 * unless they are blank/placeholder, so you won't clobber funded wallets. Use --force
 * to regenerate all.
 */
import { ethers } from "ethers";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, "..", ".env");
const FORCE = process.argv.includes("--force");

type Slot = { keyVar: string; addrVar?: string; label: string };
const SLOTS: Slot[] = [
  { keyVar: "PRIVATE_KEY_ALLOCATOR", label: "allocator (also deployer)" },
  { keyVar: "PRIVATE_KEY_HERMES", addrVar: "AGENT_ADDRESS_HERMES", label: "hermes" },
  { keyVar: "PRIVATE_KEY_PYTHIA", addrVar: "AGENT_ADDRESS_PYTHIA", label: "pythia" },
  { keyVar: "PRIVATE_KEY_DEMETER", addrVar: "AGENT_ADDRESS_DEMETER", label: "demeter" },
];

function readEnv(): string[] {
  return existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8").replace(/\n$/, "").split("\n") : [];
}
function getVal(lines: string[], key: string): string | null {
  const line = lines.find(l => l.replace(/^#\s*/, "").startsWith(`${key}=`));
  if (!line) return null;
  const v = line.slice(line.indexOf("=") + 1).trim();
  return v;
}
function isPlaceholder(v: string | null): boolean {
  return !v || v === "" || v.includes("...") || v.startsWith("0x...");
}
function upsert(lines: string[], key: string, value: string): void {
  const idx = lines.findIndex(l => l.replace(/^#\s*/, "").startsWith(`${key}=`));
  if (idx >= 0) lines[idx] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
}

function main() {
  const lines = readEnv();
  const created: { label: string; address: string }[] = [];
  const kept: { label: string; address: string }[] = [];

  for (const slot of SLOTS) {
    const existing = getVal(lines, slot.keyVar);
    if (!FORCE && !isPlaceholder(existing)) {
      const addr = new ethers.Wallet(existing!).address;
      if (slot.addrVar) upsert(lines, slot.addrVar, addr);
      kept.push({ label: slot.label, address: addr });
      continue;
    }
    const w = ethers.Wallet.createRandom();
    upsert(lines, slot.keyVar, w.privateKey);
    if (slot.addrVar) upsert(lines, slot.addrVar, w.address);
    created.push({ label: slot.label, address: w.address });
  }

  writeFileSync(ENV_PATH, lines.join("\n") + "\n");

  console.log(`\nWrote keys/addresses to ${ENV_PATH}\n`);
  if (created.length) {
    console.log("Created:");
    for (const c of created) console.log(`  ${c.label.padEnd(24)} ${c.address}`);
  }
  if (kept.length) {
    console.log("Kept (already set — use --force to regenerate):");
    for (const k of kept) console.log(`  ${k.label.padEnd(24)} ${k.address}`);
  }
  console.log("\nFund EACH address with test MNT (gas): https://faucet.sepolia.mantle.xyz");
  console.log("Then: deploy → approve-vault → mint-usdc → preflight.");
}

main();
