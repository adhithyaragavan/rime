#!/usr/bin/env node
/**
 * Requests a real quote via configfs-tsm (see
 * packages/agent/src/quote-provider.ts) and writes it as a fixture. Only
 * works on a real TDX guest (e.g. a GCP c3-standard-4 Confidential VM with
 * --confidential-compute-type=TDX) — configfs-tsm doesn't exist elsewhere.
 *
 * Also sanity-checks the report_data encoding mode against the commitment
 * it was given, matching what's hardcoded in AgentRegistry's
 * reportDataIsHashed — see scripts/probe-reportdata.ts for the deeper
 * offset/mode diagnostic if this ever disagrees.
 *
 * Usage:
 *   node --experimental-strip-types scripts/generate-fixture.ts \
 *     --out fixtures/real-quote.hex \
 *     --audit-hash 0x<32 bytes> --agent 0x<20 bytes> --epoch 1
 */
import { writeFile } from "node:fs/promises";
import { sha256, type Address, type Hex } from "viem";

import { makeQuoteProvider, requestAttestation } from "../packages/agent/src/attest.ts";

function parseArgs(argv: string[]) {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  return {
    out: get("--out") ?? "fixtures/real-quote.hex",
    auditHash: (get("--audit-hash") ?? `0x${"aa".repeat(32)}`) as Hex,
    agent: (get("--agent") ?? `0x${"bb".repeat(20)}`) as Address,
    epoch: BigInt(get("--epoch") ?? "1"),
  };
}

async function main() {
  const { out, auditHash, agent, epoch } = parseArgs(process.argv.slice(2));

  console.log(`[generate-fixture] auditHash=${auditHash} agent=${agent} epoch=${epoch}`);

  const provider = makeQuoteProvider();
  const result = await requestAttestation(provider, auditHash, agent, epoch);

  await writeFile(out, result.quote.startsWith("0x") ? result.quote.slice(2) : result.quote);
  console.log(`[generate-fixture] quote written to ${out} (${result.quote.length / 2 - 1} bytes)`);

  console.log("");
  console.log(`commitment              : ${result.commitment}`);
  console.log(`parsed report_data (hi) : ${result.parsedReportData.slice(0, 66)}`);
  console.log(`parsed report_data (lo) : 0x${result.parsedReportData.slice(66)}`);

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
