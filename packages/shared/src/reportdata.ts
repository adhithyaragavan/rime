/**
 * FROZEN INTERFACE — the single most likely source of an integration bug.
 *
 * report_data is the 64-byte field inside a TDX quote that the enclave gets to
 * choose. We use it to commit to (auditHash, agentAddress, epoch), which is what
 * turns "some code ran in an enclave" into "this audited code ran in an enclave,
 * recently". The registry recomputes this commitment and compares it against the
 * quote, so the encoding here must match the Solidity side byte for byte.
 *
 * Solidity equivalent (AgentRegistry.sol):
 *   keccak256(abi.encode(auditHash, agentAddress, epoch))
 */
import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hex,
} from "viem";

/** The 32-byte commitment. This is the value we *intend* to bind. */
export function buildCommitment(
  auditHash: Hex,
  agentAddress: Address,
  epoch: bigint,
): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, address, uint64"), [
      auditHash,
      agentAddress,
      epoch,
    ]),
  );
}

/**
 * How the quote provider treats the bytes we hand it for report_data.
 *
 * Some TDX platforms pass report_data through verbatim; others hash it
 * first (the driver takes a fixed 64 bytes, and hashing is how a
 * variable-length input gets accepted). Which one is in play decides what
 * the registry must compare against, and it cannot be determined from docs
 * alone — confirmed empirically via `scripts/probe-reportdata.ts` against a
 * real quote (see ARCHITECTURE.md): it's `raw`.
 */
export type ReportDataMode =
  /** Quote contains our 32 bytes, right-padded to 64. */
  | "raw"
  /** Quote contains sha256(our 32 bytes), right-padded to 64. */
  | "sha256";

/**
 * Extract the report_data field from a raw TDX v4 quote.
 *
 * Layout: 48-byte quote header, then the TD report body. Within a TD10 report
 * body report_data is the final 64 bytes, at offset 520.
 */
export const TDX_REPORT_DATA_OFFSET = 48 + 520;
export const TDX_REPORT_DATA_LENGTH = 64;

export function extractReportData(quote: Hex): Hex {
  const bytes = hexToBytes(quote);
  const start = TDX_REPORT_DATA_OFFSET;
  const end = start + TDX_REPORT_DATA_LENGTH;

  if (bytes.length < end) {
    throw new Error(
      `Quote too short to contain report_data: got ${bytes.length} bytes, need at least ${end}. ` +
        `Is this a TDX v4 quote?`,
    );
  }
  return bytesToHex(bytes.slice(start, end));
}

function hexToBytes(hex: Hex): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): Hex {
  return `0x${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
