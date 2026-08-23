# Rime

Verifiable supply-chain integrity for AI agents.

## The problem

Intel TDX can prove an enclave is genuine — memory encrypted by the chip,
sealed from the host operator. What it *can't* prove is **what's running
inside it**.

A hijacked npm `postinstall` script runs just as happily inside a perfectly
real, perfectly sealed enclave as clean code would. The hardware will attest
to it without complaint, because the hardware was never asked that question.
Attestation that can't tell you what it's attesting to is trust theater.

That's the gap Rime closes.

## What a certificate means

An `AgentRegistry` certificate for agent address `A` means:

> The dependency tree audited as `auditHash` was scanned clean (or its
> findings are known), and a genuine TDX enclave holding `A`'s key attested
> to running exactly that tree, no more than `freshnessWindow` seconds ago.

Not "an enclave ran something once" — off-the-shelf TEE hosting already gives
you that. The narrow thing this repo adds is binding an **audit verdict** into
the **hardware attestation**, and enforcing a **freshness window** on-chain.

Everything else here is scaffolding for that one check.

## How it works

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

Two ideas make this work.

**One value crosses every boundary unchanged: `auditHash`.** It's computed
once, by the scanner, at build time. It is never recomputed by anything that
could be compromised — the agent's boot-time self-check *compares against*
the manifest baked into its image, it doesn't generate a fresh one. And it's
the value that gets hardware-signed into the quote. Break any link in that
chain and the final on-chain check fails.

**`certify()` checks three things**, in `contracts/src/AgentRegistry.sol`:

1. `dcap.verifyAndAttestOnChain(quote)` — is this really TDX hardware? (We
   call Automata's deployed verifier; we don't reimplement DCAP.)
2. An optional measurement allowlist — is this a VM image we recognize? (Off
   by default.)
3. `report_data == keccak256(abi.encode(auditHash, agent, epoch))` — **this
   is the entire point of the project.** The audit verdict is inside the
   hardware-signed payload, so it can't be swapped after the scan without the
   enclave re-attesting to a different value.

A certificate then expires. A cert from six months ago says nothing about
what's running now, so agents re-attest on a heartbeat and consumers check
`isCertified()`, which is false the moment the window lapses.

## The pieces

| Package | What it contributes |
|---|---|
| `packages/shared` | The frozen interfaces. `auditHash()` and `buildCommitment()` — each mirrored by a Solidity equivalent that **must** encode identically, or `certify()` reverts on-chain. |
| `packages/scanner` | Produces the `AuditManifest`. Walks the dependency tree from `package-lock.json`, runs six heuristics, wraps osv-scanner and `npm audit signatures`. External tools fail open — a missing binary never crashes a scan. |
| `contracts` | Where the claim is enforced rather than asserted. `AgentRegistry.certify()` does the three checks above; `GatedVault` gates withdrawals on `isCertified()`. |
| `packages/agent` | The enclave runtime. Loads its baked-in manifest → self-checks the installed tree against it and refuses to boot on mismatch → requests a quote via `configfs-tsm` → calls `certify()`, then re-certifies on a heartbeat. |
| `web` | Status page. Polls the registry directly and **recomputes `auditHash()` client-side** to check against what's on-chain, rather than trusting a displayed value. |

## Verify it yourself

Deployed on Base Sepolia (chain id 84532):

