#!/usr/bin/env node
/**
 * Requests a real quote from whatever dstack endpoint is configured, writes
 * it as a fixture, and — this is the important part — cross-checks the SDK's
 * own report_data field against our offset-based extraction
 * (packages/shared/src/reportdata.ts, mirrored in contracts/src/lib/TDXQuote.sol).
 * If those two disagree, TDXQuote.REPORT_DATA_OFFSET is wrong and the
 * on-chain certify() path cannot be trusted yet — this check exists so that
 * bug surfaces here, in a script with a clear diagnostic, instead of as an
 * unexplained revert on-chain later.
 *
 * Against the LOCAL SIMULATOR (DSTACK_SIMULATOR_ENDPOINT=http://localhost:8090):
 * useful for exercising this whole code path, but the quote is NOT
 * hardware-signed and will be rejected by the real on-chain verifier. Only a
 * quote pulled from a real Phala Cloud deployment is a valid Day-0 fixture.
 *
 * Usage:
 *   DSTACK_SIMULATOR_ENDPOINT=http://localhost:8090 \
 *   node --experimental-strip-types scripts/generate-fixture.ts \
 *     --out fixtures/simulator-quote.hex \
 *     --audit-hash 0x<32 bytes> --agent 0x<20 bytes> --epoch 1
 */
import { writeFile } from "node:fs/promises";
import { sha256, type Address, type Hex } from "viem";

import { makeDstackClient, requestAttestation } from "../packages/agent/src/attest.ts";

function parseArgs(argv: string[]) {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  return {
    out: get("--out") ?? "fixtures/simulator-quote.hex",
    auditHash: (get("--audit-hash") ?? `0x${"aa".repeat(32)}`) as Hex,
    agent: (get("--agent") ?? `0x${"bb".repeat(20)}`) as Address,
    epoch: BigInt(get("--epoch") ?? "1"),
  };
}

async function main() {
  const { out, auditHash, agent, epoch } = parseArgs(process.argv.slice(2));

  const endpoint = process.env.DSTACK_SIMULATOR_ENDPOINT;
  console.log(`[generate-fixture] endpoint: ${endpoint ?? "(default dstack.sock — real CVM only)"}`);
  console.log(`[generate-fixture] auditHash=${auditHash} agent=${agent} epoch=${epoch}`);

  const client = makeDstackClient();
  const result = await requestAttestation(client, auditHash, agent, epoch);

  await writeFile(out, result.quote.startsWith("0x") ? result.quote.slice(2) : result.quote);
  console.log(`[generate-fixture] quote written to ${out} (${result.quote.length / 2 - 1} bytes)`);

  console.log("");
  console.log(`commitment              : ${result.commitment}`);
  console.log(`parsed report_data (hi) : ${result.parsedReportData.slice(0, 66)}`);
  console.log(`parsed report_data (lo) : 0x${result.parsedReportData.slice(66)}`);
  if (result.sdkReportData) {
    console.log(`SDK-reported report_data: ${result.sdkReportData}`);
    const match = result.sdkReportData.toLowerCase() === result.parsedReportData.toLowerCase();
    console.log(
      match
        ? "OFFSET CHECK: PASS — our TDXQuote offset parsing matches what the SDK reports."
        : "OFFSET CHECK: FAIL — TDXQuote.REPORT_DATA_OFFSET (contracts/src/lib/TDXQuote.sol) " +
            "is likely wrong for this dstack version. Do not trust certify() until this is fixed.",
    );
  } else {
    console.log("(SDK did not report report_data separately — nothing to cross-check against.)");
  }

  const hi = result.parsedReportData.slice(0, 66) as Hex;
  const isRaw = hi.toLowerCase() === result.commitment.toLowerCase();
  const isHashed = hi.toLowerCase() === sha256(result.commitment).toLowerCase();
  console.log("");
  if (isRaw) console.log("MODE: raw — deploy AgentRegistry with reportDataIsHashed = false.");
  else if (isHashed) console.log("MODE: sha256 — deploy AgentRegistry with reportDataIsHashed = true.");
  else console.log("MODE: unrecognized — see scripts/probe-reportdata.ts's troubleshooting notes.");
}

main().catch((err) => {
  console.error("[generate-fixture] failed:", err);
  process.exit(1);
});
