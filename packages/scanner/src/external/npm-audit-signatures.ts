/**
 * Wraps `npm audit signatures`, which checks each installed package's
 * registry signature against npm's public keys. A missing/invalid signature
 * means the package could have been tampered with in transit or the registry
 * itself was compromised — a different failure mode than the provenance
 * check (which is about build-time integrity, not transport integrity).
 * Fail-soft: command availability was confirmed at plan time, but a flaky
 * network mid-demo must not crash the scan.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Finding } from "@rime/shared";

const execFileAsync = promisify(execFile);

export async function runAuditSignatures(projectDir: string): Promise<Finding[]> {
  try {
    const { stdout } = await execFileAsync("npm", ["audit", "signatures", "--json"], {
      cwd: projectDir,
      maxBuffer: 20 * 1024 * 1024,
    });
    return parseAuditSignatures(stdout);
  } catch (err) {
    // `npm audit signatures` exits non-zero when it finds invalid signatures —
    // that's real output, so try to parse stdout from the error before giving up.
    const withStdout = err as { stdout?: string };
    if (withStdout.stdout) {
      const parsed = parseAuditSignatures(withStdout.stdout);
      if (parsed.length > 0) return parsed;
    }
    console.warn("[rime] npm audit signatures failed or found nothing parseable — skipping.");
    return [];
  }
}

interface AuditSignaturesOutput {
  invalid?: { name: string; version: string }[];
}

export function parseAuditSignatures(stdout: string): Finding[] {
  try {
    const parsed = JSON.parse(stdout) as AuditSignaturesOutput;
    return (parsed.invalid ?? []).map((p) => ({
      package: `${p.name}@${p.version}`,
      rule: "invalid-signature",
      severity: "critical" as const,
      detail: "registry signature verification failed",
    }));
  } catch {
    return [];
  }
}
