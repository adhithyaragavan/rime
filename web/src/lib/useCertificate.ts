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

        setResult({
          key,
          query:
            issuedAt === 0n
              ? { status: "uncertified" }
              : {
                  status: "ok",
                  cert: {
                    auditHash,
                    measurement,
                    issuedAt: Number(issuedAt),
                    expiresAt: Number(expiresAt),
                  },
                },
        });
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
