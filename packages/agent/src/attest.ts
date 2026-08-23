/**
 * The enclave-facing half of the report_data binding described in
 * packages/shared/src/reportdata.ts: builds the commitment, asks
 * ConfigfsTsmQuoteProvider for a quote over it, and re-derives
 * on-chain-ready calldata for AgentRegistry.certify.
 *
 * Validated against a real GCP c3-standard-4 TDX Confidential VM (see
 * ARCHITECTURE.md's "Live agent" section): report_data is embedded raw,
 * right-padded to 64 bytes — that padding is built once, here, rather than
 * left to the provider.
 */
import { buildCommitment, extractReportData } from "@rime/shared";
import type { Address, Hex } from "viem";
import { ConfigfsTsmQuoteProvider } from "./quote-provider.ts";

export interface AttestationResult {
  quote: Hex;
  commitment: Hex;
  parsedReportData: Hex;
  epoch: bigint;
}

export function makeQuoteProvider(): ConfigfsTsmQuoteProvider {
  return new ConfigfsTsmQuoteProvider();
}

/** Requests a quote committing to (auditHash, agentAddress, epoch). */
export async function requestAttestation(
  provider: ConfigfsTsmQuoteProvider,
  auditHash: Hex,
  agentAddress: Address,
  epoch: bigint,
): Promise<AttestationResult> {
  const commitment = buildCommitment(auditHash, agentAddress, epoch);

  // report_data is a fixed 64-byte TDX field, embedded raw and right-padded
  // — confirmed against real hardware, see ARCHITECTURE.md.
  const reportData = `${commitment}${"00".repeat(32)}` as Hex;

  const { quote } = await provider.getQuote(reportData);

  return {
    quote,
    commitment,
    parsedReportData: extractReportData(quote),
    epoch,
  };
}
