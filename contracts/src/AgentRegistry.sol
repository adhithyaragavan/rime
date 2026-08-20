// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IDcapAttestation} from "./interfaces/IDcapAttestation.sol";
import {TDXQuote} from "./lib/TDXQuote.sol";

/**
 * @title AgentRegistry
 * @notice This contract IS the project's central claim: a certificate here means
 * "this agent's audited dependency tree ran, unmodified, inside a genuine TDX
 * enclave, as of `issuedAt`" — not merely "an enclave ran something once".
 *
 * That distinction lives entirely in one check: the quote's report_data field
 * must equal keccak256(abi.encode(auditHash, agent, epoch)). The audit verdict
 * (off-chain, from the scanner) is bound into hardware-signed attestation data,
 * so it cannot be swapped after the scan without the enclave itself re-attesting
 * a different value. See packages/shared/src/reportdata.ts for the off-chain
 * half of this commitment — the two MUST encode identically or every call here
 * reverts with CommitmentMismatch.
 */
contract AgentRegistry {
    struct Certificate {
        bytes32 auditHash;
        bytes32 measurement;
        uint64 issuedAt;
        uint64 expiresAt;
    }

    IDcapAttestation public immutable dcap;
    address public immutable owner;

    /// @notice Freshness window: a certificate older than this is worthless as a
    /// safety guarantee, because it says nothing about what's running *now*.
    uint64 public immutable freshnessWindow;

    /// @dev Settled empirically on Day 0 against fixtures/real-quote.hex —
    /// see TDXQuote.sol's header comment and scripts/probe-reportdata.ts.
    /// true  = quote's report_data holds sha256(commitment), zero-padded to 64 bytes
    /// false = quote's report_data holds commitment itself, zero-padded to 64 bytes
    bool public immutable reportDataIsHashed;

    /// @notice Image measurements allowed to hold a certificate. Empty (all
    /// false) by default; owner populates it after building the real image.
    /// This is the additive allowlist layer from the plan — certify() works
    /// without it configured, it just accepts any measurement until the owner
    /// locks it down, which is fine for early demo iteration.
    mapping(bytes32 => bool) public allowedMeasurement;
    bool public measurementAllowlistEnabled;

    mapping(address => Certificate) public certs;

    event Certified(
        address indexed agent, bytes32 auditHash, bytes32 measurement, uint64 issuedAt, uint64 expiresAt
    );
    event MeasurementAllowed(bytes32 indexed measurement, bool allowed);

    error NotOwner();
    error QuoteRejected();
    error CommitmentMismatch(bytes32 expected, bytes32 got);
    error MeasurementNotAllowed(bytes32 measurement);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(IDcapAttestation _dcap, uint64 _freshnessWindow, bool _reportDataIsHashed) {
        dcap = _dcap;
        owner = msg.sender;
        freshnessWindow = _freshnessWindow;
        reportDataIsHashed = _reportDataIsHashed;
    }

    function setMeasurementAllowed(bytes32 measurement, bool allowed) external onlyOwner {
        allowedMeasurement[measurement] = allowed;
        emit MeasurementAllowed(measurement, allowed);
    }

    function setMeasurementAllowlistEnabled(bool enabled) external onlyOwner {
        measurementAllowlistEnabled = enabled;
    }

    /**
     * @notice Certify that `msg.sender` (the agent itself) is currently running
     * the audited code committed to by `auditHash`, proven by a fresh TDX quote.
     * @param quote Raw TDX v4 quote from the agent's enclave (dstack getQuote()).
     * @param auditHash keccak256 of the canonicalized AuditManifest (see
     * packages/shared/src/manifest.ts::auditHash) that the scanner produced.
     * @param epoch Caller-chosen nonce/round, must match what was bound into
     * report_data — prevents replaying an old quote against a new auditHash.
     */
    function certify(bytes calldata quote, bytes32 auditHash, uint64 epoch) external {
        (bool ok,) = dcap.verifyAndAttestOnChain(quote);
        if (!ok) revert QuoteRejected();

        bytes32 measurement = TDXQuote.measurement(quote);
        if (measurementAllowlistEnabled && !allowedMeasurement[measurement]) {
            revert MeasurementNotAllowed(measurement);
        }

        bytes32 commitment = keccak256(abi.encode(auditHash, msg.sender, epoch));
        bytes32 expected = reportDataIsHashed ? sha256(abi.encodePacked(commitment)) : commitment;

        (bytes32 hi, bytes32 lo) = TDXQuote.reportData(quote);
        if (hi != expected || lo != bytes32(0)) {
            revert CommitmentMismatch(expected, hi);
        }

        uint64 nowTs = uint64(block.timestamp);
        certs[msg.sender] = Certificate({
            auditHash: auditHash,
            measurement: measurement,
            issuedAt: nowTs,
            expiresAt: nowTs + freshnessWindow
        });

        emit Certified(msg.sender, auditHash, measurement, nowTs, nowTs + freshnessWindow);
    }

    /// @notice True iff `agent` holds a certificate that hasn't gone stale.
    /// This is the single function GatedVault (or any integrator) needs to call.
    function isCertified(address agent) external view returns (bool) {
        Certificate storage c = certs[agent];
        return c.issuedAt != 0 && block.timestamp < c.expiresAt;
    }
}
