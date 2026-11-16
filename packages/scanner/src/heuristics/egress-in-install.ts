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

/**
 * Strips comments before matching so a license header or doc comment
 * mentioning a URL (extremely common at the top of an inlined install
 * script) doesn't get flagged as a network call. `//` and `#` only count
 * as a comment start when preceded by whitespace/line-start, so they don't
 * eat the `//` inside `https://...` itself.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/.*$/gm, "$1")
    .replace(/(^|\s)#.*$/gm, "$1");
}

export const egressInInstall: Heuristic = ({ pkg, installScriptSource }) => {
  if (!installScriptSource) return [];

  const source = stripComments(installScriptSource);
  const findings: Finding[] = [];
  for (const [pattern, label] of NETWORK_PATTERNS) {
    if (pattern.test(source)) {
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
