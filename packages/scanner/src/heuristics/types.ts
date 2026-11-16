/**
 * A heuristic inspects one resolved package and returns zero or more findings.
 * Kept as plain functions (not classes) so the scanner can run them in any
 * order and drop one without touching the others — see the build order note
 * in the plan: install-script and egress-in-install alone must carry the
 * tampered-agent demo, so nothing here may depend on another rule's output.
 */
import type { Finding } from "@rime/shared";
import type { ResolvedPackage } from "../deptree.ts";

/** Subset of npm registry metadata relevant to the young-version/provenance rules. */
export interface RegistryMeta {
  /** ISO timestamp this exact version was published, if known. */
  publishedAt?: string;
  /** True if npm recorded a provenance (sigstore/build) attestation for this version. */
  hasProvenance?: boolean;
}

export interface PackageContext {
  pkg: ResolvedPackage;
  /** Concatenated source of any install-lifecycle scripts, "" if none/unreadable. */
  installScriptSource: string;
  /** package.json "scripts" field for this package, if readable. */
  scripts: Record<string, string>;
  /**
   * Registry metadata, fetched best-effort over the network. undefined means
   * "not fetched" (offline run, or the fetch failed) — rules that depend on
   * this MUST treat undefined as "no opinion", never as "suspicious", so a
   * network hiccup during judging can't turn a clean demo dirty.
   */
  registry?: RegistryMeta;
}

export type Heuristic = (ctx: PackageContext) => Finding[];
