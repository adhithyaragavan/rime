import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { dependencyContentHash } from "@rime/shared/src/dependency-content.ts";
import { hashDependencySet, type AuditManifest } from "@rime/shared";
import { IntegrityViolation, verifyIntegrityOrThrow } from "../src/selfcheck.ts";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "rime-selfcheck-"));
  const packageDir = path.join(root, "node_modules", "dep");
  await mkdir(packageDir, { recursive: true });
  await writeFile(path.join(root, "package.json"), '{"dependencies":{"dep":"1.0.0"}}');
  await writeFile(
    path.join(root, "package-lock.json"),
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "fixture", version: "1.0.0" },
        "node_modules/dep": {
          version: "1.0.0",
          resolved: "https://registry.example/dep.tgz",
          integrity: "sha512-dep",
        },
      },
    }),
  );
  await writeFile(path.join(packageDir, "package.json"), '{"name":"dep","version":"1.0.0"}');
  await writeFile(path.join(packageDir, "index.js"), "module.exports = 'clean';\n");
  return { root, packageDir };
}

async function manifestFor(root: string): Promise<AuditManifest> {
  const dependencies = [{
    installPath: "node_modules/dep",
    dir: path.join(root, "node_modules", "dep"),
    name: "dep",
    version: "1.0.0",
    integrity: "sha512-dep",
    resolved: "https://registry.example/dep.tgz",
    optional: false,
  }];
  return {
    schemaVersion: 1,
    agent: { name: "fixture", version: "1.0.0" },
    codeHash: `0x${"11".repeat(32)}`,
    lockfileHash: hashDependencySet(["dep@1.0.0"]),
    dependencyContentHash: await dependencyContentHash(dependencies),
    depCount: 1,
    scanner: { name: "rime-scanner", version: "0.1.0", policy: "default-v1" },
    findings: [],
    verdict: "clean",
    scannedAt: 1,
  };
}

test("self-check accepts matching installed dependency contents", async () => {
  const { root } = await fixture();
  try {
    await verifyIntegrityOrThrow(root, await manifestFor(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("self-check rejects modified installed dependency contents", async () => {
  const { root, packageDir } = await fixture();
  try {
    const manifest = await manifestFor(root);
    await writeFile(path.join(packageDir, "index.js"), "module.exports = 'tampered';\n");
    await assert.rejects(() => verifyIntegrityOrThrow(root, manifest), IntegrityViolation);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
