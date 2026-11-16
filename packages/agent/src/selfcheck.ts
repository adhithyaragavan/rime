/**
 * Boot-time integrity check: recompute what's actually installed and compare
 * against the manifest the scanner produced at build time. If they diverge —
 * someone swapped node_modules after the image was built, or the container
 * was started from a different image than the one that was scanned — refuse
 * to start. This is what makes "the code I'm running matches what was
 * audited" true at runtime, not just at scan time; the report_data binding
 * only proves the manifest existed, this proves it still applies right now.
 */
import { resolveDependencyTree } from "@rime/scanner/src/deptree.ts";
import { hashDependencySet, type AuditManifest } from "@rime/shared";
import { dependencyContentHash } from "@rime/shared/src/dependency-content.ts";

export class IntegrityViolation extends Error {
  readonly field: string;
  readonly expected: string;
  readonly actual: string;

  constructor(field: string, expected: string, actual: string) {
    super(
      `Installed dependency tree does not match the audited manifest.\n` +
        `  expected ${field}: ${expected}\n` +
        `  actual ${field}:   ${actual}\n` +
        `This container will not start with an unaudited dependency tree.`,
    );
    this.name = "IntegrityViolation";
    this.field = field;
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * @throws IntegrityViolation if what's on disk doesn't match the manifest.
 * Call this before doing anything else at boot.
 */
export async function verifyIntegrityOrThrow(
  projectDir: string,
  manifest: AuditManifest,
): Promise<void> {
  const packages = await resolveDependencyTree(projectDir);
  const actual = hashDependencySet(packages.map((p) => p.id));

  if (actual !== manifest.lockfileHash) {
    throw new IntegrityViolation("lockfileHash", manifest.lockfileHash, actual);
  }

  const actualContentHash = await dependencyContentHash(packages);
  if (actualContentHash !== manifest.dependencyContentHash) {
    throw new IntegrityViolation("dependencyContentHash", manifest.dependencyContentHash, actualContentHash);
  }
}
