import { useState } from "react";

/** A hex value (hash, address, measurement) — click to copy, full value in
 * the title attribute for hover, middle-truncated by default since a raw
 * 32-byte hash is 66 characters and wraps badly inline. */
export function Hex({ value, truncate = true }: { value: string; truncate?: boolean }) {
  const [copied, setCopied] = useState(false);

  const display = truncate && value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard API can be unavailable (permissions, non-secure context) —
      // copying is a convenience, not load-bearing, so fail silently.
    }
  }

  return (
    <button type="button" className="hex" title={value} onClick={copy}>
      {display}
      <span className="hex-copy">{copied ? "copied" : "copy"}</span>
    </button>
  );
}
