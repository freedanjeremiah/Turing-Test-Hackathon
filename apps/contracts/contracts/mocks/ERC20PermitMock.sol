// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// Test USDC with EIP-2612 permit (gasless approval via signature) and a configurable
/// decimals. Public mint — there is no canonical USDC on Mantle Sepolia.
contract ERC20PermitMock is ERC20, ERC20Permit {
    uint8 private immutable _dec;

    constructor(string memory name, string memory symbol, uint8 dec)
        ERC20(name, symbol)
        ERC20Permit(name)
    {
        _dec = dec;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
