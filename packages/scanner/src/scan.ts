/**
 * Orchestrates a full scan: resolve the dep tree, build per-package context,
 * run every heuristic plus the external wraps, and emit a normalized
 * AuditManifest. This is the function the CLI (and later, the agent's
 * self-check at boot) both call — one code path producing the manifest that
 * gets hashed and bound into the TDX quote.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  computeVerdict,
  hashDependencySet,
  normalizeManifest,
  type AuditManifest,
  type Finding,
} from "@rime/shared";

import { resolveDependencyTree, type ResolvedPackage } from "./deptree.ts";
import { buildContext } from "./context.ts";
import { fetchRegistryMeta } from "./registry.ts";
import { ALL_HEURISTICS } from "./heuristics/index.ts";
import { isOsvScannerAvailable, runOsvScanner } from "./external/osv.ts";
import { runAuditSignatures } from "./external/npm-audit-signatures.ts";
import { dependencyContentHash } from "@rime/shared/src/dependency-content.ts";

export interface ScanOptions {
  projectDir: string;
  agentName: string;
  agentVersion: string;
  /** Skip npm-registry lookups (young-version, no-provenance) — for offline/demo runs. */
  offline?: boolean;
  /** Skip osv-scanner and npm audit signatures — for a faster local iteration loop. */
  skipExternal?: boolean;
}

const SCANNER_VERSION = "0.1.0";
const POLICY = "default-v1";

export async function scan(options: ScanOptions): Promise<AuditManifest> {
  const { projectDir, agentName, agentVersion, offline = false, skipExternal = false } = options;

  const packages = await resolveDependencyTree(projectDir);
  const installedDependencyHash = await dependencyContentHash(packages);
  const registryMeta = offline ? new Map() : await fetchRegistryMeta(packages);

  const findings: Finding[] = [];
  for (const pkg of packages) {
    const ctx = await buildContext(pkg, registryMeta.get(pkg.id));
    for (const heuristic of ALL_HEURISTICS) {
      findings.push(...heuristic(ctx));
    }
  }

  if (!skipExternal) {
    findings.push(...(await runExternalChecks(projectDir)));
  }

  const manifest: AuditManifest = {
    schemaVersion: 1,
    agent: { name: agentName, version: agentVersion },
    codeHash: await hashAgentSource(projectDir),
    lockfileHash: hashDependencySet(packages.map((p) => p.id)),
    dependencyContentHash: installedDependencyHash,
    depCount: packages.length,
    scanner: { name: "rime-scanner", version: SCANNER_VERSION, policy: POLICY },
    findings,
    verdict: computeVerdict(findings),
    scannedAt: Math.floor(Date.now() / 1000),
  };

  return normalizeManifest(manifest);
}

async function runExternalChecks(projectDir: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  if (await isOsvScannerAvailable()) {
    findings.push(...(await runOsvScanner(projectDir)));
  } else {
    console.warn(
      "[rime] osv-scanner not installed — known-CVE coverage skipped. " +
        "This is an additive check per the build plan; not required for the demo to work.",
    );
  }

  findings.push(...(await runAuditSignatures(projectDir)));
  return findings;
}

/**
 * Hashes the agent's own source (excluding node_modules and other build
 * artifacts) so the manifest also commits to the agent's own code, not just
 * its dependencies. Deliberately simple: file paths + contents, sorted, so
 * the hash is stable across machines.
 */
async function hashAgentSource(projectDir: string): Promise<`0x${string}`> {
  const files = await listSourceFiles(projectDir);
  const hash = createHash("sha256");

  for (const file of files.sort()) {
    hash.update(file);
    hash.update(await readFile(path.join(projectDir, file)));
  }

  return `0x${hash.digest("hex")}`;
}

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", ".next", "coverage"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".mjs", ".cjs"]);

async function listSourceFiles(projectDir: string, sub = ""): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const dir = path.join(projectDir, sub);
  const entries = await readdir(dir, { withFileTypes: true });

  const files: string[] = [];
  for (const entry of entries) {
    const rel = path.join(sub, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) files.push(...(await listSourceFiles(projectDir, rel)));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(rel);
    }
  }
  return files;
}

export type { ResolvedPackage };
