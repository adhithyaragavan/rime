/**
 * Flags packages whose name is one small edit away from a popular package —
 * the classic typosquat pattern (e.g. "reqeust" for "request"). The reference
 * list (data/top-packages.json) is a curated ~100-package sample of high-value
 * targets, not npm's actual top 1000; good enough to catch a planted demo
 * package, not a substitute for a real popularity-ranked corpus.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Finding } from "@rime/shared";
import type { Heuristic } from "./types.ts";

const dataPath = fileURLToPath(new URL("../../data/top-packages.json", import.meta.url));
const POPULAR: string[] = JSON.parse(readFileSync(dataPath, "utf8"));
const POPULAR_SET = new Set(POPULAR);

/** Small edit distance = likely a typo; we only care about distance 1–2. */
function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3; // short-circuit: too far apart to matter
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
  for (let j = 1; j < cols; j++) d[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[rows - 1][cols - 1];
}

export const typosquat: Heuristic = ({ pkg }) => {
  if (POPULAR_SET.has(pkg.name)) return []; // it IS the real package

  const findings: Finding[] = [];
  for (const target of POPULAR) {
    const dist = levenshtein(pkg.name, target);
    if (dist >= 1 && dist <= 2) {
      findings.push({
        package: pkg.id,
        rule: "typosquat",
        severity: "medium",
        detail: `name is ${dist} edit(s) from popular package "${target}"`,
      });
      break; // nearest match is enough
    }
  }
  return findings;
};
