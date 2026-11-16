import type { Finding, Severity } from "@rime/shared";

const ORDER: Severity[] = ["critical", "high", "medium", "low"];

/** Severity counts at a glance, plus the nuance the verdict badge alone
 * hides: computeVerdict() (packages/shared/src/manifest.ts) only returns
 * "dirty" when a finding is high or critical — a manifest full of low/medium
 * findings still reads "clean", which is correct but easy to misread as
 * "zero findings" if the count isn't shown next to it. */
export function SeverityRollup({ findings }: { findings: Finding[] }) {
  const counts = findings.reduce<Partial<Record<Severity, number>>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});
  const present = ORDER.filter((sev) => counts[sev]);

  if (present.length === 0) return null;

  return (
    <div className="severity-rollup">
      {present.map((sev) => (
        <span key={sev} className={`severity-chip sev-${sev}`}>
          {counts[sev]} {sev}
        </span>
      ))}
    </div>
  );
}
