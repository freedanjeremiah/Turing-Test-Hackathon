// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Pulls Pyth's MockPyth into the compilation set so tests can deploy a local,
// deterministic Pyth oracle. Not used in production — Mantle Sepolia uses the real
// Pyth contract at 0x98046Bd286715D3B0BC227Dd7a956b83D8978603.
import "@pythnetwork/pyth-sdk-solidity/MockPyth.sol";
