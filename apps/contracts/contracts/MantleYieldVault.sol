// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * Real on-chain yield vault for Mantle Sepolia. A standard ERC-4626 over USDC whose
 * share price appreciates as an owner-funded reward reserve streams in linearly.
 *
 * No external lending protocol exists on Mantle Sepolia, so the yield source is an
 * explicit on-chain reserve (owner funds USDC via `fundRewards`) released at
 * `rewardRatePerSec`. Everything — deposits, shares, redemptions, accrual — is real
 * on-chain state. demeter deposits USDC and redeems for more later; the extra USDC
 * is real and physically held by this contract.
 */
contract MantleYieldVault is ERC4626, Ownable {
    using SafeERC20 for IERC20;

    /// USDC streamed into share value per second (asset units, 6-dec).
    uint256 public rewardRatePerSec;
    /// Owner-funded yield not yet streamed (excluded from totalAssets so it doesn't inflate share price instantly).
    uint256 public rewardReserve;
    /// Last time the reserve was folded into counted assets.
    uint256 public lastAccrue;

    event RewardsFunded(uint256 amount, uint256 reserve);
    event RewardRateSet(uint256 ratePerSec);
    event Accrued(uint256 streamed, uint256 reserveRemaining);

    error ZeroRate();

    constructor(IERC20 usdc, address owner_)
        ERC20("Pantheon Yield USDC", "tyUSDC")
        ERC4626(usdc)
        Ownable(owner_)
    {
        lastAccrue = block.timestamp;
    }

    /// Yield available to stream right now (read-only; bounded by the reserve).
    function _pendingStream() internal view returns (uint256) {
        if (rewardRatePerSec == 0 || rewardReserve == 0) return 0;
        uint256 s = rewardRatePerSec * (block.timestamp - lastAccrue);
        return s > rewardReserve ? rewardReserve : s;
    }

    /// Counted assets = everything held minus the still-locked reserve. As the reserve
    /// streams out, counted assets rise → share price rises.
    function totalAssets() public view override returns (uint256) {
        uint256 pending = _pendingStream();
        uint256 locked = rewardReserve - pending;
        return IERC20(asset()).balanceOf(address(this)) - locked;
    }

    /// Fold streamed yield out of the locked reserve. Idempotent per block.
    function _accrue() internal {
        uint256 pending = _pendingStream();
        if (pending > 0) {
            rewardReserve -= pending;
            emit Accrued(pending, rewardReserve);
        }
        lastAccrue = block.timestamp;
    }

    /// Owner tops up the yield reserve with real USDC. Does not change share price
    /// (the new USDC is locked until it streams).
    function fundRewards(uint256 amount) external onlyOwner {
        _accrue();
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
        rewardReserve += amount;
        emit RewardsFunded(amount, rewardReserve);
    }

    /// Owner sets the streaming rate (USDC/sec). Accrues at the old rate first.
    function setRewardRate(uint256 ratePerSec) external onlyOwner {
        _accrue();
        rewardRatePerSec = ratePerSec;
        emit RewardRateSet(ratePerSec);
    }

    /// Current annualized yield in bps, for display (0 if no principal).
    function apyBps() external view returns (uint256) {
        uint256 base = totalAssets();
        if (base == 0 || rewardRatePerSec == 0) return 0;
        return (rewardRatePerSec * 365 days * 10_000) / base;
    }

    // Accrue before any share-moving action so totalAssets is current.
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        _accrue();
        super._deposit(caller, receiver, assets, shares);
    }

    function _withdraw(address caller, address receiver, address owner_, uint256 assets, uint256 shares) internal override {
        _accrue();
        super._withdraw(caller, receiver, owner_, assets, shares);
    }
}
