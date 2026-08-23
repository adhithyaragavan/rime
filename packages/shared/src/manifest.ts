/**
 * FROZEN INTERFACE — do not change without telling all three workstreams.
 *
 * The AuditManifest is what the scanner (B) produces, what the agent (A) commits
 * to inside the enclave, and what the registry (C) checks on-chain. Its hash is
 * bound into the TDX quote's report_data, so every byte of it is load-bearing:
 * if two machines canonicalize the same manifest differently, the on-chain check
 * fails with no useful error message. Hence the strict ordering rules below.
 */
import { keccak256, toHex, type Hex } from "viem";

export const MANIFEST_SCHEMA_VERSION = 1 as const;

export type Severity = "low" | "medium" | "high" | "critical";
export type Verdict = "clean" | "dirty";

/** A single thing the scanner objected to, in one package. */
export interface Finding {
  /** Exact "name@version" of the offending package. */
  package: string;
  /** Rule id, e.g. "install-script". See scanner/src/heuristics. */
  rule: string;
  severity: Severity;
  /** Human-readable evidence, shown in the demo UI. */
  detail: string;
}

export interface AuditManifest {
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  agent: {
    name: string;
    version: string;
  };
  /** keccak256 over the agent's own source tree (not its dependencies). */
  codeHash: Hex;
  /** keccak256 over the resolved dependency set. See hashDependencySet. */
  lockfileHash: Hex;
  /** sha256 root over the actual installed package files and lockfile package metadata. */
  dependencyContentHash: Hex;
  /** Number of resolved packages, including transitive. Display only. */
  depCount: number;
  scanner: {
    name: string;
    version: string;
    /** Policy identifier, so a verdict is interpretable months later. */
    policy: string;
  };
  findings: Finding[];
  verdict: Verdict;
  /** Unix seconds. Display only — freshness is enforced on-chain, not here. */
  scannedAt: number;
}

/**
 * Deterministic JSON: object keys sorted, no insignificant whitespace.
 *
 * JSON.stringify preserves insertion order, which differs between the scanner
 * writing a manifest and the agent re-reading one from disk. Sorting recursively
 * makes the encoding depend only on content.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value === null || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    sorted[key] = sortDeep(source[key]);
  }
  return sorted;
}

/**
 * Findings arrive in filesystem-walk order, which is not stable across machines.
 * Sort before hashing so the same tree always yields the same auditHash.
 */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      a.package.localeCompare(b.package) ||
      a.rule.localeCompare(b.rule) ||
      a.detail.localeCompare(b.detail),
  );
}

/** Normalize into the exact form that gets hashed. Always call before hashing. */
export function normalizeManifest(manifest: AuditManifest): AuditManifest {
  return { ...manifest, findings: sortFindings(manifest.findings) };
}

/**
 * THE hash. Bound into the quote's report_data by the agent and re-checked by
 * the registry, so scanner and agent must both go through this function.
 */
export function auditHash(manifest: AuditManifest): Hex {
  return keccak256(toHex(canonicalize(normalizeManifest(manifest))));
}

/**
 * Hash of the resolved dependency set, independent of lockfile format.
 *
 * Taken over "name@version" pairs rather than the lockfile bytes because npm
 * rewrites lockfiles cosmetically (key order, metadata) between versions without
 * any dependency actually changing. The agent recomputes this inside the enclave
 * against what is really installed, so it has to survive that churn.
 */
export function hashDependencySet(packages: readonly string[]): Hex {
  const unique = [...new Set(packages)].sort();
  return keccak256(toHex(unique.join("\n")));
}

/** A manifest is clean iff nothing at or above `high` was found. */
export function computeVerdict(findings: readonly Finding[]): Verdict {
  const blocking = findings.some(
    (f) => f.severity === "high" || f.severity === "critical",
  );
  return blocking ? "dirty" : "clean";
}
