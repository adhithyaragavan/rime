/**
 * The three-act state machine the demo panel drives: which manifest is
 * being compared, and which registry the certificate panel reads from.
 * Deliberately just two enums + a lookup — the acts are combinations of
 * existing, already-verified on-chain/manifest state, not fabricated ones.
 * See DEMO.md for the script this powers.
 */
import { MANIFESTS, REGISTRIES, type ManifestKey, type RegistryKey } from "./config.ts";

export type Act = "clean" | "tampered" | "stale";

export interface ActConfig {
  label: string;
  description: string;
  manifest: ManifestKey;
  registry: RegistryKey;
}

export const ACTS: Record<Act, ActConfig> = {
  clean: {
    label: "1 — Clean",
    description: "Real manifest, real certificate. The recomputed hash matches the chain.",
    manifest: "root",
    registry: "production",
  },
  tampered: {
    label: "2 — Tampered",
    description: "Swap in a dependency tree with a malicious package. The hash no longer matches.",
    manifest: "dirty",
    registry: "production",
  },
  stale: {
    label: "3 — Stale",
    description: "Same certificate, but read from a registry with a 15-second freshness window.",
    manifest: "root",
    registry: "staleDemo",
  },
} as const;

export function resolveAct(act: Act) {
  const cfg = ACTS[act];
  return {
    ...cfg,
    manifestUrl: MANIFESTS[cfg.manifest].url,
    registryAddress: REGISTRIES[cfg.registry].address,
    registryLabel: REGISTRIES[cfg.registry].label,
  };
}
