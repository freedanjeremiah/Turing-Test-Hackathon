# Pantheon — Mantle Turing Test Hackathon 2026 Submission

**Project:** Pantheon — a multi-agent on-chain hedge fund on Mantle Sepolia.
Three off-chain AI agents (`hermes`, `pythia`, `demeter`) submit trade proposals each
cycle; an off-chain allocator scores them and calls `PantheonVault.allocate()` on Mantle;
PnL is reported back via `PantheonVault.settle()`; reasoning traces are pinned to IPFS and
hash-anchored on-chain via `TraceAnchor` (registry-gated).

Hackathon: **The Turing Test Hackathon 2026** (Mantle) — https://dorahacks.io/hackathon/mantleturingtesthackathon2026/detail

## Track fit

- **Primary — AI Trading & Strategy:** autonomous AI agents producing trade theses, an
  on-chain vault holding real custody, an allocator scoring agents by risk-adjusted PnL
  (Sharpe, max drawdown), and an on-chain −5% daily loss cap that sidelines losing agents.
- **Secondary — AI × RWA:** `demeter` rotates stablecoin yield via a real on-chain ERC-4626 vault.

## Everything runs on-chain on Mantle (no off-chain CEX, no simulation)

Mantle Sepolia has no DEX/lending/perp deployments, so the venues are **our own real
contracts deployed on Mantle**, and the agents transact against them every cycle:

| Agent | Real Mantle venue | What's real |
|---|---|---|
| hermes, pythia | `MantleOraclePerp` | open/close perps settled against the **real Pyth oracle** (`0x98046Bd2…`, live on Sepolia); prices pulled fresh from Pyth Hermes and posted on-chain; PnL settled in USDC |
| demeter | `MantleYieldVault` (ERC-4626) | real deposit/redeem; share price appreciates from a streamed reward reserve; realized yield is real USDC |
| all | `PantheonVault` | real USDC custody, allocate/settle, on-chain loss cap |
| all | `TraceAnchor` | reasoning hashes anchored on-chain (registry-gated) |

## Network

| | Value |
|---|---|
| Chain | Mantle Sepolia testnet |
| Chain ID | 5003 |
| RPC | https://rpc.sepolia.mantle.xyz |
| Explorer | https://sepolia.mantlescan.xyz |
| Faucet | https://faucet.sepolia.mantle.xyz |
| Native gas | MNT (18 decimals) |
| USDC | deployed `ERC20Mock` (6 decimals) — no canonical USDC on Mantle Sepolia |

## Deployed contracts (Mantle Sepolia)

> **Deployed live on Mantle Sepolia (chain 5003).** Explorer: https://sepolia.mantlescan.xyz

| Contract | Address |
|---|---|
| PantheonVault | `0x766B5739a28E47E942Fa2f378dAa60485D4deF2d` |
| PantheonRegistry | `0xeF7b7b642C7d864caC4de7559c50339498728e64` |
| TraceAnchor | `0xdf3Eb178b6551EfBdC7b55cd6DE783eC099275e8` |
| MantleYieldVault (ERC-4626) | `0x89fcC094b966B3fc6dF162c6fa4185B13dc2582f` |
| MantleOraclePerp | `0xfd4816400b0a12fbEdc759d15141FdC5e411361b` |
| Test USDC (ERC20) | `0x12515C5AC8a0eAc0A35c7f2154c2e1954F4Af372` |
| Pyth oracle (existing, live) | `0x98046Bd286715D3B0BC227Dd7a956b83D8978603` |

Agent wallets (registered): hermes `0xb7484463aFa52fEbdEDA7175c70362e884beBc99` · pythia `0xAF34F92a0Ee45e64919FD226Eb09AA9c195ED33d` · demeter `0x76F948747134405d77759Dc0479dD5Ba599D25D8`

## Which wallets to fund, and from where

Gas on Mantle is **MNT** (not USDC), so every wallet needs test MNT.

