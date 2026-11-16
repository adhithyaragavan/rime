/**
 * Simulates GatedVault.withdraw() via eth_call (viem's simulateContract) —
 * a real read against the real deployed contract, no private key needed
 * (eth_call doesn't require a signature, only a "from" address). This is
 * the demo's third act made concrete: the moment a certificate goes stale,
 * this simulation starts reverting with NotCertified, on the same
 * money-moving path a real caller would hit.
 */
import { useEffect, useState } from "react";
import { createPublicClient, http, BaseError, ContractFunctionRevertedError, type Address } from "viem";
import { baseSepolia } from "viem/chains";

import { GATED_VAULT_ABI } from "./abi.ts";
import { GATED_VAULT_ADDRESS, RPC_URL, POLL_INTERVAL_MS } from "./config.ts";

export type VaultPreview =
  | { status: "loading" }
  | { status: "would-succeed" }
  | { status: "reverts"; errorName: string; args: readonly unknown[] }
  | { status: "unknown-error"; message: string };

const client = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });

export function useVaultPreview(agent: Address): VaultPreview {
  const [state, setState] = useState<VaultPreview>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        await client.simulateContract({
          address: GATED_VAULT_ADDRESS,
          abi: GATED_VAULT_ABI,
          functionName: "withdraw",
          args: [agent, 1n],
          account: agent,
        });
        if (!cancelled) setState({ status: "would-succeed" });
      } catch (err) {
        if (cancelled) return;
        // simulateContract throws a wrapped ContractFunctionExecutionError;
        // the decoded custom error (NotCertified/InsufficientBalance) is
        // further down its .cause chain, not the top-level error itself.
        const reverted =
          err instanceof BaseError ? err.walk((e) => e instanceof ContractFunctionRevertedError) : undefined;
        if (reverted instanceof ContractFunctionRevertedError) {
          setState({
            status: "reverts",
            errorName: reverted.data?.errorName ?? "unknown",
            args: reverted.data?.args ?? [],
          });
        } else {
          setState({ status: "unknown-error", message: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [agent]);

  return state;
}
