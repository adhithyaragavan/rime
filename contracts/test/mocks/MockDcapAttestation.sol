// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IDcapAttestation} from "../../src/interfaces/IDcapAttestation.sol";

/// @notice Test double standing in for Automata's deployed verifier. Real
/// on-chain verification is exercised separately (a forge test forked
/// against the actual deployed contract, plus a live deploy) — this mock
/// lets AgentRegistry/GatedVault logic be tested deterministically and
/// offline.
///
/// `callCount` genuinely mutates storage on every call — not decoration.
/// Automata's real verifyAndAttestOnChain is state-changing (see
/// IDcapAttestation.sol's header comment for why that matters); a mock
/// that's read-only can conform to a `view`-declared interface just as
/// easily as a correct one, so it can never catch a caller accidentally
/// marking the interface `view` and getting a silent STATICCALL revert
/// against the real contract. This one can: mark the interface `view`
/// again and AgentRegistryTest starts failing here first.
contract MockDcapAttestation is IDcapAttestation {
    bool public shouldSucceed = true;
    uint256 public callCount;

    function setShouldSucceed(bool value) external {
        shouldSucceed = value;
    }

    function verifyAndAttestOnChain(bytes calldata) external returns (bool, bytes memory) {
        callCount++;
        return (shouldSucceed, "");
    }
}
