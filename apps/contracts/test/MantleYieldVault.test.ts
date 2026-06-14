import { expect } from "chai";
import { ethers } from "hardhat";
import { MantleYieldVault, ERC20Mock } from "../typechain-types";

describe("MantleYieldVault", () => {
  let vault: MantleYieldVault;
  let usdc: ERC20Mock;
  let owner: any, user: any;

  const u = (n: string) => ethers.parseUnits(n, 6);

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    const Mock = await ethers.getContractFactory("ERC20Mock");
    usdc = await Mock.deploy("USD Coin", "USDC", 6) as ERC20Mock;
    const Vault = await ethers.getContractFactory("MantleYieldVault");
    vault = await Vault.deploy(await usdc.getAddress(), owner.address) as MantleYieldVault;

    await usdc.mint(owner.address, u("10000"));
    await usdc.mint(user.address, u("1000"));
    await usdc.connect(owner).approve(await vault.getAddress(), ethers.MaxUint256);
    await usdc.connect(user).approve(await vault.getAddress(), ethers.MaxUint256);
  });

  it("mints shares 1:1 on first deposit and redeems same without yield", async () => {
    await vault.connect(user).deposit(u("100"), user.address);
    expect(await vault.balanceOf(user.address)).to.equal(u("100"));
    expect(await vault.totalAssets()).to.equal(u("100"));
  });

  it("funding rewards does NOT instantly inflate share price", async () => {
    await vault.connect(user).deposit(u("100"), user.address);
    await vault.connect(owner).fundRewards(u("50"));
    // reserve is locked → totalAssets still 100
    expect(await vault.totalAssets()).to.equal(u("100"));
    expect(await vault.rewardReserve()).to.equal(u("50"));
  });

  it("streams real yield over time and redeems for more than deposited", async () => {
    await vault.connect(user).deposit(u("100"), user.address);
    await vault.connect(owner).fundRewards(u("100"));
    // 1 USDC/sec
    await vault.connect(owner).setRewardRate(u("1"));

    await ethers.provider.send("evm_increaseTime", [10]);
    await ethers.provider.send("evm_mine", []);

    const assets = await vault.totalAssets();
    expect(assets).to.be.greaterThan(u("100"));        // yield accrued
    expect(assets).to.be.lessThanOrEqual(u("210"));     // bounded by 100 principal + 100 reserve

    const before = await usdc.balanceOf(user.address);
    await vault.connect(user).redeem(await vault.balanceOf(user.address), user.address, user.address);
    const gained = (await usdc.balanceOf(user.address)) - before;
    expect(gained).to.be.greaterThan(u("100"));         // got back more than deposited
  });

  it("never streams more yield than the funded reserve", async () => {
    await vault.connect(user).deposit(u("100"), user.address);
    await vault.connect(owner).fundRewards(u("5"));
    await vault.connect(owner).setRewardRate(u("1")); // 1/sec → would exceed 5 quickly

    await ethers.provider.send("evm_increaseTime", [1000]);
    await ethers.provider.send("evm_mine", []);

    // totalAssets capped at principal + full reserve = 105
    expect(await vault.totalAssets()).to.equal(u("105"));
    expect(await vault.rewardReserve()).to.be.lessThanOrEqual(u("5"));
  });

  it("only owner can fund rewards / set rate", async () => {
    await expect(vault.connect(user).fundRewards(u("1"))).to.be.reverted;
    await expect(vault.connect(user).setRewardRate(u("1"))).to.be.reverted;
  });
});
