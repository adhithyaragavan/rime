/**
 * These tests exist because a manifest that hashes differently on two machines
 * fails on-chain with no diagnosable error. Determinism is the whole contract.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  auditHash,
  computeVerdict,
  hashDependencySet,
  normalizeManifest,
  type AuditManifest,
  type Finding,
} from "../src/manifest.ts";
import { buildCommitment, extractReportData } from "../src/reportdata.ts";

function manifest(overrides: Partial<AuditManifest> = {}): AuditManifest {
  return {
    schemaVersion: 1,
    agent: { name: "demo-agent", version: "0.1.0" },
    codeHash: `0x${"11".repeat(32)}`,
    lockfileHash: hashDependencySet(["a@1.0.0", "b@2.0.0"]),
    depCount: 2,
    scanner: { name: "rime", version: "0.1.0", policy: "default-v1" },
    findings: [],
    verdict: "clean",
    scannedAt: 1_755_000_000,
    ...overrides,
  };
}

const findings: Finding[] = [
  { package: "z-pkg@1.0.0", rule: "install-script", severity: "high", detail: "postinstall present" },
  { package: "a-pkg@1.0.0", rule: "obfuscation", severity: "low", detail: "eval() call" },
];

test("auditHash ignores object key insertion order", () => {
  const a = manifest();
  const b = manifest({ agent: { version: "0.1.0", name: "demo-agent" } as AuditManifest["agent"] });
  assert.equal(auditHash(a), auditHash(b));
});

test("auditHash ignores findings order", () => {
  const a = manifest({ findings });
  const b = manifest({ findings: [...findings].reverse() });
  assert.equal(auditHash(a), auditHash(b));
});

test("auditHash changes when a finding is added", () => {
  assert.notEqual(auditHash(manifest()), auditHash(manifest({ findings })));
});

test("hashDependencySet dedupes and ignores ordering", () => {
  assert.equal(
    hashDependencySet(["b@2.0.0", "a@1.0.0", "a@1.0.0"]),
    hashDependencySet(["a@1.0.0", "b@2.0.0"]),
  );
});

test("hashDependencySet distinguishes versions", () => {
  assert.notEqual(hashDependencySet(["a@1.0.0"]), hashDependencySet(["a@1.0.1"]));
});

test("verdict is dirty only at high or above", () => {
  assert.equal(computeVerdict([]), "clean");
  assert.equal(computeVerdict([{ ...findings[1] }]), "clean");
  assert.equal(computeVerdict(findings), "dirty");
  assert.equal(
    computeVerdict([{ ...findings[0], severity: "critical" }]),
    "dirty",
  );
});

test("normalizeManifest does not mutate its input", () => {
  const original = manifest({ findings });
  const before = original.findings[0].package;
  normalizeManifest(original);
  assert.equal(original.findings[0].package, before);
});

test("commitment binds each of auditHash, agent, and epoch", () => {
  const h = auditHash(manifest());
  const agent = `0x${"ab".repeat(20)}` as const;
  const base = buildCommitment(h, agent, 7n);

  assert.equal(base.length, 66, "commitment must be 32 bytes");
  assert.notEqual(base, buildCommitment(h, agent, 8n), "epoch must matter");
  assert.notEqual(
    base,
    buildCommitment(h, `0x${"cd".repeat(20)}`, 7n),
    "agent address must matter",
  );
  assert.notEqual(
    base,
    buildCommitment(auditHash(manifest({ findings })), agent, 7n),
    "auditHash must matter",
  );
});

test("extractReportData rejects a quote that is too short", () => {
  assert.throws(() => extractReportData("0xdeadbeef"), /too short/i);
});

test("extractReportData reads the 64 bytes at the TDX offset", () => {
  // Synthetic quote: 568 bytes of 0x00, then 64 marker bytes.
  const padding = "00".repeat(48 + 520);
  const marker = "7f".repeat(64);
  const got = extractReportData(`0x${padding}${marker}`);
  assert.equal(got, `0x${marker}`);
});
