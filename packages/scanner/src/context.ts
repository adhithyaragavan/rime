/**
 * Builds the PackageContext each heuristic reads: the package's own scripts
 * plus the source of whatever those scripts run, so egress/obfuscation can
 * inspect actual script content and not just the command line that invokes it.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PackageContext, RegistryMeta } from "./heuristics/types.ts";
import type { ResolvedPackage } from "./deptree.ts";

const LIFECYCLE_HOOKS = ["preinstall", "install", "postinstall"] as const;
/** Guards against pulling a multi-MB bundled script into memory per package. */
const MAX_SOURCE_BYTES = 200_000;

export async function buildContext(
  pkg: ResolvedPackage,
  registryMeta?: RegistryMeta,
): Promise<PackageContext> {
  const scripts = await readScripts(pkg.dir);
  const installScriptSource = await resolveInstallScriptSource(pkg.dir, scripts);

  return { pkg, scripts, installScriptSource, registry: registryMeta };
}

async function readScripts(dir: string): Promise<Record<string, string>> {
  try {
    const raw = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    return raw.scripts ?? {};
  } catch {
    // Package not installed on disk (offline scan against lockfile only) — the
    // egress/obfuscation rules simply see no script source, which is correct:
    // they have no basis to flag anything they can't read.
    return {};
  }
}

async function resolveInstallScriptSource(
  dir: string,
  scripts: Record<string, string>,
): Promise<string> {
  const parts: string[] = [];

  for (const hook of LIFECYCLE_HOOKS) {
    const command = scripts[hook];
    if (!command) continue;
    parts.push(command);

    // If the command shells out to a local .js file, inline its content too —
    // that's where an attacker actually hides logic; the command line itself
    // is usually just `node install.js`.
    const jsFile = command.match(/(\S+\.js)\b/)?.[1];
    if (jsFile) {
      const content = await readFileCapped(path.join(dir, jsFile));
      if (content) parts.push(content);
    }
  }

  return parts.join("\n");
}

async function readFileCapped(filePath: string): Promise<string | undefined> {
  try {
    const content = await readFile(filePath, "utf8");
    return content.length > MAX_SOURCE_BYTES ? content.slice(0, MAX_SOURCE_BYTES) : content;
  } catch {
    return undefined;
  }
}
