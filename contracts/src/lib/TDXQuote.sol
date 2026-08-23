// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @notice Fixed-offset field extraction from a raw Intel TDX v4 DCAP quote.
 *
 * Layout (TD report body, Intel TDX DCAP quote format v4):
 *   [0..48)    quote header
 *     [0..2)      VERSION            (2 bytes, little-endian uint16) — must be 4
 *   [48..584)  TD report body:
 *     [48..64)    TEE_TCB_SVN        (16 bytes)
 *     [64..112)   MRSEAM             (48 bytes)
 *     [112..160)  MRSIGNERSEAM       (48 bytes)
 *     [160..168)  SEAMATTRIBUTES     (8 bytes)
 *     [168..176)  TDATTRIBUTES       (8 bytes)
 *     [176..184)  XFAM               (8 bytes)
 *     [184..232)  MRTD               (48 bytes)  <- measurement of initial code/config
 *     ...
 *     [568..632)  REPORT_DATA        (64 bytes)  <- our commitment lives here
 *
 * These offsets are the documented TD report body layout, not something this
 * codebase invented — but "documented" and "what a specific SDK actually
 * produces" have diverged before. VERIFY against fixtures/real-quote.hex on
 * Day 0 before trusting this in the certify() path: extract both fields from
 * the real fixture off-chain (packages/shared/src/reportdata.ts +
 * scripts/probe-reportdata.ts) and confirm they land where expected here.
 */
library TDXQuote {
    uint256 internal constant VERSION_OFFSET = 0;
    uint256 internal constant VERSION_LENGTH = 2;
    uint16 internal constant EXPECTED_VERSION = 4;

    uint256 internal constant REPORT_DATA_OFFSET = 568;
    uint256 internal constant REPORT_DATA_LENGTH = 64;

    uint256 internal constant MRTD_OFFSET = 184;
    uint256 internal constant MRTD_LENGTH = 48;

    error QuoteTooShort(uint256 got, uint256 need);
    error UnsupportedQuoteVersion(uint16 got);

    /// @notice The 64-byte report_data field, as 2 packed bytes32 words (hi, lo).
    function reportData(bytes calldata quote) internal pure returns (bytes32 hi, bytes32 lo) {
        _requireVersion(quote);
        _requireLength(quote, REPORT_DATA_OFFSET + REPORT_DATA_LENGTH);
        bytes memory slice = quote[REPORT_DATA_OFFSET:REPORT_DATA_OFFSET + REPORT_DATA_LENGTH];
        assembly {
            hi := mload(add(slice, 32))
            lo := mload(add(slice, 64))
        }
    }

    /// @notice MRTD, the hardware measurement of the initial VM image + config, hashed to 32 bytes.
    function measurement(bytes calldata quote) internal pure returns (bytes32) {
        _requireVersion(quote);
        _requireLength(quote, MRTD_OFFSET + MRTD_LENGTH);
        return keccak256(quote[MRTD_OFFSET:MRTD_OFFSET + MRTD_LENGTH]);
    }

    /// @notice The quote header's version field. Everything else in this library
    /// assumes v4's fixed body layout — a differently-versioned quote that still
    /// passes hardware signature verification must not be read with these offsets.
    function version(bytes calldata quote) internal pure returns (uint16) {
        _requireLength(quote, VERSION_OFFSET + VERSION_LENGTH);
        // little-endian uint16
        return uint16(uint8(quote[VERSION_OFFSET])) | (uint16(uint8(quote[VERSION_OFFSET + 1])) << 8);
    }

    function _requireVersion(bytes calldata quote) private pure {
        uint16 v = version(quote);
        if (v != EXPECTED_VERSION) revert UnsupportedQuoteVersion(v);
    }

    function _requireLength(bytes calldata quote, uint256 need) private pure {
        if (quote.length < need) revert QuoteTooShort(quote.length, need);
    }
}
