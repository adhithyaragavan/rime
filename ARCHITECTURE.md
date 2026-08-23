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
┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│   BUILD      │     │   DEPLOY     │     │   RUNTIME      │     │   CHAIN      │
│ (your laptop)│     │ (Phala Cloud)│     │ (inside CVM)   │     │ (Base Sepolia)│
└─────────────┘     └──────────────┘     └───────────────┘     └──────────────┘
       │                     │                     │                     │
  scan deps            phala deploy         self-check tree      AgentRegistry
  → AuditManifest      -c docker-           against baked-in     .certify(
  → auditHash =        compose.yml          manifest, refuse            quote,
    keccak256(          │                    boot on mismatch          auditHash,
    canonical(m))       dstack measures      │                          epoch)
       │                compose+image        commitment =                │
  docker build          into RTMR3           keccak256(abi.encode(  ┌─────┴─────┐
  image, pin            │                    auditHash, agent,      │  verify   │
  digest into            │                    epoch))                │  quote is │
  compose.yml            │                    │                      │  genuine  │
       │                 │                    quote =                │  TDX (via │
       └─────────────────┴───────────►        client.getQuote(       │  Automata │
                                               commitment)             │  DCAP)    │
                                               │                      └─────┬─────┘
                                               heartbeat: re-certify        │
                                               every ~25 min (< 30 min      check
                                               freshness window)            report_data
                                                                            == commitment
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

This shows the dstack/Phala Cloud path specifically (`RIME_QUOTE_PROVIDER=
dstack`, the default). The RUNTIME box's last two steps look different
under the `configfs-tsm` provider — see "Quote providers" below — but
everything else in this diagram, especially the CHAIN column, is identical
either way.

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
  **and** empirically confirmed (see "Validated facts" below) by
  cross-checking against dstack-sdk's own reported `report_data` value via
  the local simulator.
- **`src/interfaces/IDcapAttestation.sol`** — Automata's deployed verifier.
  We call it (`verifyAndAttestOnChain`), we don't reimplement DCAP
  verification. Its `bytes output` on success is deliberately unused —
  `AgentRegistry` parses `report_data`/measurement straight from the raw
  quote via `TDXQuote.sol` instead, so it stays correct even if `output`'s
  encoding differs from what we'd guess.
