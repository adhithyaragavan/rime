/**
 * Polls AgentRegistry.certs(agent) on an interval and derives freshness
 * client-side. Polling rather than watching events: simpler, and the demo
 * only ever cares about "what's true right now", which a poll answers
 * directly without needing to reconstruct state from a log.
 *
 * Takes a registry address as a parameter (rather than a fixed import)
 * so the demo panel can point the same hook at either the production
 * registry or the 15-second stale-demo registry. Result is tagged with the
 * (registry, agent) key it was fetched for, so switching registries reads
 * as "loading" on render immediately rather than needing an extra
 * synchronous setState reset inside the effect.
 *
 * Demo mode (VITE_DEMO_MODE=true): when the on-chain certificate is expired,
 * time-shifts issuedAt/expiresAt forward so the countdown is live. The real
 * auditHash and measurement from on-chain are preserved — only timestamps
 * are shifted. This lets the demo run without a live TDX VM re-certifying.
 */
import { useEffect, useState } from "react";
import { createPublicClient, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";

import { AGENT_REGISTRY_ABI } from "./abi.ts";
import { POLL_INTERVAL_MS, RPC_URL } from "./config.ts";

export interface CertificateState {
  auditHash: `0x${string}`;
  measurement: `0x${string}`;
  issuedAt: number;
  expiresAt: number;
}

export type CertQuery =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "uncertified" }
  | { status: "ok"; cert: CertificateState };

type TaggedResult = { key: string; query: CertQuery };

const client = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

/**
 * In demo mode, if the certificate is expired, shift timestamps forward
 * so the certificate appears freshly issued. The window length (expiresAt -
 * issuedAt) is preserved from the real on-chain data. The shift is computed
 * once per page load so the countdown runs naturally from that point.
 */
const demoStartedAt = Math.floor(Date.now() / 1000);

function maybeDemoShift(cert: CertificateState): CertificateState {
  if (!DEMO_MODE) return cert;

  const nowSec = Math.floor(Date.now() / 1000);
  // Only shift if the certificate is actually expired
  if (cert.expiresAt > nowSec) return cert;

  const window = cert.expiresAt - cert.issuedAt; // original freshness window
  return {
    ...cert,
    issuedAt: demoStartedAt,
    expiresAt: demoStartedAt + window,
  };
}

export function useCertificate(registry: Address, agent: Address): CertQuery {
  const key = `${registry}:${agent}`;
  const [result, setResult] = useState<TaggedResult>({ key, query: { status: "loading" } });

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [auditHash, measurement, issuedAt, expiresAt] = await client.readContract({
          address: registry,
          abi: AGENT_REGISTRY_ABI,
          functionName: "certs",
          args: [agent],
        });
        if (cancelled) return;

        if (issuedAt === 0n) {
          setResult({ key, query: { status: "uncertified" } });
        } else {
          const raw: CertificateState = {
            auditHash,
            measurement,
            issuedAt: Number(issuedAt),
            expiresAt: Number(expiresAt),
          };
          setResult({
            key,
            query: { status: "ok", cert: maybeDemoShift(raw) },
          });
        }
      } catch (err) {
        if (!cancelled) {
          setResult({ key, query: { status: "error", message: err instanceof Error ? err.message : String(err) } });
        }
      }
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [registry, agent, key]);

  return result.key === key ? result.query : { status: "loading" };
}

