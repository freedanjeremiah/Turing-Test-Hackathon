import { expect } from "chai";
import { ethers } from "hardhat";
import { MantleOraclePerp, ERC20Mock, MockPyth } from "../typechain-types";

describe("MantleOraclePerp", () => {
  let perp: MantleOraclePerp;
  let usdc: ERC20Mock;
  let pyth: MockPyth;
  let owner: any, trader: any;

  const u = (n: string) => ethers.parseUnits(n, 6);
  const ETH_USD = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

  async function now(): Promise<number> {
    const b = await ethers.provider.getBlock("latest");
    return b!.timestamp;
  }

  // Build a single Pyth update for ETH_USD at `price` (expo -8).
  async function update(price: bigint) {
    const publishTime = await now();
    return pyth.createPriceFeedUpdateData(
      ETH_USD,
      price,          // price
      10n,            // conf
      -8,             // expo
      price,          // emaPrice
      10n,            // emaConf
      publishTime,
      publishTime - 1 // prevPublishTime
    );
  }

  async function feeFor(data: string): Promise<bigint> {
    return pyth.getUpdateFee([data]);
  }

  beforeEach(async () => {
    [owner, trader] = await ethers.getSigners();
    const Mock = await ethers.getContractFactory("ERC20Mock");
    usdc = await Mock.deploy("USD Coin", "USDC", 6) as ERC20Mock;
    const Pyth = await ethers.getContractFactory("MockPyth");
    pyth = await Pyth.deploy(60, 1) as MockPyth; // validTimePeriod 60s, fee 1 wei
    const Perp = await ethers.getContractFactory("MantleOraclePerp");
    perp = await Perp.deploy(await usdc.getAddress(), await pyth.getAddress(), owner.address) as MantleOraclePerp;

    await usdc.mint(owner.address, u("100000"));
    await usdc.mint(trader.address, u("10000"));
    await usdc.connect(owner).approve(await perp.getAddress(), ethers.MaxUint256);
    await usdc.connect(trader).approve(await perp.getAddress(), ethers.MaxUint256);
    // seed liquidity pool that pays winners
    await perp.connect(owner).fundPool(u("50000"));
  });

  it("a winning long pays out collateral + real PnL from price move", async () => {
    // entry at $2000 (2000e8)
    const d1 = await update(2000n * 10n ** 8n);
    await perp.connect(trader).openPosition(ETH_USD, u("100"), u("1000"), true, [d1], { value: await feeFor(d1) });

    const before = await usdc.balanceOf(trader.address);

    // exit at $2200 → +10% on $1000 notional = +$100
    const d2 = await update(2200n * 10n ** 8n);
    await perp.connect(trader).closePosition(1, [d2], { value: await feeFor(d2) });

    const gained = (await usdc.balanceOf(trader.address)) - before;
    // payout = collateral 100 + gain 100 = 200
    expect(gained).to.equal(u("200"));
  });

  it("a losing long loses (capped at collateral)", async () => {
    const d1 = await update(2000n * 10n ** 8n);
    await perp.connect(trader).openPosition(ETH_USD, u("100"), u("1000"), true, [d1], { value: await feeFor(d1) });
    const before = await usdc.balanceOf(trader.address);

    // exit at $1800 → -10% on $1000 = -$100 = full collateral
    const d2 = await update(1800n * 10n ** 8n);
    await perp.connect(trader).closePosition(1, [d2], { value: await feeFor(d2) });

    const gained = (await usdc.balanceOf(trader.address)) - before;
    expect(gained).to.equal(0n); // collateral wiped, capped
  });

  it("a winning short profits when price falls", async () => {
    const d1 = await update(2000n * 10n ** 8n);
    await perp.connect(trader).openPosition(ETH_USD, u("100"), u("1000"), false, [d1], { value: await feeFor(d1) });
    const before = await usdc.balanceOf(trader.address);

    const d2 = await update(1900n * 10n ** 8n); // -5% → short gains $50
    await perp.connect(trader).closePosition(1, [d2], { value: await feeFor(d2) });

    const gained = (await usdc.balanceOf(trader.address)) - before;
    expect(gained).to.equal(u("150")); // 100 collateral + 50 gain
  });

  it("rejects over-leverage and non-trader close", async () => {
    const d1 = await update(2000n * 10n ** 8n);
    await expect(
      perp.connect(trader).openPosition(ETH_USD, u("100"), u("2000"), true, [d1], { value: await feeFor(d1) })
    ).to.be.revertedWithCustomError(perp, "BadLeverage"); // 2000 > 100*10

    const d2 = await update(2000n * 10n ** 8n);
    await perp.connect(trader).openPosition(ETH_USD, u("100"), u("500"), true, [d2], { value: await feeFor(d2) });
    const d3 = await update(2000n * 10n ** 8n);
    await expect(
      perp.connect(owner).closePosition(1, [d3], { value: await feeFor(d3) })
    ).to.be.revertedWithCustomError(perp, "NotTrader");
  });
});
