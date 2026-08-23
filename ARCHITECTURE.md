# Rime — Architecture

## The claim, precisely

An `AgentRegistry` certificate for agent address `A` means:

> The dependency tree audited as `auditHash` was scanned clean (or the
> findings are known), and a genuine TDX enclave holding `A`'s key attested
> to running exactly that tree, no more than `freshnessWindow` seconds ago.

Not "an enclave ran something once" — that's what off-the-shelf TEE hosting
already gives you. The specific, narrow thing this repo adds is binding an
**audit verdict** into the **hardware attestation** and enforcing a
**freshness window** on-chain. Everything below exists to make that one
sentence true and checkable by anyone, without trusting the agent's operator.

## End-to-end flow

```
┌─────────────┐     ┌───────────────┐     ┌──────────────┐
│   BUILD      │     │   RUNTIME      │     │   CHAIN      │
│ (your laptop)│     │ (TDX guest VM) │     │ (Base Sepolia)│
└─────────────┘     └───────────────┘     └──────────────┘
       │                     │                     │
  scan deps            self-check tree      AgentRegistry
  → AuditManifest      against baked-in     .certify(
  → auditHash =        manifest, refuse            quote,
    keccak256(          boot on mismatch          auditHash,
    canonical(m))       │                          epoch)
       │                commitment =                │
       │                keccak256(abi.encode(  ┌─────┴─────┐
       │                auditHash, agent,      │  verify   │
       │                epoch))                │  quote is │
       │                │                      │  genuine  │
       └───────────────► write commitment to    │  TDX (via │
                         configfs-tsm inblob,    │  Automata │
                         read quote from         │  DCAP)    │
                         outblob                 └─────┬─────┘
                         │                              │
                         heartbeat: re-certify           check
                         every ~25 min (< 30 min         report_data
                         freshness window)                == commitment
                                                           │
                                                     certs[agent] =
                                                     {auditHash, mr,
                                                      issuedAt,
                                                      expiresAt}
                                                           │
                                                     GatedVault
                                                     .withdraw()
                                                     requires
                                                     isCertified()
```

