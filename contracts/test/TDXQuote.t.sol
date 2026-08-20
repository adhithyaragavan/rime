// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TDXQuote} from "../src/lib/TDXQuote.sol";
import {QuoteBuilder} from "./helpers/QuoteBuilder.sol";
import {TDXQuoteHarness} from "./helpers/TDXQuoteHarness.sol";

contract TDXQuoteTest is Test {
    TDXQuoteHarness harness;

    function setUp() public {
        harness = new TDXQuoteHarness();
    }

    function test_extractsReportDataAtOffset() public view {
        bytes32 hi = keccak256("hi");
        bytes32 lo = bytes32(0);
        bytes memory quote = QuoteBuilder.build(bytes32(0), hi, lo);

        (bytes32 gotHi, bytes32 gotLo) = harness.reportData(quote);
        assertEq(gotHi, hi);
        assertEq(gotLo, lo);
    }

    function test_extractsMeasurement() public view {
        bytes32 mrtd = keccak256("measurement");
        bytes memory quote = QuoteBuilder.build(mrtd, bytes32(0), bytes32(0));

        // measurement() keccak256's the raw 48-byte MRTD field; our builder
        // writes `mrtd` as the first 32 of those 48 bytes then pads with
        // zeros, so recompute the same way here rather than expecting `mrtd`
        // back verbatim.
        bytes32 expected = keccak256(abi.encodePacked(mrtd, bytes16(0)));
        assertEq(harness.measurement(quote), expected);
    }

    function test_revertsOnShortQuote() public {
        bytes memory tooShort = new bytes(10);
        vm.expectRevert(
            abi.encodeWithSelector(TDXQuote.QuoteTooShort.selector, 10, TDXQuote.MRTD_OFFSET + TDXQuote.MRTD_LENGTH)
        );
        harness.measurement(tooShort);
    }
}
