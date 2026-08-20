/**
 * The demo's third act made visible: a certificate is either fresh, stale, or
 * absent, and this page shows which, live. The countdown is the point —
 * "an attestation from six months ago tells you nothing about what's running
 * now" only lands if the audience watches the number actually run out.
 */
import "./App.css";
import { AGENT_ADDRESS, REGISTRY_ADDRESS } from "./lib/config.ts";
import { useCertificate } from "./lib/useCertificate.ts";
import { useManifest } from "./lib/useManifest.ts";
import { useNow } from "./lib/useNow.ts";
import { auditHash, type AuditManifest, type Finding } from "@rime/shared";

function short(addr: string, lead = 6, tail = 4): string {
  return addr.length <= lead + tail + 2 ? addr : `${addr.slice(0, lead + 2)}…${addr.slice(-tail)}`;
}

function fmtDuration(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const s = Math.abs(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${sign}${m}:${r.toString().padStart(2, "0")}`;
}

function StatusBadge({ label, tone }: { label: string; tone: "good" | "bad" | "neutral" }) {
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

function FreshnessCountdown({ expiresAt }: { expiresAt: number }) {
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

function FindingsTable({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return <p className="empty-state">No findings — dependency tree scanned clean.</p>;
  }
  return (
    <table className="findings">
      <thead>
        <tr>
          <th>Severity</th>
          <th>Package</th>
          <th>Rule</th>
          <th>Detail</th>
        </tr>
      </thead>
      <tbody>
        {findings.map((f, i) => (
          <tr key={i} className={`sev-${f.severity}`}>
            <td>{f.severity}</td>
            <td>{f.package}</td>
            <td>{f.rule}</td>
            <td>{f.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function App() {
  const cert = useCertificate(AGENT_ADDRESS);
  const manifest = useManifest();

  return (
    <main className="page">
      <header>
        <h1>Rime</h1>
        <p className="subtitle">
          Runtime supply-chain certification — agent <code>{short(AGENT_ADDRESS)}</code>, registry{" "}
          <code>{short(REGISTRY_ADDRESS)}</code>
        </p>
      </header>

      <section className="panel">
        <h2>On-chain certificate</h2>
        {cert.status === "loading" && <p>Loading…</p>}
        {cert.status === "error" && <p className="error">Error reading registry: {cert.message}</p>}
        {cert.status === "uncertified" && (
          <div className="uncertified">
            <StatusBadge label="NOT CERTIFIED" tone="bad" />
            <p>This agent has never certified, or its last certify() call reverted.</p>
          </div>
        )}
        {cert.status === "ok" && (
          <div className="certified">
            <FreshnessCountdown expiresAt={cert.cert.expiresAt} />
            <dl>
              <dt>auditHash</dt>
              <dd>
                <code>{cert.cert.auditHash}</code>
              </dd>
              <dt>measurement</dt>
              <dd>
                <code>{cert.cert.measurement}</code>
              </dd>
              <dt>issued</dt>
              <dd>{new Date(cert.cert.issuedAt * 1000).toLocaleString()}</dd>
              <dt>expires</dt>
              <dd>{new Date(cert.cert.expiresAt * 1000).toLocaleString()}</dd>
            </dl>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Audit manifest</h2>
        {manifest.status === "loading" && <p>Loading…</p>}
        {manifest.status === "error" && <p className="error">Error fetching manifest: {manifest.message}</p>}
        {manifest.status === "ok" && (
          <>
            <div className="manifest-summary">
              <StatusBadge
                label={manifest.manifest.verdict.toUpperCase()}
                tone={manifest.manifest.verdict === "clean" ? "good" : "bad"}
              />
              <span>{manifest.manifest.depCount} packages scanned</span>
              <span>{manifest.manifest.findings.length} findings</span>
            </div>
            {cert.status === "ok" && (
              <ManifestMatchNotice cert={cert.cert} manifest={manifest.manifest} />
            )}
            <FindingsTable findings={manifest.manifest.findings} />
          </>
        )}
      </section>
    </main>
  );
}

/**
 * Recomputes the manifest's hash client-side and compares it to what the
 * chain actually certified — this is the "don't trust, verify" moment: the
 * page doesn't just display a hash it's told, it proves the readable
 * manifest and the on-chain commitment are the same document.
 */
function ManifestMatchNotice({
  cert,
  manifest,
}: {
  cert: { auditHash: `0x${string}` };
  manifest: AuditManifest;
}) {
  const recomputed = auditHash(manifest);
  const matches = recomputed === cert.auditHash;
  return (
    <p className={matches ? "match" : "mismatch"}>
      {matches
        ? "✓ This manifest's hash matches the on-chain certificate."
        : "✗ This manifest does NOT match the on-chain certificate — do not trust it."}
    </p>
  );
}
