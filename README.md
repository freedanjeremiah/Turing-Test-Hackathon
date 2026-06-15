<div align="center">

# Pantheon

### An autonomous, multi-agent hedge fund on Mantle

*Three AI agents compete for real on-chain capital. Every decision is published with its full reasoning. Risk is enforced by the contract, not by trust.*

[![Live demo](https://img.shields.io/badge/demo-live-2ea44f?style=flat-square)](https://pantheon-mantle.vercel.app)
[![Chain](https://img.shields.io/badge/chain-Mantle%20Sepolia%20·%205003-4f7cff?style=flat-square)](https://sepolia.mantlescan.xyz)
[![Settlement](https://img.shields.io/badge/settles%20in-USDC-2775ca?style=flat-square)](https://www.circle.com/usdc)
[![License](https://img.shields.io/badge/license-MIT-555?style=flat-square)](#license)

**[→ Open the live app](https://pantheon-mantle.vercel.app)** · Built for the Mantle "Turing Test" Hackathon 2026

</div>

---

## What it is

Pantheon is a single USDC vault on Mantle with three AI agents trading on top of it. Each cycle, every agent asks an LLM for a trade, publishes a proposal with a conviction score and a written rationale, and an off-chain allocator scores the proposals and moves real testnet USDC into the strongest ideas. Profit and loss settle back on-chain, in public. You can watch the agents reason, judge their track record, and back the fund yourself.

The point isn't "an AI that makes money." It's an agent-run fund you can **audit**: read why each call was made, verify it on-chain, and trust that risk limits are enforced by code.

| Agent | Beat | Venue |
|---|---|---|
| **Hermes** | Funding-rate arbitrage — long the cheap side, short the expensive side of perp funding | Hyperliquid testnet perps |
| **Pythia** | News-reactive ETH/BTC perp trader — reads Twitter + RSS, asks the model what it means | Hyperliquid testnet perps |
| **Demeter** | Stablecoin yield rotator — parks idle capital for yield while the others trade | USYC Teller on Mantle |

---

## Live deployment

| Surface | URL |
|---|---|
| **Dashboard** | https://pantheon-mantle.vercel.app |

**Network:** Mantle Sepolia testnet · chain ID `5003` · RPC `https://rpc.sepolia.mantle.xyz` · explorer [sepolia.mantlescan.xyz](https://sepolia.mantlescan.xyz)
Gas on Mantle Sepolia is paid in **MNT (18 dec)** — fund every wallet with test MNT from the [Mantle Sepolia faucet](https://faucet.sepolia.mantle.xyz). USDC is an ordinary 6-decimal ERC20 (deployed as a mock by `scripts/deploy.ts`).

---

## Deployed contracts (Mantle Sepolia)

All live on chain ID `5003` — verified on-chain.

| Contract | Address |
|---|---|
| PantheonVault | [`0x766B5739a28E47E942Fa2f378dAa60485D4deF2d`](https://sepolia.mantlescan.xyz/address/0x766B5739a28E47E942Fa2f378dAa60485D4deF2d) |
| PantheonRegistry | [`0xeF7b7b642C7d864caC4de7559c50339498728e64`](https://sepolia.mantlescan.xyz/address/0xeF7b7b642C7d864caC4de7559c50339498728e64) |
| TraceAnchor | [`0xdf3Eb178b6551EfBdC7b55cd6DE783eC099275e8`](https://sepolia.mantlescan.xyz/address/0xdf3Eb178b6551EfBdC7b55cd6DE783eC099275e8) |
| MantleYieldVault (ERC-4626) | [`0x89fcC094b966B3fc6dF162c6fa4185B13dc2582f`](https://sepolia.mantlescan.xyz/address/0x89fcC094b966B3fc6dF162c6fa4185B13dc2582f) |
| MantleOraclePerp | [`0xfd4816400b0a12fbEdc759d15141FdC5e411361b`](https://sepolia.mantlescan.xyz/address/0xfd4816400b0a12fbEdc759d15141FdC5e411361b) |
| Test USDC (6-decimal ERC20) | [`0x12515C5AC8a0eAc0A35c7f2154c2e1954F4Af372`](https://sepolia.mantlescan.xyz/address/0x12515C5AC8a0eAc0A35c7f2154c2e1954F4Af372) |
| Pyth oracle (live on Sepolia) | [`0x98046Bd286715D3B0BC227Dd7a956b83D8978603`](https://sepolia.mantlescan.xyz/address/0x98046Bd286715D3B0BC227Dd7a956b83D8978603) |

**Agent wallets** (registered in PantheonRegistry)

| Agent | Address |
|---|---|
| Hermes | [`0xb7484463aFa52fEbdEDA7175c70362e884beBc99`](https://sepolia.mantlescan.xyz/address/0xb7484463aFa52fEbdEDA7175c70362e884beBc99) |
| Pythia | [`0xAF34F92a0Ee45e64919FD226Eb09AA9c195ED33d`](https://sepolia.mantlescan.xyz/address/0xAF34F92a0Ee45e64919FD226Eb09AA9c195ED33d) |
| Demeter | [`0x76F948747134405d77759Dc0479dD5Ba599D25D8`](https://sepolia.mantlescan.xyz/address/0x76F948747134405d77759Dc0479dD5Ba599D25D8) |

---

## How it works

Each cycle (every ~20 minutes on the deployed config):

1. Each agent pulls its data source and asks **Claude** for a trade: an instrument, a direction, a size, a conviction score, and a written rationale.
2. The rationale is pinned to **IPFS** and forwarded to the indexer, so every decision is readable and attributable.
3. The proposal goes to the **allocator**, which scores all three:
   ```
   trades < 10:   score = 0.6·confidence + 0.4·diversification        (bootstrap)
   otherwise:     score = 0.5·sharpe + 0.3·confidence + 0.2·diversification
   ```
4. The allocator calls `PantheonVault.allocate()`, which transfers real testnet USDC to the winning agents. Weaker proposals keep a small consolation budget so they can build a track record.
5. Agents run their positions, then `PantheonVault.settle()` pulls the stake back plus or minus PnL.
6. **Risk is on-chain:** any agent down more than **5% in a day** is auto-sidelined by the contract and can't be funded again until the day resets.

```
                  ┌──────────────────────────────────────────────┐
                  │     Dashboard · Next.js + wagmi (Vercel)      │
                  │   Reasoning Desk · Standings · TVL · Invest   │
                  └───────────────────────┬──────────────────────┘
                                          │ REST + WebSocket
                  ┌───────────────────────┴──────────────────────┐
                  │     Indexer · ethers + node:sqlite            │
                  │     getLogs polling → REST/WS                 │
                  └───────────────────────┬──────────────────────┘
                                          │ reads events
   ┌──────────────────────────────────────┴───────────────────────┐
   │   PantheonVault · PantheonRegistry · TraceAnchor   (Mantle Sepolia testnet)  │
   └──────────────────────────────────────┬───────────────────────┘
                                          │ allocate / settle
                  ┌───────────────────────┴──────────────────────┐
                  │   Allocator · scores proposals, calls vault   │
                  └──────┬─────────────────┬─────────────────┬────┘
                     ┌───┴────┐       ┌────┴───┐       ┌─────┴────┐
                     │ Hermes │       │ Pythia │       │ Demeter  │
                     └────────┘       └────────┘       └──────────┘
```

---

## What's real vs simulated

Honest framing, because this runs on a testnet:

**Real and on-chain:** the vault and all custody, deposits, allocations, and settlements (real USDC transfers and share math); the daily loss cap and auto-sideline enforcement; agent reasoning (real LLM calls); the live indexer + dashboard; and market data (agents act on live Hyperliquid mark prices).

**Simulated on testnet:** perp **fills** are simulated at the live mark price (the agents hold no Hyperliquid L1 margin), and Demeter's USYC yield is modeled because the testnet Teller is access-gated. So PnL tracks real price movement on real on-chain capital, with no real fills or fees.

> The original design bridged USDC to HyperEVM via **CCTP V2** every cycle. Under deadline pressure we swapped it for pre-funded HyperEVM wallets (chain 998) after CCTP testnet latency caused stuck round-trips. The Mantle-side vault accounting stayed real.

---

## Monorepo layout

```
apps/
  contracts/      Hardhat — PantheonVault, PantheonRegistry, TraceAnchor (Solidity 0.8.24, OZ v5)
  allocator/      Node + Express — scores proposals, calls vault.allocate/settle
  agent-hermes/   funding-rate arbitrage agent
  agent-pythia/   news-reactive agent (Twitter + RSS)
  agent-demeter/  stablecoin yield agent (USYC)
  indexer/        ethers event poller + node:sqlite + REST + WebSocket
  dashboard/      Next.js 14 App Router + wagmi v2
packages/
  shared/         shared types + synced contract ABIs
  hl-client/      Hyperliquid client (EIP-712 signing)
scripts/          deploy, create-wallets, approve-vault, preflight, e2e
infra/            Docker Compose + Caddy (auto-TLS) for the backend
```

---

## Tech stack

| Layer | Tech |
|---|---|
| Contracts | Solidity 0.8.24, OpenZeppelin v5, Hardhat |
| Agents / services | Node.js, TypeScript, ethers v6, OpenAI SDK (gpt-4o-mini) |
| Indexer | `node:sqlite` (built-in, no native build), Express, `ws` |
| Frontend | Next.js 14 App Router, wagmi v2, viem v2, Tailwind v3, Recharts |
| Infra | Docker Compose + Caddy (backend VM), Vercel (dashboard) |
| Monorepo | pnpm workspaces + Turborepo |
| Chain | Mantle Sepolia testnet (`5003`), USDC-native gas |

---

## Run it locally

**Prerequisites:** Node.js ≥ 22.5 (the indexer uses the built-in `node:sqlite`), pnpm ≥ 11.

```bash
git clone <repo> && cd pantheon
pnpm install
cp .env.example .env     # add OPENAI_API_KEY and PINATA_JWT; contract addresses are prefilled
```

Start everything with Turborepo:

```bash
pnpm dev
```

Or run services individually:

```bash
cd apps/dashboard && pnpm dev    # http://localhost:3000
cd apps/indexer   && pnpm dev    # http://localhost:3002
cd apps/allocator && pnpm dev    # http://localhost:3001
cd apps/agent-hermes  && pnpm dev
cd apps/agent-pythia  && pnpm dev
cd apps/agent-demeter && pnpm dev
```

The dashboard degrades gracefully when the indexer or agents are offline. Trade execution is gated behind `ENABLE_REAL_TRADES=true` (default `false`: agents log what they would do without executing). Before a real bring-up, run `pnpm preflight` to validate env, RPC, contract wiring, and approvals.

Deploy contracts (already done on testnet; only needed for a fresh chain):

```bash
cd apps/contracts && pnpm hardhat run ../../scripts/deploy.ts --network mantleSepolia
```

---

## Safety

- Deposits are capped at **$100 per wallet**.
- On-chain daily loss cap of **−5%** per agent, enforced in `PantheonVault.settle()`; the vault is admin-pausable.
- Trade execution is off by default (`ENABLE_REAL_TRADES=false`).
- These are **unaudited hackathon contracts on a test network**. Testnet USDC has no real value. Don't deposit anything you can't afford to lose.

---

## License

MIT
