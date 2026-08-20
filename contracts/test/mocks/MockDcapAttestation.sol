// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IDcapAttestation} from "../../src/interfaces/IDcapAttestation.sol";

/// @notice Test double standing in for Automata's deployed verifier. Real
/// on-chain verification is exercised separately (Day 0 gate: a forge test
/// forked against the actual deployed contract using fixtures/real-quote.hex,
/// per the plan) — this mock lets AgentRegistry/GatedVault logic be tested
/// deterministically and offline.
contract MockDcapAttestation is IDcapAttestation {
    bool public shouldSucceed = true;

    function setShouldSucceed(bool value) external {
        shouldSucceed = value;
    }

    function verifyAndAttestOnChain(bytes calldata) external view returns (bool, bytes memory) {
        return (shouldSucceed, "");
    }
}
