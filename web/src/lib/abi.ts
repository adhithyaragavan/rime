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
    type: "function",
    name: "freshnessWindow",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint64" }],
  },
  {
    type: "function",
    name: "reportDataIsHashed",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
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

/** Read-only slice of GatedVault's ABI — contracts/src/GatedVault.sol.
 * Used only to preview what a withdraw() call would do (via eth_call
 * simulation), never to actually send a transaction from the browser. */
export const GATED_VAULT_ABI = [
  {
    type: "function",
    name: "registry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "error",
    name: "NotCertified",
    inputs: [{ name: "agent", type: "address" }],
  },
  {
    type: "error",
    name: "InsufficientBalance",
    inputs: [
      { name: "requested", type: "uint256" },
      { name: "available", type: "uint256" },
    ],
  },
] as const;
