import { expect } from "chai";
import { ethers } from "hardhat";
import { PantheonVault, ERC20PermitMock } from "../typechain-types";

describe("PantheonVault — depositWithPermit (EIP-2612, no approve tx)", () => {
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

  it("deposits via a permit signature with NO prior approve()", async () => {
    const amount = u("10");
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const usdcAddr = await usdc.getAddress();
    const vaultAddr = await vault.getAddress();
    const nonce = await usdc.nonces(user.address);
    const { chainId } = await ethers.provider.getNetwork();

    const domain = { name: "USD Coin", version: "1", chainId, verifyingContract: usdcAddr };
    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };
    const message = { owner: user.address, spender: vaultAddr, value: amount, nonce, deadline };
    const sig = await user.signTypedData(domain, types, message);
    const { v, r, s } = ethers.Signature.from(sig);

    // allowance is zero before — no approve() tx happened
    expect(await usdc.allowance(user.address, vaultAddr)).to.equal(0n);

    await vault.connect(user).depositWithPermit(amount, deadline, v, r, s);

    expect(await vault.shareBalances(user.address)).to.equal(amount);
    expect(await vault.depositedBy(user.address)).to.equal(amount);
    expect(await vault.totalAssets()).to.equal(amount);
  });
});
