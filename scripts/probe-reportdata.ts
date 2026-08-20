#!/usr/bin/env node
/**
 * Day-0 gate script. Settles the single biggest integration risk in the plan:
 * does dstack's getQuote() put our commitment into report_data verbatim
 * ("raw" mode), or does it sha256 it first ("sha256" mode)?
 *
 * Prerequisite: fixtures/real-quote.hex must exist — a real TDX quote pulled
 * from a container running on Phala Cloud (not the simulator; simulator
 * quotes aren't hardware-signed and prove nothing about this). See the plan's
 * Day 0 section for how to get one: deploy a hello-world container that
 * calls getQuote(commitmentHex) with a KNOWN commitment (print it before
 * calling getQuote, save both), then commit the quote bytes here.
 *
 * Usage:
 *   node --experimental-strip-types scripts/probe-reportdata.ts \
 *     --quote fixtures/real-quote.hex \
 *     --commitment 0x<the exact hex you passed to getQuote>
 */
import { readFile } from "node:fs/promises";
import { extractReportData } from "../packages/shared/src/reportdata.ts";
import { sha256 } from "viem";

function parseArgs(argv: string[]) {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  return {
    quotePath: get("--quote") ?? "fixtures/real-quote.hex",
    commitment: get("--commitment"),
  };
}

async function main() {
  const { quotePath, commitment } = parseArgs(process.argv.slice(2));

  if (!commitment) {
    console.error(
      "Missing --commitment. Pass the exact hex string you handed to getQuote() " +
        "when the fixture was generated — this script can't guess it.",
    );
    process.exit(2);
  }

  let quoteHex: string;
  try {
    quoteHex = (await readFile(quotePath, "utf8")).trim();
  } catch {
    console.error(
      `Could not read ${quotePath}. This script needs a REAL quote from Phala Cloud ` +
        `(simulator quotes are unsigned and will not help determine this). ` +
        `See the Day 0 section of the plan.`,
    );
    process.exit(2);
  }

  const quote = (quoteHex.startsWith("0x") ? quoteHex : `0x${quoteHex}`) as `0x${string}`;
  const reportData = extractReportData(quote);
  const [hi, lo] = [reportData.slice(0, 66), `0x${reportData.slice(66)}`] as const;

  const commitmentNormalized = (
    commitment.startsWith("0x") ? commitment : `0x${commitment}`
  ) as `0x${string}`;
  const hashedCommitment = sha256(commitmentNormalized);

  console.log(`report_data (64B) : ${reportData}`);
  console.log(`  hi (32B)        : ${hi}`);
  console.log(`  lo (32B)        : ${lo}`);
  console.log(`commitment         : ${commitmentNormalized}`);
  console.log(`sha256(commitment) : ${hashedCommitment}`);
  console.log("");

  const isRaw = hi.toLowerCase() === commitmentNormalized.toLowerCase();
  const isHashed = hi.toLowerCase() === hashedCommitment.toLowerCase();

  if (isRaw) {
    console.log("RESULT: raw mode. report_data holds the commitment verbatim.");
    console.log("  -> Deploy AgentRegistry with reportDataIsHashed = false.");
  } else if (isHashed) {
    console.log("RESULT: sha256 mode. report_data holds sha256(commitment).");
    console.log("  -> Deploy AgentRegistry with reportDataIsHashed = true.");
  } else {
    console.log("RESULT: NEITHER matched. Something else is going on:");
    console.log("  - Is TDXQuote.REPORT_DATA_OFFSET (568) actually correct for this quote?");
    console.log("    Dump the full quote hex and locate the commitment bytes manually.");
    console.log("  - Did dstack apply a DIFFERENT hash (sha512, keccak) or padding scheme?");
    console.log("  - Is this actually a TDX v4 quote, or a different version/format?");
    console.log("  This blocks the on-chain path — fall back to Plan B (see the plan file)");
    console.log("  if not resolved quickly.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
