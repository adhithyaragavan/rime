import type { Address } from "viem";
import { Panel } from "./ui/Panel.tsx";
import { Badge } from "./ui/Badge.tsx";
import { Hex } from "./ui/Hex.tsx";
import { ExplorerLink } from "./ui/ExplorerLink.tsx";
import { Countdown } from "./Countdown.tsx";
import type { CertQuery } from "../lib/useCertificate.ts";

export function CertificatePanel({
  cert,
  registryAddress,
  registryLabel,
}: {
  cert: CertQuery;
  registryAddress: Address;
  registryLabel: string;
}) {
  return (
    <Panel
      eyebrow={`Registry: ${registryLabel}`}
      title={
        <>
          On-chain certificate <ExplorerLink kind="address" value={registryAddress} label="view registry ↗" />
        </>
      }
    >
      {cert.status === "loading" && <p>Loading…</p>}
      {cert.status === "error" && <p className="error">Error reading registry: {cert.message}</p>}
      {cert.status === "uncertified" && (
        <div className="uncertified">
          <Badge label="NOT CERTIFIED" tone="bad" />
          <p>This agent has never certified against this registry, or its last certify() call reverted.</p>
        </div>
      )}
      {cert.status === "ok" && (
        <div className="certified">
          <Countdown expiresAt={cert.cert.expiresAt} />
          <dl className="cert-fields">
            <dt>auditHash</dt>
            <dd>
              <Hex value={cert.cert.auditHash} />
            </dd>
            <dt>measurement</dt>
            <dd>
              <Hex value={cert.cert.measurement} />
            </dd>
            <dt>issued</dt>
            <dd>{new Date(cert.cert.issuedAt * 1000).toLocaleString()}</dd>
            <dt>expires</dt>
            <dd>{new Date(cert.cert.expiresAt * 1000).toLocaleString()}</dd>
          </dl>
        </div>
      )}
    </Panel>
  );
}
