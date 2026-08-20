#!/usr/bin/env node
/**
 * `rime scan [dir]` — the entrypoint used both by the demo script and
 * by the agent's own self-check at boot. Writes the manifest to disk and
 * exits non-zero on a dirty verdict, so it composes in a shell pipeline
 * (`rime scan . && phala deploy ...`).
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { scan } from "./scan.ts";
import { auditHash } from "@rime/shared";

function parseArgs(argv: string[]) {
  const positional = argv.filter((a) => !a.startsWith("--"));
  return {
    projectDir: path.resolve(positional[0] ?? "."),
    offline: argv.includes("--offline"),
    skipExternal: argv.includes("--fast"),
    out: argv.find((a) => a.startsWith("--out="))?.slice("--out=".length) ?? "rime.manifest.json",
    agentName: argv.find((a) => a.startsWith("--name="))?.slice("--name=".length) ?? "agent",
    agentVersion:
      argv.find((a) => a.startsWith("--agent-version="))?.slice("--agent-version=".length) ?? "0.0.0",
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log(`[rime] scanning ${opts.projectDir}${opts.offline ? " (offline)" : ""}...`);
  const manifest = await scan(opts);
  const hash = auditHash(manifest);

  const outPath = path.resolve(opts.projectDir, opts.out);
  await writeFile(outPath, JSON.stringify(manifest, null, 2));

  console.log("");
  console.log(`  packages scanned : ${manifest.depCount}`);
  console.log(`  findings         : ${manifest.findings.length}`);
  console.log(`  verdict          : ${manifest.verdict.toUpperCase()}`);
  console.log(`  auditHash        : ${hash}`);
  console.log(`  manifest written : ${outPath}`);

  if (manifest.findings.length > 0) {
    console.log("\n  --- findings ---");
    for (const f of manifest.findings) {
      console.log(`  [${f.severity.padEnd(8)}] ${f.package}  (${f.rule})`);
      console.log(`             ${f.detail}`);
    }
  }

  process.exit(manifest.verdict === "dirty" ? 1 : 0);
}

main().catch((err) => {
  console.error("[rime] scan failed:", err instanceof Error ? err.message : err);
  process.exit(2);
});
