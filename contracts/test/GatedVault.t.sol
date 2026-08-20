// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {GatedVault} from "../src/GatedVault.sol";
import {IDcapAttestation} from "../src/interfaces/IDcapAttestation.sol";
import {MockDcapAttestation} from "./mocks/MockDcapAttestation.sol";
import {QuoteBuilder} from "./helpers/QuoteBuilder.sol";

/// @notice Exercises the demo's three acts end to end at the contract level:
/// clean agent withdraws, tampered agent never gets a certificate to begin
/// with, and a stale certificate stops paying out once the window elapses.
contract GatedVaultTest is Test {
    MockDcapAttestation dcap;
    AgentRegistry registry;
    GatedVault vault;

    address agent = address(0xA6E17);
    address recipient = address(0xCAFE);
    bytes32 cleanAuditHash = keccak256("clean-manifest");
    uint64 freshnessWindow = 30 minutes;

    function setUp() public {
        dcap = new MockDcapAttestation();
        registry = new AgentRegistry(IDcapAttestation(address(dcap)), freshnessWindow, false);
        vault = new GatedVault(registry);
        vm.deal(address(vault), 10 ether);
    }

    function _certify(bytes32 auditHash, uint64 epoch) internal {
        bytes32 commitment = keccak256(abi.encode(auditHash, agent, epoch));
        bytes memory quote = QuoteBuilder.build(bytes32(0), commitment, bytes32(0));
        vm.prank(agent);
        registry.certify(quote, auditHash, epoch);
    }

    function test_act1_clean_certifiedAgentCanWithdraw() public {
        _certify(cleanAuditHash, 1);

        vm.prank(agent);
        vault.withdraw(payable(recipient), 1 ether);

        assertEq(recipient.balance, 1 ether);
    }

    function test_act2_tampered_uncertifiedAgentCannotWithdraw() public {
        // No certify() call at all — mirrors certify() reverting upstream
        // because the scanner found the tampered dependency (auditHash
        // wouldn't match report_data). The vault-level effect is identical
        // either way: no certificate, no withdrawal.
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(GatedVault.NotCertified.selector, agent));
        vault.withdraw(payable(recipient), 1 ether);
    }

    function test_act3_stale_expiredCertificateCannotWithdraw() public {
        _certify(cleanAuditHash, 1);

        vm.warp(block.timestamp + freshnessWindow + 1);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(GatedVault.NotCertified.selector, agent));
        vault.withdraw(payable(recipient), 1 ether);
    }

    function test_withdraw_revertsAboveBalance() public {
        _certify(cleanAuditHash, 1);

        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(GatedVault.InsufficientBalance.selector, 100 ether, 10 ether)
        );
        vault.withdraw(payable(recipient), 100 ether);
    }

    function test_deposit_emitsEvent() public {
        vm.expectEmit(true, false, false, true, address(vault));
        emit GatedVault.Deposited(address(this), 1 ether);
        (bool ok,) = address(vault).call{value: 1 ether}("");
        assertTrue(ok);
    }
}
