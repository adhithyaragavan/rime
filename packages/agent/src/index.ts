/**
 * Demo treasury agent. Deliberately minimal — its job in the demo is to exist
 * as *something* certifiable and to prove liveness via a periodic heartbeat,
 * not to do anything interesting as an agent. All the actual load-bearing
 * logic lives in selfcheck.ts (boot-time integrity) and attest.ts (proving it
 * to the chain).
 *
 * Boot sequence:
 *   1. Load the manifest the scanner produced at build time (baked into the
 *      image, never regenerated at runtime — an agent auditing its own
 *      dependency tree at boot could be fooled the same way the tree itself
 *      could be tampered with).
 *   2. Self-check: does the installed tree actually match that manifest?
 *      Refuse to start if not.
 *   3. Certify on-chain, then re-certify on a fixed interval (the heartbeat)
 *      so the freshness window never lapses while this process is healthy.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, type Hex } from "viem";
import { baseSepolia } from "viem/chains";

import { auditHash, type AuditManifest } from "@rime/shared";
import { makeQuoteProvider, requestAttestation } from "./attest.ts";
import { verifyIntegrityOrThrow, IntegrityViolation } from "./selfcheck.ts";
import { AGENT_REGISTRY_ABI } from "./registry-abi.ts";

const PROJECT_DIR = process.env.RIME_PROJECT_DIR ?? process.cwd();
const MANIFEST_PATH =
  process.env.RIME_MANIFEST_PATH ?? path.join(PROJECT_DIR, "rime.manifest.json");
const HEARTBEAT_MS = Number(process.env.RIME_HEARTBEAT_MS ?? 25 * 60 * 1000); // < 30 min freshness window
const REGISTRY_ADDRESS = process.env.AGENT_REGISTRY_ADDRESS as Hex | undefined;
const PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY as Hex | undefined;
const RPC_URL = process.env.RPC_URL ?? "https://base-sepolia-rpc.publicnode.com";

async function loadManifest(): Promise<AuditManifest> {
  const raw = await readFile(MANIFEST_PATH, "utf8");
  return JSON.parse(raw) as AuditManifest;
}

async function certifyOnce(manifest: AuditManifest, epoch: bigint) {
  if (!REGISTRY_ADDRESS || !PRIVATE_KEY) {
    console.warn(
      "[agent] AGENT_REGISTRY_ADDRESS / AGENT_PRIVATE_KEY not set — " +
        "requesting a quote but skipping the on-chain certify() call. " +
        "Fine for local dev against the simulator; required for the real demo.",
    );
  }

  const account = PRIVATE_KEY ? privateKeyToAccount(PRIVATE_KEY) : undefined;
  const quoteProvider = makeQuoteProvider();
  const hash = auditHash(manifest);

  const agentAddress = account?.address ?? "0x0000000000000000000000000000000000000000";
  const attestation = await requestAttestation(quoteProvider, hash, agentAddress, epoch);

  console.log(`[agent] epoch ${epoch}: quote obtained, auditHash=${hash}`);
  if (attestation.sdkReportData && attestation.sdkReportData !== attestation.parsedReportData) {
    console.warn(
      "[agent] SDK-reported report_data does not match our own offset-based parse. " +
        "This means TDXQuote.sol's REPORT_DATA_OFFSET is likely wrong for this dstack " +
        "version — re-run scripts/generate-fixture.ts and fix the offset before trusting " +
        "any on-chain certify() call.",
    );
  }

  if (!account || !REGISTRY_ADDRESS) return;

  const client = createWalletClient({ account, chain: baseSepolia, transport: http(RPC_URL) });
  const txHash = await client.writeContract({
    address: REGISTRY_ADDRESS,
    abi: AGENT_REGISTRY_ABI,
    functionName: "certify",
    args: [attestation.quote, hash, epoch],
  });
  console.log(`[agent] epoch ${epoch}: certify() submitted, tx=${txHash}`);
}

async function main() {
  console.log(`[agent] booting, project dir: ${PROJECT_DIR}`);
  const manifest = await loadManifest();

  try {
    await verifyIntegrityOrThrow(PROJECT_DIR, manifest);
  } catch (err) {
    if (err instanceof IntegrityViolation) {
      console.error(`[agent] REFUSING TO START: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  console.log(`[agent] integrity check passed, verdict=${manifest.verdict}`);

  let epoch = BigInt(Date.now());
  await certifyOnce(manifest, epoch);

  setInterval(() => {
    epoch = BigInt(Date.now());
    certifyOnce(manifest, epoch).catch((err) => console.error("[agent] heartbeat failed:", err));
  }, HEARTBEAT_MS);

  console.log(`[agent] running, heartbeat every ${HEARTBEAT_MS}ms`);
}

main().catch((err) => {
  console.error("[agent] fatal:", err);
  process.exit(1);
});