The only value that crosses every boundary unchanged is `auditHash`. It's
computed once (scanner), never recomputed by anything that could be
compromised (the agent's self-check *compares against* the baked-in
manifest, it doesn't regenerate one), and it's the thing hardware-signed
into the quote. If any link in that chain is tampered with, the final
`report_data == commitment` check on-chain fails and `certify()` reverts.

## Components

### `packages/shared` — the frozen interfaces

Everything else depends on this package producing byte-identical output on
every machine, because a manifest that hashes differently on two machines
fails on-chain with an undiagnosable revert.

- **`manifest.ts`** — `AuditManifest` type, `canonicalize()` (recursively
  sorts object keys before JSON-stringifying — insertion order differs
  between "scanner just wrote this" and "agent read this back off disk"),
  `sortFindings()`, `auditHash()` (the one function everything else calls),
  `hashDependencySet()` (hashes `name@version` pairs, not lockfile bytes —
  npm rewrites lockfiles cosmetically between versions without any real
  dependency changing).
- **`reportdata.ts`** — `buildCommitment(auditHash, agent, epoch)` →
  `keccak256(abi.encode(...))`, which **must** encode identically to
  `AgentRegistry.sol`'s Solidity version of the same computation. Also
  `extractReportData()` / `TDX_REPORT_DATA_OFFSET` (568) — a TS mirror of
  `contracts/src/lib/TDXQuote.sol`'s on-chain parsing, used to cross-check
  the two implementations agree (see `scripts/generate-fixture.ts`).

Toolchain constraint worth knowing: this repo runs on Node's native
`--experimental-strip-types` (no build step). That means **no TypeScript
parameter properties, no enums with values** — anything that generates
runtime code beyond stripping type annotations will fail. Already bit us
once in `selfcheck.ts`.

### `packages/scanner` — the audit

`agentcert scan <dir>` (bin name is `rime`) → `AuditManifest`.

1. `deptree.ts` resolves the full dependency set from `package-lock.json`
   (lockfileVersion 2/3 — needs the `packages` key, not the legacy
   `dependencies` tree).
2. `context.ts` reads each package's lifecycle scripts and inlines any local
   `.js` file they invoke, so the heuristics can inspect actual script
   content, not just the command line.
3. Six heuristics run per package (`heuristics/`), in an order chosen
   deliberately: `install-script` and `egress-in-install` alone are enough
   to carry the tampered-dependency story (a `postinstall` that phones
   home), so everything after — `obfuscation`, `typosquat`,
   `young-version`, `no-provenance` — is corroborating signal, not
   load-bearing.
4. `external/osv.ts` and `external/npm-audit-signatures.ts` wrap real
   tooling (osv-scanner, `npm audit signatures`) for known-CVE and
   signature-tampering coverage. Both **fail open** — a missing binary or a
   network hiccup logs a warning and returns no findings, it never crashes
   the scan or blocks a demo.
5. `young-version`/`no-provenance` hit the npm registry (`registry.ts`) with
   a 2s timeout and a 60-package cap; also fail open (`registry?:
   RegistryMeta` — `undefined` means "no opinion," never "suspicious").

Verdict is `dirty` iff any finding is `high` or `critical` severity
(`computeVerdict` in `manifest.ts`).

### `contracts` — the enforcement

Foundry project, Solidity ^0.8.24. **This is where the claim actually gets
checked**, not just asserted.

- **`src/lib/TDXQuote.sol`** — fixed-offset extraction of `report_data`
  (offset 568, 64 bytes) and MRTD/measurement (offset 184, 48 bytes) from a
  raw TDX v4 quote. These offsets are the documented TD report body layout
  **and** empirically confirmed (see "Validated facts" below) against a
  real quote pulled from real TDX hardware.
- **`src/interfaces/IDcapAttestation.sol`** — Automata's deployed verifier.
  We call it (`verifyAndAttestOnChain`), we don't reimplement DCAP
  verification. Its `bytes output` on success is deliberately unused —
  `AgentRegistry` parses `report_data`/measurement straight from the raw
  quote via `TDXQuote.sol` instead, so it stays correct even if `output`'s
  encoding differs from what we'd guess. **Not `view`** — see "A bug only a
  real deploy could catch" below for why that matters.
- **`src/AgentRegistry.sol`** — `certify(quote, auditHash, epoch)`:
  1. `dcap.verifyAndAttestOnChain(quote)` — is this really TDX hardware?
  2. Optional measurement allowlist check (`allowedMeasurement[mr]`, gated
     by `measurementAllowlistEnabled` — off by default so early iteration
     isn't blocked by needing to pre-register an image hash).
  3. `report_data == keccak256(abi.encode(auditHash, msg.sender, epoch))`
     — the actual claim. `reportDataIsHashed` (immutable, set at deploy)
     picks between comparing against the commitment raw or
     `sha256(commitment)` — confirmed empirically (see below) to be `raw`.
  4. Writes `certs[msg.sender] = {auditHash, measurement, issuedAt,
     expiresAt: now + freshnessWindow}`.
  `isCertified(agent)` — `issuedAt != 0 && block.timestamp < expiresAt`.
  That's the entire external read surface anything else needs.
- **`src/GatedVault.sol`** — `withdraw()` requires
  `registry.isCertified(msg.sender)`. Intentionally thin: it's the demo
  payload, not a real treasury design. All three demo acts (clean/
  tampered/stale) are enforced by one `require`.

20 Foundry tests, all against `MockDcapAttestation` (a stubbed verifier —
hardware signature checking is Automata's problem, not something worth
re-testing here). Covers: correct commitment succeeds; wrong auditHash,
wrong agent, wrong epoch, or hardware-check failure all revert; freshness
expiry flips `isCertified` to false; re-certifying extends the window; both
`reportDataIsHashed` modes; the measurement allowlist. See
`contracts/README.md` for the verified chain/address facts and how to
re-verify them yourself.

### `packages/agent` — the enclave-side runtime

Boot sequence (`src/index.ts`):
1. Load `rime.manifest.json` — **baked in ahead of time**, never
   regenerated at runtime. An agent auditing its own tree at boot could be
   fooled the same way the tree itself could be tampered with.
2. `selfcheck.ts`: recompute the installed dependency set's hash, compare
   against the manifest's `lockfileHash`. Refuse to start (`process.exit(1)`)
   on mismatch. This is what makes "matches what was audited" true *right
   now*, not just "was true when scanned" — the report_data binding proves
   the manifest existed, this proves it still applies.
3. `attest.ts`: build the commitment, request a quote via
   `quote-provider.ts`, submit `certify()` on-chain via viem. Repeats on a
   heartbeat (`RIME_HEARTBEAT_MS`, default 25 min — under the 30 min
   freshness window so a healthy process never lets its certificate lapse).

Runs as a plain Node process under systemd on the TDX guest VM — see "Live
agent" below. No container layer: `ConfigfsTsmQuoteProvider` talks directly
to the VM's kernel interface, so there's nothing a container boundary would
add here.

### `web` — the status page

React + Vite, no heavy UI framework. Two live panels:
- **On-chain certificate** (`useCertificate.ts`, polls `certs(agent)` every
  5s) — a countdown that visibly turns red and pulses once the
  certificate's freshness window elapses. This is the demo's third act made
  visible; the point only lands if the number actually counts down on
  screen.
- **Audit manifest** (`useManifest.ts`, fetches a static
  `rime.manifest.json`) — findings table, and a client-side
  recomputation of `auditHash()` compared against what's actually on-chain,
  so the page proves the readable manifest and the on-chain commitment are
  the same document rather than just asserting it.

Theme-aware CSS (light/dark via `prefers-color-scheme`), no external fonts
or CDN dependencies — works fully offline at judging.

## Quote provider

`packages/agent/src/quote-provider.ts`'s `ConfigfsTsmQuoteProvider` reads a
hardware-signed TDX quote via `configfs-tsm` — the standard Linux TEE
attestation interface (kernel ≥6.7, `CONFIG_TSM_REPORTS`): write 64 bytes
of report_data to `/sys/kernel/config/tsm/report/*/inblob`, read the quote
back from `outblob`. Validated against a real GCP `c3-standard-4` TDX
Confidential VM.

**A real tradeoff worth stating plainly:** MRTD/RTMRs here measure the
VM's boot chain, not a specific containerized workload — there's no
container-measurement layer in this setup. The optional measurement
allowlist (`AgentRegistry.allowedMeasurement`, off by default) is
therefore a claim about the VM image rather than an exact container. The
report_data binding and freshness window — the two things that are never
dropped — are fully intact regardless; `auditHash` plus the boot-time
self-check still carry code identity.

`requestAttestation()` in `attest.ts` builds the 64-byte, zero-padded
report_data payload and hands it to the provider — the provider itself
stays a thin wrapper around the kernel interface, no encoding logic of its
own.

Needs root (or `CAP_SYS_ADMIN`-equivalent) to write under
`/sys/kernel/config/tsm/report` — the production systemd unit runs as
root for exactly this reason (see "Live agent" below).

## Validated facts (empirically confirmed on real hardware, not assumed)

These were the two biggest open risks in the original plan. Both are
settled, confirmed against a real, hardware-signed quote — not assumed
from documentation:

- **`report_data` mode is `raw`**, not sha256'd. `AgentRegistry`'s
  `reportDataIsHashed` is `false`.
- **`TDXQuote.sol`'s `REPORT_DATA_OFFSET` (568) is correct** — confirmed by
  cross-checking our own byte-offset extraction against what a real quote
  actually contains.

### The gate: passed, on real hardware

**`verifyAndAttestOnChain` accepts a real quote.** Pulled from a real GCP
TDX Confidential VM (`c3-standard-4`, `us-central1-a`, via
`configfs-tsm`). That quote is committed at `fixtures/real-quote.hex`.

```bash
cast call 0x95175096a9B74165BE0ac84260cc14Fc1c0EF5FF \
  "verifyAndAttestOnChain(bytes)(bool,bytes)" \
  "0x$(cat fixtures/real-quote.hex)" \
  --rpc-url https://base-sepolia-rpc.publicnode.com
# → true, with our commitment echoed back in the returned bytes
```

This is the single fact the whole on-chain design hinged on, and it's now
verified end to end: real Intel TDX hardware → commitment embedded raw in
report_data at the expected offset → Automata's real deployed verifier on
Base Sepolia accepts it.

`c3-standard-*`, Ubuntu 22.04, `us-central1-{a,b,c}` — this is Automata's
own documented configuration for their `tdx-attestation-sdk`, the same
verifier this project calls; getting a quote this way isn't a workaround,
it's the vendor's documented path. See
`~/.claude/plans/okay-so-what-could-sleepy-donut.md` for the full trail of
how this was arrived at.

## Chain

**Base Sepolia** (chain id 84532), not Automata's own testnet — that one's
retired (confirmed directly: its RPC returns "Automata Attestation L2 is
retired"). Automata's DCAP verifier is deployed at
`0x95175096a9B74165BE0ac84260cc14Fc1c0EF5FF` across several standard
testnets (verified by pulling bytecode from independent public RPCs and
confirming the `verifyAndAttestOnChain(bytes)` selector is in the dispatch
table — not just trusting a docs page, and now further confirmed by
actually calling it with a real quote — see above). Full detail and
re-verification steps in `contracts/README.md`.

**Deployed** to Base Sepolia:
`AgentRegistry` at `0xdA507A1C65E070Bb40F75e23a7eCd65B6B7189A4`,
`GatedVault` at `0x32382F3F0Ec4BC6E98d3d17B8BBDa2D33d31d336`. Constructor
state verified by reading it back on-chain (`dcap`, `owner`,
`freshnessWindow`, `reportDataIsHashed` all match what `Deploy.s.sol` was
given). A live agent (see "Live agent" below) called `certify()` against
this deployment for real — confirmed via transaction receipt
(`status: 1`, `Certified` event fired) and an on-chain `isCertified()`
read, both `true`.

All three demo acts have since been verified for real, on-chain, no mocks:
clean (the live `certify()` above), tampered (a real quote's report_data
checked against a deliberately wrong `auditHash` — reverted with a fully
decoded `CommitmentMismatch(expected, got)`), and stale (a throwaway
registry with a 15-second freshness window — `isCertified()` `true`
immediately, `false` 20 seconds later). See `README.md`'s "Status" section
for transaction/detail links.

### A bug only a real deploy could catch

The **first** deployment (a different address, since replaced) had
`IDcapAttestation.sol` declaring `verifyAndAttestOnChain` as `view`.
Automata's real function is `external payable` — it writes attestation
state, it's not a pure read. Declaring it `view` made Solidity compile the
call as a `STATICCALL`, which the EVM silently reverts with **zero return
data** the instant the callee touches storage. Every layer — viem,
`cast call`, three different RPC providers — reported "execution reverted
for an unknown reason" with no decodable cause, because there genuinely
was no revert data to decode.

Why 20 passing unit tests never caught this: `MockDcapAttestation` was
*also* declared `view`, so it never touched storage and could never trip
the STATICCALL restriction. A read-only mock conforms to a `view` interface
exactly as well as it conforms to a correct one — the bug was invisible to
every offline test and only surfaced against the real contract, on a real
chain, mid-deploy. Diagnosed by testing `verifyAndAttestOnChain` and
`certify()` as **separate** `cast call`s: the former (called from an EOA,
where Solidity's STATICCALL restriction doesn't apply) succeeded; the
latter (called from our contract, where it does) failed with the same
signature every time. The mock's fix — `callCount` that actually
increments — makes this class of bug fail a unit test again if it
regresses, rather than passing 20/20 while being wrong.

## Live agent

Ran the actual production runtime (`packages/agent/src/index.ts`) on a
real GCP TDX Confidential VM (`rime-agent-live`), as a systemd service
rather than a bare background process — needed to survive SSH disconnects
and auto-restart on failure:

```ini
[Unit]
Description=Rime agent — TDX attestation + on-chain certify heartbeat
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/<user>/rime
EnvironmentFile=/home/<user>/rime/.env
Environment=NODE_OPTIONS=--experimental-strip-types
ExecStart=/usr/bin/node packages/agent/src/index.ts
Restart=on-failure
RestartSec=10
User=root

[Install]
WantedBy=multi-user.target
```

`User=root` because `ConfigfsTsmQuoteProvider` needs root to write under
`/sys/kernel/config/tsm/report`. Confirmed `certify()` succeeded for real
(see "Chain" above), then the VM was stopped — see `README.md`'s "Live
agent" section for the exact recreate/teardown commands. One thing worth
knowing if this comes back: **the agent's own signing key needs its own
gas**, separate from whatever funded the contract deploy — that's a
distinct wallet the agent signs `certify()` transactions with, and it
starts at zero.

## Local dev tooling notes

- **Getting a real quote off a GCP TDX Confidential VM:**
  `--confidential-compute-type=TDX` on `c3-standard-*`, then on the VM:
  `sudo apt-get install linux-modules-extra-gcp && sudo modprobe tdx_guest`.
  Confirm `configfs-tsm` is live with
  `sudo mkdir /sys/kernel/config/tsm/report/t1` (an ENOENT/"No such device"
  error means TDX isn't really active). Write 64 bytes of report_data to
  `inblob`, read the quote from `outblob`. This is exactly what
  `ConfigfsTsmQuoteProvider` automates — see `scripts/generate-fixture.ts`.
  Cost: a `c3-standard-4` is ~$0.20–0.25/hr — **delete the VM the moment
  you're done with it**, that's the only way this gets expensive.

## What's deliberately not here

- No real treasury logic in `GatedVault` — it's a demo payload proving the
  gate works, not a production vault design.
- No attempt to reimplement DCAP quote verification — that's Automata's
  well-audited job, we only call it.
- No dynamic manifest regeneration inside the enclave — the manifest is a
  build artifact precisely so the agent can't produce a more favorable one
  against itself at runtime.
- No container layer for the agent runtime — it runs as a plain process
  under systemd on the TDX guest, talking to `configfs-tsm` directly.
