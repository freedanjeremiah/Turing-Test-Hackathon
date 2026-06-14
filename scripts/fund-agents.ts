/**
 * Sends native MNT gas from the allocator wallet to each agent wallet.
 *
 * Usage: pnpm tsx scripts/fund-agents.ts [amountMnt]   (default 1)
 * Needs MANTLE_RPC_URL, PRIVATE_KEY_ALLOCATOR, AGENT_ADDRESS_HERMES/PYTHIA/DEMETER.
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const amount = process.argv[2] ?? "1";
  const rpc = process.env.MANTLE_RPC_URL ?? "https://rpc.sepolia.mantle.xyz";
  const pk = process.env.PRIVATE_KEY_ALLOCATOR;
  if (!pk) throw new Error("Missing PRIVATE_KEY_ALLOCATOR");

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(pk, provider);

  const net = await provider.getNetwork();
  const bal = await provider.getBalance(wallet.address);
  console.log(`Network chainId: ${net.chainId}`);
  console.log(`Allocator ${wallet.address} balance: ${ethers.formatEther(bal)} MNT`);

  const recipients: [string, string | undefined][] = [
    ["hermes", process.env.AGENT_ADDRESS_HERMES],
    ["pythia", process.env.AGENT_ADDRESS_PYTHIA],
    ["demeter", process.env.AGENT_ADDRESS_DEMETER],
  ];
  for (const [, addr] of recipients) if (!addr) throw new Error("Missing an AGENT_ADDRESS_* in .env");

  const each = ethers.parseEther(amount);
  const need = each * 3n;
  if (bal < need) {
    throw new Error(`Allocator has ${ethers.formatEther(bal)} MNT, need at least ${ethers.formatEther(need)} (+gas). Fund it first: https://faucet.sepolia.mantle.xyz`);
  }

  for (const [name, addr] of recipients) {
    const tx = await wallet.sendTransaction({ to: addr!, value: each });
    const r = await tx.wait();
    console.log(`Sent ${amount} MNT → ${name} ${addr} (tx ${r?.hash})`);
  }

  console.log("\nBalances after:");
  for (const [name, addr] of recipients) {
    console.log(`  ${name.padEnd(8)} ${ethers.formatEther(await provider.getBalance(addr!))} MNT`);
  }
  console.log(`  allocator ${ethers.formatEther(await provider.getBalance(wallet.address))} MNT`);
}

main().catch(err => { console.error(err.message ?? err); process.exit(1); });
