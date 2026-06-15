// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

interface IERC1363Receiver {
    function onTransferReceived(address operator, address from, uint256 value, bytes calldata data)
        external returns (bytes4);
}

/// Test USDC with EIP-2612 permit AND ERC-1363 transferAndCall (so a deposit is a single
/// plain token transfer — no approve, no permit signature). Configurable decimals, public
/// mint. There is no canonical USDC on Mantle Sepolia.
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

    /// ERC-1363: transfer tokens and invoke the receiver's onTransferReceived in one tx.
    function transferAndCall(address to, uint256 value) external returns (bool) {
        return transferAndCall(to, value, "");
    }

    function transferAndCall(address to, uint256 value, bytes memory data) public returns (bool) {
        _transfer(msg.sender, to, value);
        require(_checkOnTransferReceived(msg.sender, to, value, data), "receiver rejected");
        return true;
    }

    function _checkOnTransferReceived(address from, address to, uint256 value, bytes memory data)
        private returns (bool)
    {
        if (to.code.length == 0) return false;
        try IERC1363Receiver(to).onTransferReceived(msg.sender, from, value, data) returns (bytes4 retval) {
            return retval == IERC1363Receiver.onTransferReceived.selector;
        } catch {
            return false;
        }
    }
}
