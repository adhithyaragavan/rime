/**
 * Covers only what can be checked without real TDX hardware: input
 * validation, and that failures produce diagnosable messages rather than
 * raw ENOENT.
 *
 * The actual configfs read/write path can only be exercised on a real TDX
 * guest — that verification is done by running scripts/generate-fixture.ts
 * on a Confidential VM and confirming the resulting quote passes
 * verifyAndAttestOnChain. See ARCHITECTURE.md.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { ConfigfsTsmQuoteProvider } from "../src/quote-provider.ts";

const VALID_64_BYTE = `0x${"11".repeat(64)}` as const;

test("rejects report_data that isn't exactly 64 bytes", async () => {
  const provider = new ConfigfsTsmQuoteProvider("/tmp/rime-nonexistent-tsm");

  // 32 bytes — the commitment on its own, unpadded. This is the realistic
  // mistake: forgetting that report_data is a fixed 64-byte field.
  await assert.rejects(
    () => provider.getQuote(`0x${"11".repeat(32)}`),
    /must be exactly 64 bytes, got 32/,
  );

  await assert.rejects(
    () => provider.getQuote(`0x${"11".repeat(65)}`),
    /must be exactly 64 bytes, got 65/,
  );
});

test("gives a diagnosable error when configfs is absent", async () => {
  const provider = new ConfigfsTsmQuoteProvider("/tmp/rime-nonexistent-tsm");

  // Must mention how to fix it (TDX not enabled / module not loaded), not
  // just surface a bare ENOENT that means nothing to whoever hits it.
  await assert.rejects(() => provider.getQuote(VALID_64_BYTE), (err: Error) => {
    assert.match(err.message, /Could not create/);
    assert.match(err.message, /tdx_guest|confidential-compute-type/);
    return true;
  });
});
