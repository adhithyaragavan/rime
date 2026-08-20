/**
 * The enclave-facing half of the report_data binding described in
 * packages/shared/src/reportdata.ts: builds the commitment, asks dstack for a
 * quote over it, and re-derives on-chain-ready calldata for AgentRegistry.certify.
 *
 * Endpoint selection: DstackClient defaults to /var/run/dstack.sock, which is
 * only present inside a real dstack CVM. For local dev we point it at the
 * simulator over HTTP instead (see DSTACK_SIMULATOR_ENDPOINT in
 * scripts/run-simulator.sh) — but a simulator quote is NOT hardware-signed
 * and will be rejected by the real on-chain verifier. It's for exercising
 * this code path only, never for the actual certify() call.
 */
import { DstackClient, type GetQuoteResponse } from "@phala/dstack-sdk";
import { buildCommitment, extractReportData } from "@rime/shared";
import { hexToBytes, type Address, type Hex } from "viem";

export interface AttestationResult {
  quote: Hex;
  commitment: Hex;
  /** report_data as reported by the SDK itself, when it provides one. */
  sdkReportData?: Hex;
  /** report_data as we parse it from the raw quote bytes ourselves. */
  parsedReportData: Hex;
  epoch: bigint;
}

export function makeDstackClient(): DstackClient {
  const endpoint = process.env.DSTACK_SIMULATOR_ENDPOINT || undefined;
  return new DstackClient(endpoint);
}

/**
 * Requests a quote committing to (auditHash, agentAddress, epoch). The
 * returned parsedReportData/sdkReportData pair is what
 * scripts/generate-fixture.ts uses to cross-check our offset-based TS/Solidity
 * parsing against the SDK's own account of what it embedded — see that
 * script for why this double-check matters.
 */
export async function requestAttestation(
  client: DstackClient,
  auditHash: Hex,
  agentAddress: Address,
  epoch: bigint,
): Promise<AttestationResult> {
  const commitment = buildCommitment(auditHash, agentAddress, epoch);

  // IMPORTANT: dstack-sdk's getQuote(report_data: string | Buffer | Uint8Array)
  // treats a JS `string` as raw UTF-8 TEXT (Buffer.from(data).toString("hex")),
  // not as an already-hex-encoded value — passing our "0x...." hex string
  // directly would embed the ASCII bytes of that string, not the 32 bytes it
  // represents (and blows the 64-byte report_data limit, since "0x" + 64 hex
  // chars = 66 ASCII bytes). Must decode to raw bytes first. Confirmed against
  // the real SDK via the local simulator — see vendor/simulator-build/.
  const response: GetQuoteResponse = await client.getQuote(hexToBytes(commitment));

  // dstack-sdk returns `quote` and `report_data` as BARE hex — no "0x" prefix
  // — despite both being typed `Hex` in its .d.ts. Confirmed directly against
  // the real SDK via the simulator (a plain string equality check against
  // viem's 0x-prefixed output silently false-negatives otherwise, which is
  // exactly what happened while building this). Normalize once, here, so
  // nothing downstream (Solidity calldata, extractReportData, the UI) has to
  // rethink this.
  const quote = withPrefix(response.quote);
  const sdkReportData = response.report_data ? withPrefix(response.report_data) : undefined;

  return {
    quote,
    commitment,
    sdkReportData,
    parsedReportData: extractReportData(quote),
    epoch,
  };
}

function withPrefix(hex: string): Hex {
  return (hex.startsWith("0x") ? hex : `0x${hex}`) as Hex;
}
