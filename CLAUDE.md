# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Rime binds an AI agent's dependency-audit verdict into a TDX hardware
attestation's `report_data` field and enforces it on-chain with a freshness
window. A certificate in `AgentRegistry` means "this scanned-clean
dependency tree ran, unmodified, in a genuine enclave, as of N minutes ago"
— not just "an enclave ran something once." Read `ARCHITECTURE.md` before
making non-trivial changes; it explains why each piece exists, not just what
it does. `README.md` has current build status and outstanding action items.

**Phala Cloud is blocked** (account top-up failed) — a real quote was
obtained a different way instead: a raw GCP TDX Confidential VM via
`configfs-tsm`, no dstack. It's already been proven against the real
on-chain verifier (`fixtures/real-quote.hex`, see "The gate: passed, on
real hardware" in `ARCHITECTURE.md`). Both quote sources are real code
paths now (`packages/agent/src/quote-provider.ts`), not one blocked
placeholder — see "Quote providers" below.

## Commands

```bash
npm install                                              # installs all workspaces (packages/*, web)

# Tests
node --test packages/shared/test/*.test.ts packages/scanner/test/*.test.ts   # all TS tests (45 total)
node --test packages/shared/test/manifest.test.ts                            # single file
cd contracts && forge test -vv                                               # all Solidity tests (20)
cd contracts && forge test --match-test test_certify_succeedsWithCorrectCommitment -vv  # single test
cd contracts && forge build                                                  # compile only

# Scanner CLI
node --experimental-strip-types packages/scanner/src/cli.ts <project-dir> [--offline] [--fast]
# --offline skips npm registry lookups; --fast also skips osv-scanner/npm audit signatures

# Web
cd web && npm run build     # tsc -b && vite build — typechecks + production build
cd web && npm run dev       # local dev server

# Local TEE dev (no Phala account needed — see below)
./scripts/run-simulator.sh
./scripts/dstack-exec.sh node --experimental-strip-types scripts/generate-fixture.ts --out fixtures/simulator-quote.hex --audit-hash 0x<32b> --agent 0x<20b> --epoch 1
docker stop rime-dstack-sim
```

There is no separate lint command at the root; `web` has `npm run lint`
(oxlint). No `npm run build` at the root either — each package is run
directly via `node --experimental-strip-types`, there's no compile step for
the TS packages.

## Runtime constraint: no build step

TypeScript here runs via Node's native `--experimental-strip-types`, not
`tsc`/`ts-node`/esbuild. This means **erasable-syntax-only**: no TypeScript
constructor parameter properties (`constructor(public readonly x: T)`), no
enums with values, nothing that generates runtime code beyond stripping type
annotations. This already caused one real bug (`packages/agent/src/selfcheck.ts`)
— when adding a class with fields set from the constructor, assign them in
the constructor body, not via parameter property shorthand.

`web/` is the one exception — it's a normal Vite/React app, bundled and
type-checked by `tsc -b`/esbuild as usual.

## Architecture (see `ARCHITECTURE.md` for the full picture)

Four packages plus contracts, connected by one value that must hash
identically everywhere it's computed or compared: `auditHash`.

- **`packages/shared`** — the frozen interfaces. `manifest.ts`'s
  `canonicalize()`/`auditHash()` and `reportdata.ts`'s `buildCommitment()`
  are each mirrored by a Solidity equivalent in `contracts/` — the two
  implementations *must* encode identically, or `AgentRegistry.certify()`
  fails on-chain with an opaque revert. Any change here needs the Solidity
  side checked too.
- **`packages/scanner`** — `AuditManifest` producer. Six heuristics in
  `heuristics/`, ordered so `install-script` + `egress-in-install` alone
  carry the "tampered dependency" story; everything after is corroborating,
  not load-bearing. External tool wraps (`external/osv.ts`,
  `external/npm-audit-signatures.ts`) and registry lookups (`registry.ts`)
  are deliberately fail-open — a missing binary or network hiccup logs a
  warning and returns no findings rather than crashing the scan.
- **`contracts`** (Foundry) — where the claim is actually enforced, not just
  asserted. `AgentRegistry.certify()` checks three things: real TDX hardware
  (via Automata's deployed `IDcapAttestation`, called by address — not
  reimplemented), an optional measurement allowlist, and
  `report_data == keccak256(abi.encode(auditHash, agent, epoch))`. That last
  check is the entire point of the project. `TDXQuote.sol`'s byte offsets
  for parsing a raw quote are empirically validated (see "Validated facts"
  in ARCHITECTURE.md), not just assumed from docs. All 20 tests run against
  `MockDcapAttestation` — hardware signature verification is Automata's
  problem, not re-tested here.
- **`packages/agent`** — enclave runtime. Boot order matters:
  load the manifest (baked into the image at build time, **never**
  regenerated at runtime) → `selfcheck.ts` compares it against what's
  actually installed and refuses to boot on mismatch → `attest.ts` requests
  a quote (via whichever `QuoteProvider` is selected, see below) and calls
  `certify()`, then re-certifies on a heartbeat under the freshness window.
- **`web`** — status page polling `AgentRegistry` directly and recomputing
  `auditHash()` client-side to verify against what's on-chain, rather than
  trusting a displayed value.

### Chain

Base Sepolia (84532), not Automata's own testnet — that one is retired.
Automata's DCAP verifier (`0x95175096a9B74165BE0ac84260cc14Fc1c0EF5FF`) is
independently verified (bytecode pulled from public RPCs, selector checked
against the dispatch table) at that address on Base/Ethereum/Arbitrum
Sepolia. Details and re-verification steps: `contracts/README.md`.

### Quote providers

`packages/agent/src/quote-provider.ts`, selected via
`RIME_QUOTE_PROVIDER=dstack|configfs-tsm` (default `dstack`):
- `DstackQuoteProvider` — production path, Phala Cloud or any dstack CVM.
- `ConfigfsTsmQuoteProvider` — any raw TDX Confidential VM, no dstack.
  Reads/writes `/sys/kernel/config/tsm/report/*/{inblob,outblob}` directly.
  Needs root. This is what actually produced `fixtures/real-quote.hex`
  (manually, on a GCP `c3-standard-4` VM, before this provider existed to
  automate it).

Tradeoff, stated once so it doesn't get lost: dstack measures the container
(RTMR3 = compose + image digest); raw `configfs-tsm` only measures the VM's
boot chain. The report_data binding and freshness window — the two things
on the "never drop" list — are unaffected either way.

### dstack simulator gotchas

Two non-obvious things, both documented at the top of `scripts/run-simulator.sh`:
1. Doesn't build natively on macOS (`sev` crate has a Linux-only cfg gate)
   — built inside a container (`vendor/simulator-build/`) instead.
2. Listens on Unix sockets, not a TCP port. Docker Desktop for Mac doesn't
   pass bind-mounted Unix sockets through to the host reliably, so anything
   that talks to it must run inside a container on the same volume
   (`scripts/dstack-exec.sh`) — not directly from a host terminal.

Simulator quotes are structurally real (same offsets, same encoding) but
never hardware-signed — useful for validating data-layout logic, useless
for testing whether Automata's on-chain signature check passes. That check
has since been done for real — see "Quote providers" above.

### Getting a real quote off a GCP TDX Confidential VM

```bash
gcloud compute instances create <name> --zone=us-central1-a \
  --machine-type=c3-standard-4 --confidential-compute-type=TDX \
  --maintenance-policy=TERMINATE \
  --image-family=ubuntu-2204-lts --image-project=ubuntu-os-cloud

# on the VM:
sudo apt-get install -y linux-modules-extra-gcp && sudo modprobe tdx_guest
sudo mkdir /sys/kernel/config/tsm/report/t1   # fails with ENOENT if TDX isn't really active
```
`ConfigfsTsmQuoteProvider` automates the read/write from here. Cost is
~$0.20–0.25/hr — **delete the VM** the moment you're done with it.
