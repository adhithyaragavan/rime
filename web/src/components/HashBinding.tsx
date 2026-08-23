/**
 * The "money shot": recompute auditHash() from the manifest, client-side,
 * and show it byte-for-byte against what the chain actually certified.
 * Not a displayed value being trusted — a value being re-derived and
 * compared live.
 *
 * Framing note: keccak256 has an avalanche effect, so a one-package change
 * doesn't flip one byte — it flips roughly half of them. We report the
 * actual differing-byte count rather than implying a single-byte diff,
 * because that's both more honest and a stronger demonstration of
 * tamper-evidence than a single flipped byte would be.
 */
function bytes(hex: string): string[] {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out: string[] = [];
  for (let i = 0; i < clean.length; i += 2) out.push(clean.slice(i, i + 2));
  return out;
}

export function HashBinding({
  recomputed,
  onChain,
  recomputedLabel,
  onChainLabel,
}: {
  recomputed: `0x${string}`;
  onChain: `0x${string}`;
  recomputedLabel: string;
  onChainLabel: string;
}) {
  const a = bytes(recomputed);
  const b = bytes(onChain);
  const diffCount = a.reduce((n, byte, i) => n + (byte !== b[i] ? 1 : 0), 0);
  const matches = diffCount === 0;

  return (
    <div className="hash-binding">
      <div className="hash-binding-row">
        <span className="hash-binding-row-label">{recomputedLabel}</span>
        <div className="byte-grid mono">
          {a.map((byte, i) => (
            <span key={i} className={`byte-cell ${byte !== b[i] ? "byte-diff" : ""}`}>
              {byte}
            </span>
          ))}
        </div>
      </div>
      <div className="hash-binding-row">
        <span className="hash-binding-row-label">{onChainLabel}</span>
        <div className="byte-grid mono">
          {b.map((byte, i) => (
            <span key={i} className={`byte-cell ${byte !== a[i] ? "byte-diff" : ""}`}>
              {byte}
            </span>
          ))}
        </div>
      </div>
      <p className={matches ? "match" : "mismatch"}>
        {matches
          ? "✓ 32 of 32 bytes match — this manifest is what the chain certified."
          : `✗ ${diffCount} of 32 bytes differ — this manifest does NOT match the on-chain certificate.`}
      </p>
    </div>
  );
}
