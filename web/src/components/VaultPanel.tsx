import { Panel } from "./ui/Panel.tsx";
import { Badge } from "./ui/Badge.tsx";
import { ExplorerLink } from "./ui/ExplorerLink.tsx";
import { GATED_VAULT_ADDRESS } from "../lib/config.ts";
import type { VaultPreview } from "../lib/useVaultPreview.ts";

/** The consequence, made concrete: GatedVault.withdraw() is gated on
 * registry.isCertified(msg.sender) as its very first check
 * (contracts/src/GatedVault.sol). This simulates that exact call against
 * the real deployed vault — a stale or tampered certificate doesn't just
 * flip a badge on this page, it stops a real contract from paying out. */
export function VaultPanel({ preview }: { preview: VaultPreview }) {
  return (
    <Panel eyebrow="The consequence" title={<>Gated vault <ExplorerLink kind="address" value={GATED_VAULT_ADDRESS} label="view vault ↗" /></>}>
      <p className="vault-intro">Simulated call: <code className="mono">withdraw(agent, 1 wei)</code>, as the certified agent.</p>
      {preview.status === "loading" && <p>Simulating…</p>}
      {preview.status === "unknown-error" && <p className="error">{preview.message}</p>}
      {preview.status === "would-succeed" && (
        <div className="vault-result">
          <Badge label="GATE OPEN" tone="good" />
          <p>Certification check passes — the call would proceed (this vault happens to hold 0 balance in the demo).</p>
        </div>
      )}
      {preview.status === "reverts" && preview.errorName === "NotCertified" && (
        <div className="vault-result">
          <Badge label="BLOCKED" tone="bad" />
          <p>
            Reverts: <code className="mono">NotCertified(agent)</code> — no certificate, or it's stale. The money
            does not move.
          </p>
        </div>
      )}
      {preview.status === "reverts" && preview.errorName === "InsufficientBalance" && (
        <div className="vault-result">
          <Badge label="GATE OPEN" tone="good" />
          <p>
            Certification check passes (the revert is <code className="mono">InsufficientBalance</code>, from the
            vault holding 0 balance in this demo — not from the certification gate).
          </p>
        </div>
      )}
      {preview.status === "reverts" && preview.errorName !== "NotCertified" && preview.errorName !== "InsufficientBalance" && (
        <p className="error">Reverts: {preview.errorName}</p>
      )}
    </Panel>
  );
}
