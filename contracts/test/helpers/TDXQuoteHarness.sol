// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TDXQuote} from "../../src/lib/TDXQuote.sol";

/// @notice TDXQuote's functions take `bytes calldata` (no-copy, matches how
/// AgentRegistry.certify actually receives a quote). Tests build quotes as
/// `bytes memory` locally, so this harness re-exposes the library through an
/// external call — crossing that boundary is what turns memory into calldata.
contract TDXQuoteHarness {
    function reportData(bytes calldata quote) external pure returns (bytes32, bytes32) {
        return TDXQuote.reportData(quote);
    }

    function measurement(bytes calldata quote) external pure returns (bytes32) {
        return TDXQuote.measurement(quote);
    }
}
