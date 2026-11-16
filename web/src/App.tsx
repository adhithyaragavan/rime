/**
 * The demo made visible: a certificate is either fresh, stale, or absent,
 * and this page shows which, live — recomputing every claim client-side
 * rather than trusting a displayed value. The pinned demo panel at the
 * bottom switches between the three verified acts (README.md "Status":
 * clean / tampered / stale) by pointing at real, already-deployed
 * manifests and registries — nothing here is fabricated for the demo.
 */
import "./App.css";
import { useState } from "react";
import { auditHash } from "@rime/shared";

import { AGENT_ADDRESS } from "./lib/config.ts";
import { resolveAct, type Act } from "./lib/demo.ts";
import { useCertificate } from "./lib/useCertificate.ts";
import { useManifest } from "./lib/useManifest.ts";
import { useVaultPreview } from "./lib/useVaultPreview.ts";

import { Hero } from "./components/Hero.tsx";
import { ClaimStrip } from "./components/ClaimStrip.tsx";
import { CertificatePanel } from "./components/CertificatePanel.tsx";
import { HashBinding } from "./components/HashBinding.tsx";
import { ManifestPanel } from "./components/ManifestPanel.tsx";
import { HowItWorks } from "./components/HowItWorks.tsx";
import { VaultPanel } from "./components/VaultPanel.tsx";
import { DemoPanel } from "./components/DemoPanel.tsx";
import { Panel } from "./components/ui/Panel.tsx";

export default function App() {
  const [act, setAct] = useState<Act>("clean");
  const resolved = resolveAct(act);

  const cert = useCertificate(resolved.registryAddress, AGENT_ADDRESS);
  const manifest = useManifest(resolved.manifestUrl);
  const vault = useVaultPreview(AGENT_ADDRESS);

  return (
    <main className="page">
      <Hero />
      <ClaimStrip />

      <CertificatePanel cert={cert} registryAddress={resolved.registryAddress} registryLabel={resolved.registryLabel} />

      {cert.status === "ok" && manifest.status === "ok" && (
        <Panel eyebrow="Don't trust, verify" title="The binding">
          <HashBinding
            recomputed={auditHash(manifest.manifest)}
            onChain={cert.cert.auditHash}
            recomputedLabel="recomputed from manifest"
            onChainLabel="on-chain certificate"
          />
        </Panel>
      )}

      <ManifestPanel manifest={manifest} />

      <Panel eyebrow="The mechanism" title="How it works">
        <HowItWorks />
      </Panel>

      <VaultPanel preview={vault} />

      <DemoPanel act={act} onChange={setAct} />
    </main>
  );
}
