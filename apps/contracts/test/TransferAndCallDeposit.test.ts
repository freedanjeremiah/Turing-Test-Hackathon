import { expect } from "chai";
import { ethers } from "hardhat";
import { PantheonVault, ERC20PermitMock } from "../typechain-types";

describe("PantheonVault — deposit via ERC-1363 transferAndCall (no approve, no permit)", () => {
  let vault: PantheonVault;
  let usdc: ERC20PermitMock;
  let allocator: any, user: any;
  const u = (n: string) => ethers.parseUnits(n, 6);

  beforeEach(async () => {
    [allocator, user] = await ethers.getSigners();
    const Mock = await ethers.getContractFactory("ERC20PermitMock");
    usdc = await Mock.deploy("USD Coin", "USDC", 6) as ERC20PermitMock;
    const Vault = await ethers.getContractFactory("PantheonVault");
    vault = await Vault.deploy(await usdc.getAddress(), allocator.address) as PantheonVault;
    await usdc.mint(user.address, u("100"));
  });

  it("credits shares from a single transferAndCall — allowance stays 0", async () => {
    const amount = u("10");
    const vaultAddr = await vault.getAddress();

    await usdc.connect(user)["transferAndCall(address,uint256)"](vaultAddr, amount);

    expect(await usdc.allowance(user.address, vaultAddr)).to.equal(0n); // no approval ever
    expect(await vault.shareBalances(user.address)).to.equal(amount);
    expect(await vault.depositedBy(user.address)).to.equal(amount);
    expect(await vault.totalAssets()).to.equal(amount);
    expect(await usdc.balanceOf(vaultAddr)).to.equal(amount);
  });

  it("rejects a transferAndCall from a non-USDC token (only usdc can credit)", async () => {
    const Mock = await ethers.getContractFactory("ERC20PermitMock");
    const fake = await Mock.deploy("Fake", "FAKE", 6) as ERC20PermitMock;
    await fake.mint(user.address, u("10"));
    await expect(
      fake.connect(user)["transferAndCall(address,uint256)"](await vault.getAddress(), u("10"))
    ).to.be.reverted; // vault.onTransferReceived requires msg.sender == usdc
  });
});
