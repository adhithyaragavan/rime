import { EXPLORER_BASE } from "../../lib/config.ts";

function short(value: string, lead = 6, tail = 4): string {
  return value.length <= lead + tail + 2 ? value : `${value.slice(0, lead + 2)}…${value.slice(-tail)}`;
}

/** Links out to BaseScan for an address or transaction hash — every claim
 * this page makes about on-chain state should be one click from the
 * source of truth, not just a displayed value. */
export function ExplorerLink({ kind, value, label }: { kind: "address" | "tx"; value: string; label?: string }) {
  return (
    <a
      className="explorer-link mono"
      href={`${EXPLORER_BASE}/${kind}/${value}`}
      target="_blank"
      rel="noreferrer"
    >
      {label ?? short(value)}
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}
