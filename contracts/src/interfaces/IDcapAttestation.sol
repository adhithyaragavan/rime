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
 *
 * NOT `view`, deliberately: Automata's real deployed function is declared
 * `external payable` (rust-crates/contracts/dcap/IAutomataDcapAttestation.sol
 * in their repo — it writes attestation/collateral state, it doesn't just
 * read). Declaring it `view` here would make Solidity compile the call as a
 * STATICCALL, which silently reverts with zero return data the instant the
 * callee touches storage — exactly the "execution reverted for an unknown
 * reason" with no decodable cause that a real deploy hit. A mock that's
 * also `view` (see MockDcapAttestation) can never catch this: it has no
 * state changes to trip the STATICCALL restriction on, so this bug is
 * invisible to every offline test and only surfaces against the real
 * contract on a real chain.
 */
interface IDcapAttestation {
    function verifyAndAttestOnChain(bytes calldata quote) external returns (bool success, bytes memory output);
}
