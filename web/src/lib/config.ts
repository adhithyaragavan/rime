/**
 * Demo-time configuration. All overridable via Vite env vars
 * (VITE_-prefixed, see web/.env) so the same build can point at whichever
 * agent/registry pair is live when you're rehearsing vs. presenting.
 */
import type { Address } from "viem";

export const REGISTRY_ADDRESS = (import.meta.env.VITE_REGISTRY_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

export const AGENT_ADDRESS = (import.meta.env.VITE_AGENT_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

export const RPC_URL: string = import.meta.env.VITE_RPC_URL ?? "https://base-sepolia-rpc.publicnode.com";

/** Where the page fetches the human-readable manifest to display findings.
 * Simplest demo setup: serve rime.manifest.json next to the page (or
 * from the same origin as the agent). */
export const MANIFEST_URL: string = import.meta.env.VITE_MANIFEST_URL ?? "/rime.manifest.json";

/** How often to re-poll on-chain state, in ms. */
export const POLL_INTERVAL_MS = 5000;
