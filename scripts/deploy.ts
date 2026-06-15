/**
 * Deploys the full Pantheon stack to Mantle Sepolia: PantheonVault, PantheonRegistry,
 * TraceAnchor, plus the real on-chain venues MantleYieldVault (ERC-4626) and
 * MantleOraclePerp (Pyth-settled). Registers agents, seeds the venues, and writes
 * the resulting addresses into .env and apps/dashboard/.env.local automatically.
 *
 * Run: cd apps/contracts && pnpm hardhat run ../../scripts/deploy.ts --network mantleSepolia
 */
import { ethers } from "hardhat";

// Real Pyth oracle on Mantle Sepolia (verified live). Override via PYTH_ADDRESS.
const PYTH_ADDRESS = process.env.PYTH_ADDRESS ?? "0x98046Bd286715D3B0BC227Dd7a956b83D8978603";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(__dirname, "..");

/** Upsert KEY=value lines in an env file: replace existing keys, append missing ones. */
function upsertEnv(filePath: string, kv: Record<string, string>): void {
  const lines = existsSync(filePath) ? readFileSync(filePath, "utf8").replace(/\n$/, "").split("\n") : [];
  for (const [key, value] of Object.entries(kv)) {
    const idx = lines.findIndex(l => l.replace(/^#\s*/, "").startsWith(`${key}=`));
    if (idx >= 0) lines[idx] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  }
  writeFileSync(filePath, lines.join("\n") + "\n");
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  let usdc = process.env.USDC_ADDRESS;
  if (!usdc || /^0x0+$/i.test(usdc)) {
    const Mock = await ethers.getContractFactory("ERC20PermitMock");
    const mock = await Mock.deploy("USD Coin", "USDC", 6);
    await mock.waitForDeployment();
    usdc = await mock.getAddress();
    console.log("Mock USDC deployed:", usdc);
  }
  const allocator = process.env.PRIVATE_KEY_ALLOCATOR
    ? new ethers.Wallet(process.env.PRIVATE_KEY_ALLOCATOR).address
    : deployer.address;

  const hermes = process.env.AGENT_ADDRESS_HERMES;
  const pythia  = process.env.AGENT_ADDRESS_PYTHIA;
  const demeter = process.env.AGENT_ADDRESS_DEMETER;

  if (!hermes || !pythia || !demeter) {
    throw new Error(
      "Set AGENT_ADDRESS_HERMES, AGENT_ADDRESS_PYTHIA, AGENT_ADDRESS_DEMETER in .env first.\n" +
      "Run: pnpm tsx scripts/create-wallets.ts"
    );
  }

  console.log("USDC:", usdc);
  console.log("Allocator:", allocator);
  console.log("Agents:", hermes, pythia, demeter);
  console.log();

  // 1. PantheonVault
  const Vault = await ethers.getContractFactory("PantheonVault");
  const vault = await Vault.deploy(usdc, allocator);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("PantheonVault deployed:", vaultAddress);

  // 2. PantheonRegistry
  const Registry = await ethers.getContractFactory("PantheonRegistry");
  const registry = await Registry.deploy(allocator);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("PantheonRegistry deployed:", registryAddress);

  // 3. TraceAnchor (registry-gated, current ABI)
  const Anchor = await ethers.getContractFactory("TraceAnchor");
  const anchor = await Anchor.deploy(await registry.getAddress());
  await anchor.waitForDeployment();
  const anchorAddress = await anchor.getAddress();
  console.log("TraceAnchor deployed:", anchorAddress);

  // 4. Register agents in PantheonRegistry
  console.log("\nRegistering agents...");
  for (const [name, addr] of [["Hermes", hermes], ["Pythia", pythia], ["Demeter", demeter]] as const) {
    const tx = await registry.registerAgent(addr);
    await tx.wait();
    console.log(`  Registered ${name}: ${addr}`);
  }

  // 5. MantleYieldVault (real ERC-4626) — demeter's yield venue
  const YieldVault = await ethers.getContractFactory("MantleYieldVault");
  const yieldVault = await YieldVault.deploy(usdc, deployer.address);
  await yieldVault.waitForDeployment();
  const yieldVaultAddress = await yieldVault.getAddress();
  console.log("MantleYieldVault deployed:", yieldVaultAddress);

  // 6. MantleOraclePerp (real Pyth-settled perp) — hermes/pythia's perp venue
  const Perp = await ethers.getContractFactory("MantleOraclePerp");
  const perp = await Perp.deploy(usdc, PYTH_ADDRESS, deployer.address);
  await perp.waitForDeployment();
  const perpAddress = await perp.getAddress();
  console.log("MantleOraclePerp deployed:", perpAddress, "(Pyth:", PYTH_ADDRESS + ")");

  // 7. Seed the venues with real USDC (mint to deployer when using mock USDC, then fund).
  //    Yield reserve: 5,000 USDC streamed at ~5.2% APY on a 100k base ≈ 0.000165 USDC/sec.
  //    Perp pool: 20,000 USDC to pay winning positions.
  try {
    const usdcToken = await ethers.getContractAt("ERC20PermitMock", usdc);
    const reserve = ethers.parseUnits("5000", 6);
    const pool = ethers.parseUnits("20000", 6);
    await (await usdcToken.mint(deployer.address, reserve + pool)).wait();
    await (await usdcToken.approve(yieldVaultAddress, reserve)).wait();
    await (await yieldVault.fundRewards(reserve)).wait();
    await (await yieldVault.setRewardRate(ethers.parseUnits("0.0002", 6))).wait(); // ~0.0002 USDC/sec
    await (await usdcToken.approve(perpAddress, pool)).wait();
    await (await perp.fundPool(pool)).wait();
    console.log("Seeded YieldVault reserve (5000) + Perp pool (20000) USDC");
  } catch (e) {
    console.warn("Venue seeding skipped (non-mock USDC or mint not permitted):", (e as Error).message?.slice(0, 80));
  }

  // 8. Write addresses into .env and apps/dashboard/.env.local
  const rootEnv = join(REPO_ROOT, ".env");
  upsertEnv(rootEnv, {
    VAULT_ADDRESS: vaultAddress,
    NEXT_PUBLIC_VAULT_ADDRESS: vaultAddress,
    REGISTRY_ADDRESS: registryAddress,
    ANCHOR_ADDRESS: anchorAddress,
    USDC_ADDRESS: usdc,
    NEXT_PUBLIC_USDC_ADDRESS: usdc,
    YIELD_VAULT_ADDRESS: yieldVaultAddress,
    PERP_ADDRESS: perpAddress,
    PYTH_ADDRESS: PYTH_ADDRESS,
  });
  console.log(`\nWrote addresses to ${rootEnv}`);

  const dashEnv = join(REPO_ROOT, "apps/dashboard/.env.local");
  upsertEnv(dashEnv, { NEXT_PUBLIC_VAULT_ADDRESS: vaultAddress, NEXT_PUBLIC_USDC_ADDRESS: usdc });
  console.log(`Wrote NEXT_PUBLIC_VAULT_ADDRESS to ${dashEnv}`);

  console.log("\nDeploy complete. Next: pnpm tsx scripts/preflight.ts");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
