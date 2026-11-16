/**
 * Demo-time configuration. All overridable via Vite env vars
 * (VITE_-prefixed, see web/.env) so the same build can point at whichever
 * agent/registry pair is live when you're rehearsing vs. presenting.
 */
import type { Address } from "viem";

export const AGENT_ADDRESS = (import.meta.env.VITE_AGENT_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

export const RPC_URL: string = import.meta.env.VITE_RPC_URL ?? "https://base-sepolia-rpc.publicnode.com";

/** How often to re-poll on-chain state, in ms. */
export const POLL_INTERVAL_MS = 5000;

export const EXPLORER_BASE = "https://sepolia.basescan.org";

/**
 * The two live registries this demo switches between. "production" has the
 * real 30-minute freshness window; "stale-demo" is a throwaway registry
 * deployed with a 15-second window purely so the countdown can run out on
 * camera in seconds rather than half an hour — see ARCHITECTURE.md/README.md
 * "Status" for how it was verified. Both point at MockDcapAttestation's real
 * counterpart (Automata's deployed DCAP verifier) in production; the
 * stale-demo registry is otherwise identical, just a shorter window.
 */
export const REGISTRIES = {
  production: {
    label: "Production (30 min window)",
    address: (import.meta.env.VITE_REGISTRY_ADDRESS ??
      "0x0000000000000000000000000000000000000000") as Address,
  },
  staleDemo: {
    label: "Stale-demo (15 s window)",
    address: (import.meta.env.VITE_STALE_REGISTRY_ADDRESS ??
      "0xed77437a8040d7B68b927C16909D82010f1DaC4f") as Address,
  },
} as const;

export type RegistryKey = keyof typeof REGISTRIES;

export const GATED_VAULT_ADDRESS = (import.meta.env.VITE_VAULT_ADDRESS ??
  "0x32382F3F0Ec4BC6E98d3d17B8BBDa2D33d31d336") as Address;

/**
 * The three manifests the demo panel swaps between. "root" is the real one
 * bound on-chain by the production certificate (22 deps, verdict clean
 * despite 10 low/medium findings — none are high/critical, which is what
 * computeVerdict() actually gates on). "dirty" is the tampered-dependency
 * fixture (evil-pkg, verdict dirty) used for the mismatch act.
 */
export const MANIFESTS = {
  root: { label: "Real (22 deps, bound on-chain)", url: "/manifests/root.json" },
  dirty: { label: "Tampered (evil-pkg injected)", url: "/manifests/dirty.json" },
  clean: { label: "Minimal clean (1 dep)", url: "/manifests/clean.json" },
} as const;

export type ManifestKey = keyof typeof MANIFESTS;
