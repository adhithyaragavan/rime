import type { Heuristic } from "./types.ts";
import { installScript } from "./install-script.ts";
import { egressInInstall } from "./egress-in-install.ts";
import { obfuscation } from "./obfuscation.ts";
import { typosquat } from "./typosquat.ts";
import { youngVersion } from "./young-version.ts";
import { noProvenance } from "./no-provenance.ts";

/**
 * Order matters only for readability of output, not for correctness — each
 * heuristic is independent (see types.ts). install-script and
 * egress-in-install come first because they're the two the demo depends on.
 */
export const ALL_HEURISTICS: Heuristic[] = [
  installScript,
  egressInInstall,
  obfuscation,
  typosquat,
  youngVersion,
  noProvenance,
];

export * from "./types.ts";
