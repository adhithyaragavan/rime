/**
 * Wraps Google's osv-scanner for known-CVE coverage. This is intentionally
 * optional and fail-soft: osv-scanner is a separate Go binary (not on this
 * machine as of the initial build — install with `brew install osv-scanner`
 * or `go install github.com/google/osv-scanner/cmd/osv-scanner@latest`), and
 * per the plan's build order this wrap is additive, not load-bearing — the
 * demo must work with or without it installed.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Finding } from "@rime/shared";

const execFileAsync = promisify(execFile);

interface OsvResult {
  results?: {
    packages?: {
      package: { name: string; version: string };
      vulnerabilities?: { id: string; severity?: { type: string; score: string }[] }[];
    }[];
  }[];
}

export async function isOsvScannerAvailable(): Promise<boolean> {
  try {
    await execFileAsync("osv-scanner", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

export async function runOsvScanner(projectDir: string): Promise<Finding[]> {
  let stdout: string;
  try {
    // osv-scanner exits non-zero when it finds vulnerabilities — that's
    // expected output, not a failure, so we read stdout from the error too.
    const result = await execFileAsync(
      "osv-scanner",
      ["--lockfile", `${projectDir}/package-lock.json`, "--format", "json"],
      { maxBuffer: 20 * 1024 * 1024 },
    );
    stdout = result.stdout;
  } catch (err) {
    const withStdout = err as { stdout?: string };
    if (!withStdout.stdout) {
      console.warn(
        "[rime] osv-scanner not available or failed — skipping known-CVE check. " +
          "Install it for fuller coverage: brew install osv-scanner",
      );
      return [];
    }
    stdout = withStdout.stdout;
  }

  return parseOsvOutput(stdout);
}

export function parseOsvOutput(stdout: string): Finding[] {
  let parsed: OsvResult;
  try {
    parsed = JSON.parse(stdout) as OsvResult;
  } catch {
    return [];
  }

  const findings: Finding[] = [];
  for (const source of parsed.results ?? []) {
    for (const pkg of source.packages ?? []) {
      const ids = (pkg.vulnerabilities ?? []).map((v) => v.id);
      if (ids.length === 0) continue;

      findings.push({
        package: `${pkg.package.name}@${pkg.package.version}`,
        rule: "known-cve",
        severity: "high",
        detail: `osv-scanner: ${ids.join(", ")}`,
      });
    }
  }
  return findings;
}
