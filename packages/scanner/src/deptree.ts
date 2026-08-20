/**
 * Resolves the full dependency tree, including transitive packages.
 *
 * Reads package-lock.json rather than walking node_modules, because the lockfile
 * is the authoritative record of what *should* be installed. The agent's
 * self-check later walks the real node_modules and compares, which is precisely
 * how a tampered install gets caught.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

export interface ResolvedPackage {
  /** Bare package name, e.g. "left-pad" or "@scope/pkg". */
  name: string;
  version: string;
  /** "name@version" — the identity used for hashing. */
  id: string;
  /** Absolute path to the package on disk, if installed. */
  dir: string;
  /** Registry tarball URL, when the lockfile records one. */
  resolved?: string;
  /** Subresource integrity hash from the lockfile. */
  integrity?: string;
  /** npm records this when a package defines pre/post/install scripts. */
  hasInstallScript: boolean;
  /** True for direct dependencies of the scanned project. */
  isDirect: boolean;
}

interface LockfileEntry {
  name?: string;
  version?: string;
  resolved?: string;
  integrity?: string;
  hasInstallScript?: boolean;
  dev?: boolean;
  link?: boolean;
}

interface Lockfile {
  lockfileVersion?: number;
  packages?: Record<string, LockfileEntry>;
}

/**
 * Package name from a lockfile key like "node_modules/@scope/pkg/node_modules/dep".
 * The name is everything after the final "node_modules/" segment.
 */
export function nameFromLockKey(key: string): string {
  const marker = "node_modules/";
  const last = key.lastIndexOf(marker);
  return last === -1 ? key : key.slice(last + marker.length);
}

export async function resolveDependencyTree(
  projectDir: string,
  options: { includeDev?: boolean } = {},
): Promise<ResolvedPackage[]> {
  const { includeDev = false } = options;
  const lockPath = path.join(projectDir, "package-lock.json");

  let lock: Lockfile;
  try {
    lock = JSON.parse(await readFile(lockPath, "utf8")) as Lockfile;
  } catch (cause) {
    throw new Error(
      `Could not read ${lockPath}. Rime needs a lockfile to know the exact ` +
        `dependency set — run "npm install" first.`,
      { cause },
    );
  }

  if (!lock.packages) {
    throw new Error(
      `Lockfile at ${lockPath} has no "packages" field (lockfileVersion ` +
        `${lock.lockfileVersion ?? "unknown"}). Needs npm 7+ (lockfileVersion 2 or 3).`,
    );
  }

  const directNames = await readDirectDependencyNames(projectDir, includeDev);
  const packages: ResolvedPackage[] = [];

  for (const [key, entry] of Object.entries(lock.packages)) {
    // "" is the root project itself, not a dependency.
    if (key === "") continue;
    // Linked workspace packages have no independent published identity.
    if (entry.link) continue;
    if (entry.dev && !includeDev) continue;

    const name = entry.name ?? nameFromLockKey(key);
    const version = entry.version;
    if (!version) continue;

    packages.push({
      name,
      version,
      id: `${name}@${version}`,
      dir: path.join(projectDir, key),
      resolved: entry.resolved,
      integrity: entry.integrity,
      hasInstallScript: entry.hasInstallScript === true,
      isDirect: directNames.has(name),
    });
  }

  return packages.sort((a, b) => a.id.localeCompare(b.id));
}

async function readDirectDependencyNames(
  projectDir: string,
  includeDev: boolean,
): Promise<Set<string>> {
  try {
    const pkg = JSON.parse(
      await readFile(path.join(projectDir, "package.json"), "utf8"),
    ) as Record<string, Record<string, string> | undefined>;

    return new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...(includeDev ? Object.keys(pkg.devDependencies ?? {}) : []),
    ]);
  } catch {
    // A missing package.json only costs us the direct/transitive distinction.
    return new Set();
  }
}
