// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {GatedVault} from "../src/GatedVault.sol";
import {IDcapAttestation} from "../src/interfaces/IDcapAttestation.sol";

/**
 * Deploys AgentRegistry + GatedVault against a real DCAP verifier.
 *
 * Required env:
 *   DCAP_ATTESTATION_ADDRESS  - the deployed Automata verifier on the target chain
 *   PRIVATE_KEY               - deployer key
 * Optional env:
 *   FRESHNESS_WINDOW_SECONDS  - default 1800 (30 min)
 *   REPORT_DATA_IS_HASHED     - "true"/"false" — settle via scripts/probe-reportdata.ts
 *                               against fixtures/real-quote.hex BEFORE deploying for real;
 *                               defaults to "false" (raw) only so this script has a value
 *                               to fall back to, not because that's a safe default to trust.
 *
 * Usage:
 *   forge script script/Deploy.s.sol --rpc-url $AUTOMATA_TESTNET_RPC --broadcast
 */
contract Deploy is Script {
    function run() external {
        address dcapAddress = vm.envAddress("DCAP_ATTESTATION_ADDRESS");
        uint64 freshnessWindow = uint64(vm.envOr("FRESHNESS_WINDOW_SECONDS", uint256(1800)));
        bool reportDataIsHashed = vm.envOr("REPORT_DATA_IS_HASHED", false);

        vm.startBroadcast();

        AgentRegistry registry =
            new AgentRegistry(IDcapAttestation(dcapAddress), freshnessWindow, reportDataIsHashed);
        GatedVault vault = new GatedVault(registry);

        vm.stopBroadcast();

        console.log("AgentRegistry deployed:", address(registry));
        console.log("GatedVault deployed:   ", address(vault));
        console.log("freshnessWindow:       ", freshnessWindow);
        console.log("reportDataIsHashed:    ", reportDataIsHashed);
    }
}
