// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TDXQuote} from "../../src/lib/TDXQuote.sol";

/// @notice Builds a synthetic (unsigned) TDX-quote-shaped byte string for
/// tests: correct field offsets per TDXQuote.sol, everything else zeroed.
/// This is NOT a real quote — MockDcapAttestation is what stands in for
/// hardware-signature verification in these tests.
library QuoteBuilder {
    function build(bytes32 mrtd, bytes32 reportDataHi, bytes32 reportDataLo)
        internal
        pure
        returns (bytes memory quote)
    {
        quote = new bytes(TDXQuote.REPORT_DATA_OFFSET + TDXQuote.REPORT_DATA_LENGTH);

        // Version field (little-endian uint16) at offset 0 — must read as 4.
        quote[0] = bytes1(uint8(TDXQuote.EXPECTED_VERSION));
        quote[1] = 0x00;

        // MRTD occupies 48 bytes at MRTD_OFFSET; write mrtd's 32 bytes then pad.
        _writeAt(quote, TDXQuote.MRTD_OFFSET, abi.encodePacked(mrtd, bytes16(0)));
        _writeAt(quote, TDXQuote.REPORT_DATA_OFFSET, abi.encodePacked(reportDataHi, reportDataLo));
    }

    function _writeAt(bytes memory quote, uint256 offset, bytes memory data) private pure {
        for (uint256 i = 0; i < data.length; i++) {
            quote[offset + i] = data[i];
        }
    }
}
