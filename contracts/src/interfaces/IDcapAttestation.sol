// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @notice Automata's on-chain DCAP quote verifier. We call the deployed
 * instance rather than reimplementing quote verification — see
 * https://github.com/automata-network/automata-dcap-attestation.
 *
 * `output` on success encodes verifier-specific parsed fields we don't rely
 * on; AgentRegistry parses report_data and the measurement directly from the
 * raw `quote` bytes instead (see TDXQuote.sol), so it only needs `success`
 * from this call. That keeps AgentRegistry correct even if `output`'s
 * encoding differs from what's assumed here.
 */
interface IDcapAttestation {
    function verifyAndAttestOnChain(bytes calldata quote)
        external
        view
        returns (bool success, bytes memory output);
}
