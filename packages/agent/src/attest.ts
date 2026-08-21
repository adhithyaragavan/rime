/**
 * The enclave-facing half of the report_data binding described in
 * packages/shared/src/reportdata.ts: builds the commitment, asks a
 * QuoteProvider for a quote over it, and re-derives on-chain-ready calldata
 * for AgentRegistry.certify.
 *
 * Two quote sources exist behind that interface (see quote-provider.ts):
 * dstack (production, e.g. Phala Cloud) and configfs-tsm (any raw TDX
 * Confidential VM — validated against a real GCP c3-standard-4 instance,
 * see the "Result" section of
 * ~/.claude/plans/okay-so-what-could-sleepy-donut.md). Both were confirmed
 * to embed report_data the same way: raw, right-padded to 64 bytes — so
 * this file builds that 64-byte payload once, uniformly, rather than
 * relying on each provider to pad it consistently.
 */
import { buildCommitment, extractReportData } from "@rime/shared";
import type { Address, Hex } from "viem";
import { makeQuoteProvider, type QuoteProvider } from "./quote-provider.ts";

export interface AttestationResult {
  quote: Hex;
  commitment: Hex;
  /** report_data as reported by the provider itself, when it can tell us. */
  sdkReportData?: Hex;
  /** report_data as we parse it from the raw quote bytes ourselves. */
  parsedReportData: Hex;
  epoch: bigint;
}

export { makeQuoteProvider };

/**
 * Requests a quote committing to (auditHash, agentAddress, epoch). The
 * returned parsedReportData/sdkReportData pair is what
 * scripts/generate-fixture.ts uses to cross-check our offset-based TS/Solidity
 * parsing against the provider's own account of what it embedded — see that
 * script for why this double-check matters.
 */
export async function requestAttestation(
  provider: QuoteProvider,
  auditHash: Hex,
  agentAddress: Address,
  epoch: bigint,
): Promise<AttestationResult> {
  const commitment = buildCommitment(auditHash, agentAddress, epoch);

  // report_data is a fixed 64-byte TDX field. Both providers were confirmed
  // (simulator AND real GCP TDX hardware — see the plan's "Result" section)
  // to embed it raw, right-padded with zeros — so we build that padding
  // once, here, rather than trusting each provider to do it the same way.
  const reportData = `${commitment}${"00".repeat(32)}` as Hex;

  const { quote, sdkReportData } = await provider.getQuote(reportData);

  return {
    quote,
    commitment,
    sdkReportData,
    parsedReportData: extractReportData(quote),
    epoch,
  };
}
