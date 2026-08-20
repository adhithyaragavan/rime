/**
 * A postinstall script that reaches the network is the step where a compromised
 * package typically pulls a second-stage payload or exfiltrates environment
 * secrets. Scoped to install-lifecycle scripts specifically — application code
 * making network calls is normal and out of scope for this rule.
 */
import type { Finding } from "@rime/shared";
import type { Heuristic } from "./types.ts";

const NETWORK_PATTERNS: [RegExp, string][] = [
  [/\bcurl\s/i, "curl"],
  [/\bwget\s/i, "wget"],
  [/\bnc\s+-/i, "netcat"],
  [/require\(['"]https?['"]\)/i, "require('http(s)')"],
  [/fetch\(/i, "fetch()"],
  [/https?:\/\/[^\s'")]+/i, "hardcoded URL"],
];

export const egressInInstall: Heuristic = ({ pkg, installScriptSource }) => {
  if (!installScriptSource) return [];

  const findings: Finding[] = [];
  for (const [pattern, label] of NETWORK_PATTERNS) {
    if (pattern.test(installScriptSource)) {
      findings.push({
        package: pkg.id,
        rule: "egress-in-install",
        severity: "critical",
        detail: `install script contains network call (${label})`,
      });
      break; // one finding per package is enough signal; avoid noise
    }
  }
  return findings;
};
