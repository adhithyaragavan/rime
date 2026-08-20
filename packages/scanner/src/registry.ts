/**
 * Best-effort npm registry lookups for the young-version and no-provenance
 * rules. Deliberately fail-soft: a demo cannot depend on network access at
 * judging time, so any failure here degrades those two rules to "no opinion"
 * rather than blocking the scan or contaminating the manifest.
 */
import type { RegistryMeta } from "./heuristics/types.ts";
import type { ResolvedPackage } from "./deptree.ts";

const REGISTRY = "https://registry.npmjs.org";
const FETCH_TIMEOUT_MS = 2000;
/** Cap network calls so a large tree can't stall the scan for minutes. */
const MAX_LOOKUPS = 60;

export async function fetchRegistryMeta(
  packages: readonly ResolvedPackage[],
): Promise<Map<string, RegistryMeta>> {
  const results = new Map<string, RegistryMeta>();
  const targets = packages.slice(0, MAX_LOOKUPS);

  await Promise.all(
    targets.map(async (pkg) => {
      const meta = await fetchOne(pkg).catch(() => undefined);
      if (meta) results.set(pkg.id, meta);
    }),
  );

  return results;
}

async function fetchOne(pkg: ResolvedPackage): Promise<RegistryMeta | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${REGISTRY}/${encodeURIComponent(pkg.name)}`, {
      signal: controller.signal,
    });
    if (!res.ok) return undefined;

    const doc = (await res.json()) as {
      time?: Record<string, string>;
      versions?: Record<string, { dist?: { attestations?: unknown } }>;
    };

    return {
      publishedAt: doc.time?.[pkg.version],
      hasProvenance: doc.versions?.[pkg.version]?.dist?.attestations !== undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}