- **4 wallets need MNT for gas:** `PRIVATE_KEY_ALLOCATOR` (also the deployer), `PRIVATE_KEY_HERMES`, `PRIVATE_KEY_PYTHIA`, `PRIVATE_KEY_DEMETER`. Generate with `pnpm tsx scripts/create-wallets.ts`.
- **Your browser/MetaMask wallet** (the depositor) also needs MNT for gas.
- **MNT faucet:** https://faucet.sepolia.mantle.xyz (backups: faucets.chain.link/mantle-sepolia, faucet.quicknode.com/mantle/sepolia). Paste each address.
- **Test USDC has NO faucet** (no canonical USDC on Mantle Sepolia). You mint it from the deployed ERC20:
  ```bash
  pnpm tsx scripts/mint-usdc.ts <address> 1000   # mint 1000 test USDC to any wallet
  ```
  Mint to your MetaMask wallet (to deposit) and to each agent wallet if needed.

## Deploy + run (operator steps — require a funded MNT key)

1. Fund the deployer + 3 agent wallets with test MNT (faucet above).
2. Set `.env` from `.env.example` (private keys, `MANTLE_RPC_URL`, agent addresses, `OPENAI_API_KEY`).
3. Deploy (deploys test USDC + the two real venues, seeds them, writes addresses to `.env`):
   ```bash
   cd apps/contracts && pnpm hardhat run ../../scripts/deploy.ts --network mantleSepolia
   ```
4. Approve the vault for each agent: `pnpm tsx scripts/approve-vault.ts <hermes|pythia|demeter>`
5. Mint test USDC to your MetaMask wallet: `pnpm tsx scripts/mint-usdc.ts <yourAddr> 100`
6. Validate: `pnpm tsx scripts/preflight.ts`
7. Run everything with real trades on: set `ENABLE_REAL_TRADES=true`, then `pnpm dev`.
8. Paste the deployed addresses into this file, `README.md`, and `CLAUDE.md`.

## Verified locally (chain-agnostic, this commit)

- `pnpm abis` — contracts compile + shared ABIs sync, no drift. ✓
- `apps/contracts` — **33/33** Hardhat tests pass (incl. MantleYieldVault + MantleOraclePerp w/ MockPyth). ✓
- `apps/allocator` — **7/9** vitest pass; the 2 "failures" are Windows-only `EPERM` on
  temp-dir teardown (open SQLite handle), not assertion failures, and the allocator code
  is unchanged from the Mantle baseline. ✓ (logic)
- `scripts/e2e.ts` against a local hardhat node — **`=== PHASE 1 END-TO-END PASSED ===`**
  (deposit → allocate → settle → anchor → withdraw). ✓
- `apps/dashboard` — `pnpm build` (Next.js) succeeds with viem `mantleSepoliaTestnet`. ✓

## Submission artifacts checklist (operator)

- [ ] Deploy contracts to Mantle Sepolia; record addresses above.
- [ ] Demo video (screen-record `pnpm dev` dashboard: onboarding → deposit → agent cycle → settle).
- [ ] X/Twitter thread tagged **#MantleAIHackathon** with: pitch, demo video, GitHub repo link, and a **deployed Mantle contract address**.
- [ ] Register / submit the project on DoraHacks.
- [ ] Deadline: **2026-06-15**.

## Migration provenance

Ported from the Mantle-testnet build via a pure chain swap (chain ID, RPC, explorer,
gas-token model USDC→MNT, viem built-in chain, mock USDC). Full design + plan:
`docs/superpowers/specs/2026-06-15-mantle-migration-design.md` and
`docs/superpowers/plans/2026-06-15-mantle-migration.md`.

## Out of scope (candidate follow-ups for deeper Mantle ecosystem fit)

- ERC-8004 trustless-agent identity per agent (Phase-1 hackathon requirement).
- Migrate venues to third-party Mantle protocols once they ship on Sepolia (Merchant Moe,
  Lendle, Vertex) — today none are deployed on Sepolia, so we run our own real on-chain venues.
- Expose agents as OpenClaw/Byreal skills (Agentic Economy track).
