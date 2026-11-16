import { useNow } from "../lib/useNow.ts";

function fmtDuration(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const s = Math.abs(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${sign}${m}:${r.toString().padStart(2, "0")}`;
}

/** The hero element — a live countdown to certificate expiry. The whole
 * point of the freshness window only lands if the audience watches the
 * number actually run out, so this re-renders every second. */
export function Countdown({ expiresAt }: { expiresAt: number }) {
  const now = useNow(1000);
  const remaining = expiresAt - Math.floor(now / 1000);
  const isStale = remaining <= 0;
  const isWarning = !isStale && remaining < 300; // last 5 minutes

  return (
    <div className={`countdown ${isStale ? "countdown-stale" : isWarning ? "countdown-warn" : "countdown-ok"}`}>
      <div className="countdown-value">{isStale ? "EXPIRED" : fmtDuration(remaining)}</div>
      <div className="countdown-label">{isStale ? "certificate is stale" : "until certificate expires"}</div>
    </div>
  );
}