- **`src/AgentRegistry.sol`** — `certify(quote, auditHash, epoch)`:
  1. `dcap.verifyAndAttestOnChain(quote)` — is this really TDX hardware?
  2. Optional measurement allowlist check (`allowedMeasurement[mr]`, gated
     by `measurementAllowlistEnabled` — off by default so early iteration
     isn't blocked by needing to pre-register an image hash).
  3. `report_data == keccak256(abi.encode(auditHash, msg.sender, epoch))`
     — the actual claim. `reportDataIsHashed` (immutable, set at deploy) picks
     between comparing against the commitment raw or `sha256(commitment)`,
     because dstack's exact behavior here was the single biggest open
     question — see below.
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
1. Load `agentcert.manifest.json` — **baked into the image at build time**,
   never regenerated at runtime. An agent auditing its own tree at boot
   could be fooled the same way the tree itself could be tampered with.
2. `selfcheck.ts`: recompute the installed dependency set's hash, compare
   against the manifest's `lockfileHash`. Refuse to start (`process.exit(1)`)
   on mismatch. This is what makes "matches what was audited" true *right
   now*, not just "was true when scanned" — the report_data binding proves
   the manifest existed, this proves it still applies.
3. `attest.ts`: build the commitment, `client.getQuote()`, submit
   `certify()` on-chain via viem. Repeats on a heartbeat
   (`AGENTCERT_HEARTBEAT_MS`, default 25 min — under the 30 min freshness
   window so a healthy process never lets its certificate lapse).

`Dockerfile` / `docker-compose.yml`: single-stage Node image, manifest
copied in as a build artifact (not generated inside the container), deployed
via `phala deploy -c packages/agent/docker-compose.yml`. dstack measures the
compose file + image digest into RTMR3.

### `web` — the status page

React + Vite, no heavy UI framework. Two live panels:
- **On-chain certificate** (`useCertificate.ts`, polls `certs(agent)` every
  5s) — a countdown that visibly turns red and pulses once the
  certificate's freshness window elapses. This is the demo's third act made
  visible; the point only lands if the number actually counts down on
  screen.
- **Audit manifest** (`useManifest.ts`, fetches a static
  `agentcert.manifest.json`) — findings table, and a client-side
  recomputation of `auditHash()` compared against what's actually on-chain,
  so the page proves the readable manifest and the on-chain commitment are
  the same document rather than just asserting it.

Theme-aware CSS (light/dark via `prefers-color-scheme`), no external fonts
or CDN dependencies — works fully offline at judging.

## Quote providers: dstack vs. raw TDX

`packages/agent/src/quote-provider.ts` defines a `QuoteProvider` interface
with two implementations, selected via `RIME_QUOTE_PROVIDER=dstack|
configfs-tsm` (default `dstack`):

- **`DstackQuoteProvider`** — the production path, wraps `@phala/dstack-sdk`.
  Used on Phala Cloud or any dstack-managed CVM. RTMR3 measures the compose
  file + image digest, so hardware identity covers the actual container.
- **`ConfigfsTsmQuoteProvider`** — any raw TDX Confidential VM, no dstack
  layer at all. Talks directly to the standard Linux `configfs-tsm`
  interface (`/sys/kernel/config/tsm/report/*/{inblob,outblob}`, kernel
  ≥6.7). This exists because Phala Cloud turned out to be blocked (see
  below) — validated against a real GCP `c3-standard-4` TDX Confidential VM.

**The tradeoff, stated plainly:** under dstack, hardware measurement covers
*our container*. Under raw configfs-tsm, MRTD/RTMRs measure the *VM's boot
chain*, not the workload running inside it. The optional measurement
allowlist (`AgentRegistry.allowedMeasurement`, off by default) becomes a
claim about the VM image rather than the exact container. The report_data
binding and freshness window — the two things that are never dropped — are
fully intact either way; `auditHash` plus the boot-time self-check still
carry code identity.

`requestAttestation()` in `attest.ts` builds the 64-byte, zero-padded
report_data payload once and hands it to whichever provider is active, so
both providers are guaranteed to embed the commitment identically.

## Validated facts (empirically confirmed on real hardware, not assumed)

These were the two biggest open risks in the original plan. Both are
settled, and — this is the important upgrade — **confirmed against a real,
hardware-signed quote, not just the simulator**:

- **`report_data` mode is `raw`**, not sha256'd. Confirmed twice: first via
  the local dstack simulator (`DstackQuoteProvider`), then again via
  `configfs-tsm` on real GCP TDX hardware — same result both times.
  `AgentRegistry`'s `reportDataIsHashed` is `false`.
- **`TDXQuote.sol`'s `REPORT_DATA_OFFSET` (568) is correct** — confirmed by
  cross-checking our own byte-offset extraction against the SDK's/kernel's
  own account of what was embedded, on both the simulator and real
  hardware.

Two real SDK bugs were caught along the way, both fixed in
`packages/agent/src/attest.ts` / `quote-provider.ts`:
- `getQuote()` treats a JS `string` as raw UTF-8 text
  (`Buffer.from(data).toString("hex")`), not as an already-hex value —
  passing a `"0x...."` string directly embeds its 66 ASCII characters, not
  the 32 bytes it represents. Must decode to raw bytes first
  (`hexToBytes()`).
- The SDK returns `quote`/`report_data` **without** a `0x` prefix, despite
  being typed `Hex`. Normalized once, centrally.

### The gate: passed, on real hardware

**`verifyAndAttestOnChain` accepts a real quote.** Phala Cloud's
provisioning was blocked (account balance $0, card declined at top-up — see
below), so a real quote came from a raw GCP TDX Confidential VM instead
(`c3-standard-4`, `us-central1-a`, via `configfs-tsm` — no dstack, no
Phala). That quote is committed at `fixtures/real-quote.hex`.

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

**Why Phala Cloud, specifically, is blocked:** account top-up failed
(`Current balance: $0.00`, card declined). `dstack-cloud` — the
documented way to run dstack itself on GCP instead of Phala — turned out to
be **archived** on GitHub (unmaintained, inconsistent docs), so raw TDX via
configfs-tsm was the more reliable pivot: it's the vendor's own documented
path (Automata's `tdx-attestation-sdk` README specifies exactly this GCP
configuration), not a workaround. See
`~/.claude/plans/okay-so-what-could-sleepy-donut.md` for the full trail.

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
`AgentRegistry` at `0x7e1cd19060a1179efaCC0c40d649131337129a43`,
`GatedVault` at `0x02C036CfC7647a4eaE02444549B1d87A3Bd18ef4`. Constructor
state verified by reading it back on-chain (`dcap`, `owner`,
`freshnessWindow`, `reportDataIsHashed` all match what `Deploy.s.sol` was
given). No agent has called `certify()` against this deployment yet —
`isCertified()` correctly returns `false`.

## Local dev tooling notes

- **dstack simulator doesn't build natively on macOS** — `sev` crate's
  `CertTableEntry::cert_table_to_vec_bytes` is `#[cfg(target_os = "linux")]`
  only. Built inside a container instead (`vendor/simulator-build/`); build
  and runtime stages must use the **same** Debian release or you get a
  GLIBC mismatch at startup.
- **The simulator listens on Unix sockets, not a TCP port.** Docker Desktop
  for Mac doesn't reliably pass bind-mounted Unix sockets through to the
  host, so anything that talks to it has to run inside a container on the
  same volume (`scripts/dstack-exec.sh`), not directly in a host terminal.
- `vendor/` is gitignored — it's a cloned copy of the dstack repo used only
  to build the simulator image, not something to commit or ship.
- **Getting a real quote off a GCP TDX Confidential VM:**
  `--confidential-compute-type=TDX` on `c3-standard-*`, then on the VM:
  `sudo apt-get install linux-modules-extra-gcp && sudo modprobe tdx_guest`.
  Confirm `configfs-tsm` is live with
  `sudo mkdir /sys/kernel/config/tsm/report/t1` (an ENOENT/"No such device"
  error means TDX isn't really active). Write 64 bytes of report_data to
  `inblob`, read the quote from `outblob`. This is exactly what
  `ConfigfsTsmQuoteProvider` automates — the manual version was run once by
  hand to produce `fixtures/real-quote.hex` before the provider existed.
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
