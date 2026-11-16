/**
 * Equivalent of:
 *   cast call 0x95175096a9B74165BE0ac84260cc14Fc1c0EF5FF \
 *     "verifyAndAttestOnChain(bytes)(bool,bytes)" \
 *     "0x$(cat fixtures/real-quote.hex)" \
 *     --rpc-url https://base-sepolia-rpc.publicnode.com
 *
 * Calls Automata's deployed DCAP verifier on Base Sepolia with the real
 * hardware-signed TDX quote from fixtures/real-quote.hex and prints the
 * result (true/false + returned bytes).
 *
 * Usage:
 *   node --experimental-strip-types scripts/verify-quote.ts
 */
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DCAP_ADDRESS = "0x95175096a9B74165BE0ac84260cc14Fc1c0EF5FF" as const;
const RPC_URL = "https://base-sepolia-rpc.publicnode.com";

const quoteHex = readFileSync(resolve(__dirname, "../fixtures/real-quote.hex"), "utf-8").trim();
const quoteBytes = `0x${quoteHex}` as `0x${string}`;

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
});

console.log("Calling verifyAndAttestOnChain on Automata's DCAP verifier...");
console.log(`  Contract:  ${DCAP_ADDRESS}`);
console.log(`  Chain:     Base Sepolia (84532)`);
console.log(`  RPC:       ${RPC_URL}`);
console.log(`  Quote:     ${quoteBytes.slice(0, 20)}...${quoteBytes.slice(-8)} (${quoteHex.length / 2} bytes)`);
console.log();

try {
  const result = await client.call({
    to: DCAP_ADDRESS,
    // verifyAndAttestOnChain(bytes) selector = 0x38d8480a
    // ABI-encode: offset (0x20) + length + data
    data: encodeVerifyCall(quoteBytes),
  });

  if (!result.data) {
    console.log("❌ No return data — call may have reverted.");
    process.exit(1);
  }

  // Decode (bool, bytes) return
  // First 32 bytes = bool (success), next = bytes offset, then length + data
  const success = BigInt("0x" + result.data.slice(2, 66)) !== 0n;
  console.log(`✅ verifyAndAttestOnChain returned:`);
  console.log(`   success = ${success}`);

  if (success) {
    console.log();
    console.log("The quote is GENUINE — verified by Automata's on-chain DCAP verifier.");
  } else {
    console.log();
    console.log("The quote was REJECTED by the verifier.");
  }
} catch (err: any) {
  console.error("❌ Call failed:", err.message ?? err);
  process.exit(1);
}

/**
 * ABI-encode a call to verifyAndAttestOnChain(bytes).
 * Selector: 0x38d8480a
 */
function encodeVerifyCall(data: `0x${string}`): `0x${string}` {
  const selector = "38d8480a";
  // bytes is dynamic: offset (32 bytes) + length (32 bytes) + data (padded to 32-byte boundary)
  const rawBytes = hexToBytes(data.slice(2));
  const offset = 32n;
  const length = BigInt(rawBytes.length);
  const paddedLen = Math.ceil(rawBytes.length / 32) * 32;

  let encoded = selector;
  encoded += pad(offset);
  encoded += pad(length);
  // Append the raw bytes, right-padded to 32-byte boundary
  encoded += data.slice(2).padEnd(paddedLen * 2, "0");

  return `0x${encoded}` as `0x${string}`;
}

function pad(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
