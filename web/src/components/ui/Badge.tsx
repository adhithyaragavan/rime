export type Tone = "good" | "bad" | "warn" | "neutral";

export function Badge({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`badge badge-${tone}`}>{label}</span>;
}