| | |
|---|---|
| `AgentRegistry` | [`0xdA507A1C65E070Bb40F75e23a7eCd65B6B7189A4`](https://sepolia.basescan.org/address/0xdA507A1C65E070Bb40F75e23a7eCd65B6B7189A4) |
| `GatedVault` | [`0x32382F3F0Ec4BC6E98d3d17B8BBDa2D33d31d336`](https://sepolia.basescan.org/address/0x32382F3F0Ec4BC6E98d3d17B8BBDa2D33d31d336) |
| Automata DCAP verifier | [`0x95175096a9B74165BE0ac84260cc14Fc1c0EF5FF`](https://sepolia.basescan.org/address/0x95175096a9B74165BE0ac84260cc14Fc1c0EF5FF) |

Constructor state was verified by reading it back on-chain: `dcap` matches
the real Automata verifier, `freshnessWindow=1800`, `reportDataIsHashed=false`.

**The load-bearing fact — a real hardware quote is accepted by the real
verifier.** `fixtures/real-quote.hex` came off a genuine GCP TDX Confidential
VM via `configfs-tsm`. Run this yourself, no hardware needed:

```bash
cast call 0x95175096a9B74165BE0ac84260cc14Fc1c0EF5FF \
  "verifyAndAttestOnChain(bytes)(bool,bytes)" \
  "0x$(cat fixtures/real-quote.hex)" \
  --rpc-url https://base-sepolia-rpc.publicnode.com
# → true, with the commitment echoed back in the returned bytes
```

**A real agent certified for real.** A live agent running on TDX hardware
submitted [`0xc10a35fc…`](https://sepolia.basescan.org/tx/0xc10a35fc4e1848ad6269338ef682c75c136102d0d689a09c2574b6b88c8bb3fc)
against the production registry; `isCertified()` returned `true`. Two
companion behaviours were confirmed the same way: a deliberately wrong
`auditHash` reverts with a fully decoded `CommitmentMismatch(expected, got)`,
and against a throwaway registry built with a 15-second window,
`isCertified()` flipped to `false` once it lapsed.

Certificates expire by design, so any given cert will read as stale later —
that's the freshness window working, not a failure. Re-run the agent to mint
a fresh one.

**Tests:** 37 TypeScript (`shared` 16, `scanner` 17, `agent` 4) and 21
Solidity. The Solidity tests run against `MockDcapAttestation` — hardware
signature verification is Automata's job, not something re-tested here.

```bash
node --test packages/shared/test/*.test.ts packages/scanner/test/*.test.ts packages/agent/test/*.test.ts
cd contracts && forge test -vv
```

## Run it locally

```bash
npm install

# Scan a project — writes rime.manifest.json, prints the auditHash
node --experimental-strip-types packages/scanner/src/cli.ts <project-dir> [--offline] [--fast]

# Status page against the live deployment
cd web && npm run dev        # http://localhost:5173/
```

Try the scanner against the two fixtures to see both verdicts:
`fixtures/demo-project-clean` (clean) and `fixtures/demo-project` (a planted
`evil-pkg` whose `postinstall` phones home — flagged `critical`).

`DEMO.md` walks the three behaviours end to end.

## Limits

Stated plainly, because they're real:

- **MRTD/RTMR measure the VM's boot chain, not a specific containerized
  workload.** There's no container-measurement layer here, so the optional
  measurement allowlist is a claim about the VM image rather than an exact
  process. The `report_data` binding and freshness window are unaffected, and
  `auditHash` plus the boot-time self-check still carry code identity.
- **The scanner's heuristics catch known supply-chain patterns** — install
  scripts, egress during install, obfuscation, typosquats, young versions,
  missing provenance. That's a meaningful filter, not an infallible guarantee.
- **`GatedVault` is a demo payload**, not a treasury design. It exists to
  prove the gate works.
- **DCAP verification is not reimplemented.** We call Automata's deployed,
  audited verifier by address.
- **The manifest is never regenerated inside the enclave** — deliberately. An
  agent that audits its own tree at boot could be fooled the same way the tree
  itself could be.

## Docs

| | |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | The full picture — why each piece exists, the validated byte offsets, and the `view`/`STATICCALL` bug that only a real deploy could catch. |
| [`contracts/README.md`](contracts/README.md) | Verified chain/address facts and how to re-verify them yourself. |
| [`web/README.md`](web/README.md) | Status page specifics and its hard constraints. |
| [`DEMO.md`](DEMO.md) | A walkthrough of the three behaviours, in order. |

## Running the live agent

The agent runs as a systemd service on a GCP TDX Confidential VM, re-certifying
every 25 minutes. The VM is **not currently running** — a TDX VM costs
~$0.20–0.25/hr, so it gets deleted when idle.

```bash
gcloud compute instances create rime-agent-live --zone=us-central1-a \
  --machine-type=c3-standard-4 --confidential-compute-type=TDX \
  --maintenance-policy=TERMINATE \
  --image-family=ubuntu-2204-lts --image-project=ubuntu-os-cloud

# on the VM: install linux-modules-extra-gcp + modprobe tdx_guest + Node 22,
# copy the repo + .env over, npm install, then the systemd unit in
# ARCHITECTURE.md's "Live agent" section.

gcloud compute instances delete rime-agent-live --zone=us-central1-a   # when done
```

Setup details, the systemd unit, and the wallet-funding note are in
[`ARCHITECTURE.md`](ARCHITECTURE.md)'s "Live agent" section. To capture a
fresh quote rather than run the full agent, `scripts/generate-fixture.ts`
does just that on the same VM — see "Local dev tooling notes" there.
