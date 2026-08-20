/** Read-only slice of AgentRegistry's ABI — must stay in sync with
 * contracts/src/AgentRegistry.sol (see packages/agent/src/registry-abi.ts
 * for the write-side counterpart used by the agent itself). */
export const AGENT_REGISTRY_ABI = [
  {
    type: "function",
    name: "isCertified",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "certs",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "auditHash", type: "bytes32" },
      { name: "measurement", type: "bytes32" },
      { name: "issuedAt", type: "uint64" },
      { name: "expiresAt", type: "uint64" },
    ],
  },
  {
    type: "event",
    name: "Certified",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "auditHash", type: "bytes32", indexed: false },
      { name: "measurement", type: "bytes32", indexed: false },
      { name: "issuedAt", type: "uint64", indexed: false },
      { name: "expiresAt", type: "uint64", indexed: false },
    ],
  },
] as const;
