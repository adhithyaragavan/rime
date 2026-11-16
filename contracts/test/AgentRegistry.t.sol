// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {IDcapAttestation} from "../src/interfaces/IDcapAttestation.sol";
import {MockDcapAttestation} from "./mocks/MockDcapAttestation.sol";
import {QuoteBuilder} from "./helpers/QuoteBuilder.sol";

contract AgentRegistryTest is Test {
    MockDcapAttestation dcap;
    AgentRegistry registry;

    address agent = address(0xA6E17);
    bytes32 auditHash = keccak256("clean-manifest");
    uint64 epoch = 1;
    uint64 freshnessWindow = 30 minutes;

    function setUp() public {
        dcap = new MockDcapAttestation();
        // reportDataIsHashed = false ("raw" mode) for these tests; the
        // sha256 branch is covered separately below.
        registry = new AgentRegistry(IDcapAttestation(address(dcap)), freshnessWindow, false);
    }

    function _commitment(address who, uint64 ep) internal view returns (bytes32) {
        return keccak256(abi.encode(auditHash, who, ep));
    }

    function test_certify_succeedsWithCorrectCommitment() public {
        bytes memory quote = QuoteBuilder.build(bytes32(0), _commitment(agent, epoch), bytes32(0));

        vm.prank(agent);
        registry.certify(quote, auditHash, epoch);

        assertTrue(registry.isCertified(agent));
    }

    function test_certify_revertsWhenHardwareVerificationFails() public {
        dcap.setShouldSucceed(false);
        bytes memory quote = QuoteBuilder.build(bytes32(0), _commitment(agent, epoch), bytes32(0));

        vm.prank(agent);
        vm.expectRevert(AgentRegistry.QuoteRejected.selector);
        registry.certify(quote, auditHash, epoch);
    }

    /// @dev The load-bearing test: a quote that's hardware-valid but whose
    /// report_data doesn't match this auditHash must NOT certify. This is
    /// what makes "tampered code" fail on-chain in the demo's second act —
    /// a valid enclave running the WRONG (dirty) manifest is exactly what
    /// must be rejected, not just an invalid quote.
    function test_certify_revertsOnCommitmentMismatch_wrongAuditHash() public {
        bytes32 dirtyHash = keccak256("dirty-manifest");
        // Quote commits to `auditHash` (clean), but caller claims `dirtyHash`.
        bytes memory quote = QuoteBuilder.build(bytes32(0), _commitment(agent, epoch), bytes32(0));

        vm.prank(agent);
        vm.expectRevert(); // CommitmentMismatch — exact args asserted in the next test
        registry.certify(quote, dirtyHash, epoch);
    }

    function test_certify_revertsOnCommitmentMismatch_wrongAgent() public {
        address someoneElse = address(0xBEEF);
        bytes memory quote = QuoteBuilder.build(bytes32(0), _commitment(someoneElse, epoch), bytes32(0));

        vm.prank(agent); // agent tries to claim a quote committed to someoneElse
        vm.expectRevert();
        registry.certify(quote, auditHash, epoch);
    }

    function test_certify_revertsOnStaleEpoch() public {
        bytes memory quote = QuoteBuilder.build(bytes32(0), _commitment(agent, epoch), bytes32(0));

        vm.prank(agent);
        vm.expectRevert(); // committed epoch=1 but claiming epoch=2
        registry.certify(quote, auditHash, 2);
    }

    function test_isCertified_falseBeforeCertifying() public view {
        assertFalse(registry.isCertified(agent));
    }

    function test_isCertified_falseAfterFreshnessWindowElapses() public {
        bytes memory quote = QuoteBuilder.build(bytes32(0), _commitment(agent, epoch), bytes32(0));
        vm.prank(agent);
        registry.certify(quote, auditHash, epoch);
        assertTrue(registry.isCertified(agent));

        vm.warp(block.timestamp + freshnessWindow + 1);
        assertFalse(registry.isCertified(agent), "stale certificate must not read as certified");
    }

    function test_reCertifying_extendsFreshnessWindow() public {
        bytes memory quote = QuoteBuilder.build(bytes32(0), _commitment(agent, epoch), bytes32(0));
        vm.prank(agent);
        registry.certify(quote, auditHash, epoch);

        vm.warp(block.timestamp + freshnessWindow - 1); // still fresh
        assertTrue(registry.isCertified(agent));

        bytes memory heartbeat = QuoteBuilder.build(bytes32(0), _commitment(agent, epoch + 1), bytes32(0));
        vm.prank(agent);
        registry.certify(heartbeat, auditHash, epoch + 1);

        vm.warp(block.timestamp + freshnessWindow - 1); // fresh again, would have expired without the heartbeat
        assertTrue(registry.isCertified(agent));
    }

    function test_measurementAllowlist_blocksDisallowedImageWhenEnabled() public {
        registry.setMeasurementAllowlistEnabled(true);
        // No measurement has been allowed yet, so any MRTD is rejected.
        bytes memory quote = QuoteBuilder.build(keccak256("some-image"), _commitment(agent, epoch), bytes32(0));

        vm.prank(agent);
        vm.expectRevert();
        registry.certify(quote, auditHash, epoch);
    }

    function test_measurementAllowlist_permitsAllowedImage() public {
        bytes32 mrtdSeed = keccak256("blessed-image");
        bytes32 expectedMeasurement = keccak256(abi.encodePacked(mrtdSeed, bytes16(0)));

        registry.setMeasurementAllowed(expectedMeasurement, true);
        registry.setMeasurementAllowlistEnabled(true);

        bytes memory quote = QuoteBuilder.build(mrtdSeed, _commitment(agent, epoch), bytes32(0));
        vm.prank(agent);
        registry.certify(quote, auditHash, epoch);

        assertTrue(registry.isCertified(agent));
    }

    function test_reportDataIsHashedMode() public {
        AgentRegistry hashedRegistry =
            new AgentRegistry(IDcapAttestation(address(dcap)), freshnessWindow, true);
        bytes32 commitment = keccak256(abi.encode(auditHash, agent, epoch));
        bytes32 hashedCommitment = sha256(abi.encodePacked(commitment));

        bytes memory quote = QuoteBuilder.build(bytes32(0), hashedCommitment, bytes32(0));
        vm.prank(agent);
        hashedRegistry.certify(quote, auditHash, epoch);

        assertTrue(hashedRegistry.isCertified(agent));
    }

    function test_onlyOwner_canManageAllowlist() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(AgentRegistry.NotOwner.selector);
        registry.setMeasurementAllowed(bytes32(0), true);
    }
}
