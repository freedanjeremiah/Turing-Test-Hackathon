// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import {PythStructs} from "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

/**
 * Real on-chain oracle-settled perpetual for Mantle Sepolia. No perp DEX is deployed
 * on Mantle Sepolia, so this contract IS the venue: positions open and close against
 * the real Pyth oracle (live on Mantle Sepolia at 0x98046Bd2...). PnL is computed from
 * real Pyth price movement over the hold window and settled in real USDC against an
 * owner-funded liquidity pool.
 *
 * Flow (caller is the agent wallet):
 *   - openPosition: pays the Pyth update fee in native MNT, refreshes the feed, reads
 *     the entry price, pulls `collateral` USDC in, records the position.
 *   - closePosition: refreshes the feed, reads the exit price, computes PnL bounded by
 *     [-collateral, +poolLiquidity], pays USDC back to the trader.
 *
 * Both entry and exit read the SAME Pyth feed, so the raw (same-expo) price is used
 * directly for the PnL ratio — no cross-feed normalization needed.
 */
contract MantleOraclePerp is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IPyth public immutable pyth;
    uint256 public constant MAX_LEVERAGE = 10;
    uint256 public constant MAX_PRICE_AGE = 120; // seconds

    struct Position {
        address trader;
        bytes32 priceId;
        uint256 entryPrice; // raw Pyth price (>0), same feed used at close
        uint256 sizeUsd;    // notional, USDC 6-dec
        uint256 collateral; // USDC 6-dec
        bool isLong;
        bool open;
    }

    uint256 public nextId;
    mapping(uint256 => Position) public positions;
    /// Owner-funded USDC used to pay winning positions.
    uint256 public poolLiquidity;

    event PoolFunded(uint256 amount, uint256 poolLiquidity);
    event PositionOpened(uint256 indexed id, address indexed trader, bytes32 priceId, uint256 entryPrice, uint256 sizeUsd, uint256 collateral, bool isLong);
    event PositionClosed(uint256 indexed id, address indexed trader, uint256 exitPrice, int256 pnl, uint256 payout);

    error BadLeverage();
    error NotTrader();
    error NotOpen();
    error BadPrice();

    constructor(IERC20 usdc_, IPyth pyth_, address owner_) Ownable(owner_) {
        usdc = usdc_;
        pyth = pyth_;
    }

    /// Owner seeds the pool that pays winners (real USDC).
    function fundPool(uint256 amount) external onlyOwner {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        poolLiquidity += amount;
        emit PoolFunded(amount, poolLiquidity);
    }

    function _readPrice(bytes32 priceId, bytes[] calldata priceUpdate) internal returns (uint256) {
        uint256 fee = pyth.getUpdateFee(priceUpdate);
        pyth.updatePriceFeeds{value: fee}(priceUpdate);
        PythStructs.Price memory p = pyth.getPriceNoOlderThan(priceId, MAX_PRICE_AGE);
        if (p.price <= 0) revert BadPrice();
        return uint256(uint64(p.price));
    }

    function openPosition(
        bytes32 priceId,
        uint256 collateral,
        uint256 sizeUsd,
        bool isLong,
        bytes[] calldata priceUpdate
    ) external payable nonReentrant returns (uint256 id) {
        if (sizeUsd == 0 || sizeUsd > collateral * MAX_LEVERAGE) revert BadLeverage();
        uint256 entry = _readPrice(priceId, priceUpdate);
        usdc.safeTransferFrom(msg.sender, address(this), collateral);
        id = ++nextId;
        positions[id] = Position(msg.sender, priceId, entry, sizeUsd, collateral, isLong, true);
        emit PositionOpened(id, msg.sender, priceId, entry, sizeUsd, collateral, isLong);
    }

    function closePosition(uint256 id, bytes[] calldata priceUpdate) external payable nonReentrant {
        Position storage pos = positions[id];
        if (!pos.open) revert NotOpen();
        if (pos.trader != msg.sender) revert NotTrader();

        uint256 exit = _readPrice(pos.priceId, priceUpdate);

        // pnl = sizeUsd * (exit - entry) / entry, sign by direction
        int256 diff = int256(exit) - int256(pos.entryPrice);
        int256 pnl = (int256(pos.sizeUsd) * diff) / int256(pos.entryPrice);
        if (!pos.isLong) pnl = -pnl;

        uint256 payout;
        if (pnl >= 0) {
            uint256 gain = uint256(pnl);
            if (gain > poolLiquidity) gain = poolLiquidity; // stay solvent
            poolLiquidity -= gain;
            payout = pos.collateral + gain;
            emit PositionClosed(id, msg.sender, exit, int256(gain), payout);
        } else {
            uint256 loss = uint256(-pnl);
            if (loss > pos.collateral) loss = pos.collateral; // capped at collateral
            poolLiquidity += loss;
            payout = pos.collateral - loss;
            emit PositionClosed(id, msg.sender, exit, -int256(loss), payout);
        }

        pos.open = false;
        if (payout > 0) usdc.safeTransfer(pos.trader, payout);
    }

    /// Refund any native MNT dust left from over-paying the Pyth fee.
    function sweep() external onlyOwner {
        (bool ok, ) = payable(owner()).call{value: address(this).balance}("");
        require(ok, "sweep failed");
    }

    receive() external payable {}
}
