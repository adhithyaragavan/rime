/**
 * npm provenance cryptographically ties a published package to the CI build
 * and source commit that produced it. Its absence isn't proof of tampering —
 * most of the ecosystem doesn't use it yet — so this stays "low" and is meant
 * to nudge, not accuse. Fails open: see PackageContext.registry in types.ts.
 */
import type { Finding } from "@rime/shared";
import type { Heuristic } from "./types.ts";

export const noProvenance: Heuristic = ({ pkg, registry }) => {
  if (!registry || registry.hasProvenance === undefined) return [];
  if (registry.hasProvenance) return [];

  return [
    {
      package: pkg.id,
      rule: "no-provenance",
      severity: "low",
      detail: "published without npm provenance attestation",
    },
  ];
};
