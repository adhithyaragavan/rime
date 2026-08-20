/**
 * A version published in the last week is unremarkable for an active project,
 * but combined with other findings it's a real signal: attackers who compromise
 * a maintainer account typically publish and exploit within days. Fails open —
 * see PackageContext.registry's contract in types.ts.
 */
import type { Finding } from "@rime/shared";
import type { Heuristic } from "./types.ts";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const youngVersion: Heuristic = ({ pkg, registry }) => {
  if (!registry?.publishedAt) return [];

  const publishedMs = Date.parse(registry.publishedAt);
  if (Number.isNaN(publishedMs)) return [];

  const ageMs = Date.now() - publishedMs;
  if (ageMs < 0 || ageMs > SEVEN_DAYS_MS) return [];

  const ageDays = (ageMs / (24 * 60 * 60 * 1000)).toFixed(1);
  return [
    {
      package: pkg.id,
      rule: "young-version",
      severity: "low",
      detail: `published ${ageDays} day(s) ago`,
    },
  ];
};
