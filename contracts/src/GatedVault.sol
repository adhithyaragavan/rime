// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentRegistry} from "./AgentRegistry.sol";

/**
 * @title GatedVault
 * @notice A minimal treasury that only pays out to a currently-certified agent.
 * This is the demo's third act made concrete: the moment a certificate goes
 * stale (freshness window elapsed) or was never valid (tampered code, so
 * certify() reverted), withdraw() starts reverting too — no separate "is this
 * agent trustworthy" check bolted on afterward, the enforcement is on the
 * money-moving path itself.
 */
contract GatedVault {
    AgentRegistry public immutable registry;

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed agent, address indexed to, uint256 amount);

    error NotCertified(address agent);
    error InsufficientBalance(uint256 requested, uint256 available);
    error TransferFailed();

    constructor(AgentRegistry _registry) {
        registry = _registry;
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Withdraw funds to `to`, gated on msg.sender holding a fresh
    /// certificate. Reverts with NotCertified for an unregistered, tampered,
    /// or stale agent — the three failure modes the demo walks through.
    function withdraw(address payable to, uint256 amount) external {
        if (!registry.isCertified(msg.sender)) revert NotCertified(msg.sender);
        if (amount > address(this).balance) {
            revert InsufficientBalance(amount, address(this).balance);
        }

        emit Withdrawn(msg.sender, to, amount);

        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
