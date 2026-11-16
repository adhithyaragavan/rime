/**
 * Highest-signal rule in the set: the large majority of real npm supply-chain
 * attacks (event-stream, ua-parser-js, polyfill.io-adjacent incidents, the
 * 2025 chalk/debug compromise) execute via a lifecycle script that runs the
 * instant `npm install` finishes, before any application code runs at all.
 */
import type { Finding } from "@rime/shared";
import type { Heuristic } from "./types.ts";

const LIFECYCLE_HOOKS = ["preinstall", "install", "postinstall"] as const;

export const installScript: Heuristic = ({ pkg, scripts }) => {
  const findings: Finding[] = [];

  for (const hook of LIFECYCLE_HOOKS) {
    const command = scripts[hook];
    if (!command) continue;

    findings.push({
      package: pkg.id,
      rule: "install-script",
      // Direct deps are usually deliberate (native addons); a transitive
      // dependency running one is far more likely to be attacker-added.
      severity: pkg.isDirect ? "medium" : "high",
      detail: `${hook}: ${truncate(command)}`,
    });
  }

  return findings;
};

function truncate(s: string, max = 120): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
