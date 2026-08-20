/**
 * Minimal ABI for the calls the agent actually makes. Kept hand-written and
 * small rather than importing Foundry's full compiler artifact, so the agent
 * package has no build-time dependency on `forge build` having run.
 *
 * Must stay in sync with contracts/src/AgentRegistry.sol's certify()
 * signature — there's no automated check for that here, given the timeline;
 * if certify() reverts unexpectedly, this is the first thing to diff.
 */
export const AGENT_REGISTRY_ABI = [
  {
    type: "function",
    name: "certify",
    stateMutability: "nonpayable",
    inputs: [
      { name: "quote", type: "bytes" },
      { name: "auditHash", type: "bytes32" },
      { name: "epoch", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isCertified",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;
