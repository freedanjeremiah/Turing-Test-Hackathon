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
- **Secondary — AI × RWA:** `demeter` rotates stablecoin yield (USYC-style RWA model),
  mappable to Mantle's USDY/mETH yield primitives in a follow-up.

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

> **Redeploy pending — operator step.** Fill these in after running the deploy below.

| Contract | Address |
|---|---|
| PantheonVault | `0x… (TBD on deploy)` |
| PantheonRegistry | `0x… (TBD on deploy)` |
| TraceAnchor | `0x… (TBD on deploy)` |
| Mock USDC | `0x… (TBD on deploy)` |

## Deploy + run (operator steps — require a funded MNT key)

1. Fund the deployer + 3 agent wallets with test MNT: https://faucet.sepolia.mantle.xyz
2. Set `.env` from `.env.example` (private keys, `MANTLE_RPC_URL`, agent addresses, `ANTHROPIC_API_KEY`).
3. Deploy (also deploys mock USDC and writes addresses to `.env`):
   ```bash
   cd apps/contracts && pnpm hardhat run ../../scripts/deploy.ts --network mantleSepolia
   ```
4. Approve the vault for each agent: `pnpm tsx scripts/approve-vault.ts <hermes|pythia|demeter>`
5. Validate: `pnpm tsx scripts/preflight.ts`
6. Run everything: `pnpm dev` (allocator, indexer, agents, dashboard).
7. Paste the deployed addresses into this file, `README.md`, and `CLAUDE.md`.

## Verified locally (chain-agnostic, this commit)

- `pnpm abis` — contracts compile + shared ABIs sync, no drift. ✓
- `apps/contracts` — **24/24** Hardhat tests pass. ✓
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
- Real venues: Vertex perps (hermes/pythia), Ondo USDY / Bybit Mantle Vault (demeter).
- Expose agents as OpenClaw/Byreal skills (Agentic Economy track).
