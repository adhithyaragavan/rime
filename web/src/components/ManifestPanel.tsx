import type { AuditManifest } from "@rime/shared";
import { Panel } from "./ui/Panel.tsx";
import { Badge } from "./ui/Badge.tsx";
import { Hex } from "./ui/Hex.tsx";
import { SeverityRollup } from "./SeverityRollup.tsx";
import { FindingsTable } from "./FindingsTable.tsx";
import type { ManifestQuery } from "../lib/useManifest.ts";

export function ManifestPanel({ manifest }: { manifest: ManifestQuery }) {
  return (
    <Panel eyebrow="What actually ran" title="Audit manifest">
      {manifest.status === "loading" && <p>Loading…</p>}
      {manifest.status === "error" && <p className="error">Error fetching manifest: {manifest.message}</p>}
      {manifest.status === "ok" && <ManifestBody manifest={manifest.manifest} />}
    </Panel>
  );
}

function ManifestBody({ manifest }: { manifest: AuditManifest }) {
  const blocking = manifest.findings.filter((f) => f.severity === "high" || f.severity === "critical").length;

  return (
    <>
      <div className="manifest-summary">
        <Badge label={manifest.verdict.toUpperCase()} tone={manifest.verdict === "clean" ? "good" : "bad"} />
        <span>
          {manifest.agent.name}@{manifest.agent.version}
        </span>
        <span>{manifest.depCount} packages scanned</span>
        <span>
          {manifest.findings.length} finding{manifest.findings.length === 1 ? "" : "s"}
          {manifest.findings.length > 0 && blocking === 0 ? " — none blocking" : ""}
        </span>
      </div>
      <SeverityRollup findings={manifest.findings} />
      <dl className="manifest-meta">
        <dt>scanner</dt>
        <dd>
          {manifest.scanner.name}@{manifest.scanner.version} ({manifest.scanner.policy})
        </dd>
        <dt>scanned</dt>
        <dd>{new Date(manifest.scannedAt * 1000).toLocaleString()}</dd>
        <dt>codeHash</dt>
        <dd>
          <Hex value={manifest.codeHash} />
        </dd>
        <dt>lockfileHash</dt>
        <dd>
          <Hex value={manifest.lockfileHash} />
        </dd>
      </dl>
      <FindingsTable findings={manifest.findings} />
    </>
  );
}
