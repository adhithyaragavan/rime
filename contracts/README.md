# Rime contracts

## Verified on-chain facts (2026-08-20)

Automata's own L2 testnet (chain id 1398243) is **retired** — its RPC
(`https://rpc.ata.network/testnet`) returns:

    Automata Attestation L2 is retired; remaining L2 balances were refunded...

Do not target it. Instead, Automata's DCAP verifier is deployed at the same
address on several standard testnets (a CREATE2 deterministic deployment).
Confirmed directly by pulling bytecode from independent public RPCs — not
just a doc page or search summary, both of which have been unreliable
sources for this specific fact:

| Chain | Chain ID | `DCAP_ATTESTATION_ADDRESS` |
|---|---|---|
| **Base Sepolia** (default) | 84532 | `0x95175096a9B74165BE0ac84260cc14Fc1c0EF5FF` |
| Ethereum Sepolia | 11155111 | `0x95175096a9B74165BE0ac84260cc14Fc1c0EF5FF` |
| Arbitrum Sepolia | 421614 | `0x95175096a9B74165BE0ac84260cc14Fc1c0EF5FF` |

Verify this yourself before trusting it for a real deploy:

```bash
cast code 0x95175096a9B74165BE0ac84260cc14Fc1c0EF5FF \
  --rpc-url https://base-sepolia-rpc.publicnode.com
```

Should return substantial bytecode, not `0x`. The function selector for
`verifyAndAttestOnChain(bytes)` (`cast sig "verifyAndAttestOnChain(bytes)"`
→ `0x38d8480a`) is present in that bytecode's dispatch table, confirming
`src/interfaces/IDcapAttestation.sol`'s signature matches the real contract.

## Why Base Sepolia

Same verifier address as the others; picked for fast blocks, cheap gas, and
well-known faucets (e.g. the Coinbase Developer Platform faucet).

## Layout

- `src/lib/TDXQuote.sol` — fixed-offset field extraction from a raw TDX v4
  quote (report_data, MRTD). Offsets are the documented TD report body
  layout; **must still be confirmed against `fixtures/real-quote.hex`** once
  that exists (Day 0 task) — see the library's header comment.
- `src/interfaces/IDcapAttestation.sol` — Automata's verifier, called by
  address rather than reimplemented.
- `src/AgentRegistry.sol` — the project's core claim: binds `auditHash` into
  the quote's report_data and enforces a freshness window.
- `src/GatedVault.sol` — demo payload: withdrawals gated on
  `AgentRegistry.isCertified`.
- `script/Deploy.s.sol` — deploys both against a real `IDcapAttestation`.
- `test/` — 20 tests, all against `MockDcapAttestation` (hardware-signature
  verification stubbed out). The real verifier has separately been
  confirmed to accept a real quote — see below.

## The gate: confirmed against a real quote

`fixtures/real-quote.hex` (repo root's `../fixtures/`) is a real,
hardware-signed TDX quote pulled from a GCP Confidential VM via
`configfs-tsm`. It verifies against the real deployed contract above:

```bash
cast call 0x95175096a9B74165BE0ac84260cc14Fc1c0EF5FF \
  "verifyAndAttestOnChain(bytes)(bool,bytes)" \
  "0x$(cat ../fixtures/real-quote.hex)" \
  --rpc-url https://base-sepolia-rpc.publicnode.com
# → true
```

## Commands

```bash
forge test -vv                              # unit tests (mocked verifier)

# Deploy to Base Sepolia
export DCAP_ATTESTATION_ADDRESS=0x95175096a9B74165BE0ac84260cc14Fc1c0EF5FF
export PRIVATE_KEY=0x...
forge script script/Deploy.s.sol \
  --rpc-url https://base-sepolia-rpc.publicnode.com \
  --broadcast
```
