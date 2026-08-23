# Rime

Verifiable supply-chain integrity for AI agents. Full context:
`~/.claude/plans/5-verifiable-supply-chain-integrity-misty-sonnet.md`
(original plan) and `~/.claude/plans/okay-so-what-could-sleepy-donut.md`
(getting a real quote and the deploy-time debugging trail).

**The claim this project makes, in one sentence:** an `AgentRegistry` certificate
means "this agent's audited dependency tree ran, unmodified, inside a genuine
TDX enclave, as of `issuedAt`" — not merely "an enclave ran something once."
That distinction is entirely the `report_data` binding in
`packages/shared/src/reportdata.ts` / `contracts/src/AgentRegistry.sol`. If
you're short on time, everything else in this repo is scaffolding for that
one check — see "Never drop" in the plan.

## Status

- [x] `packages/shared` — manifest schema, canonical hashing, commitment encoding. 10/10 tests.
- [x] `packages/scanner` — dep-tree walk, 6 heuristics, osv-scanner + npm-audit-signatures wraps. 25/25 tests (shared+scanner combined).
- [x] `contracts` — TDXQuote parsing, AgentRegistry, GatedVault, Deploy script. 20/20 tests, all against a mock verifier.
- [x] `packages/agent` — attest.ts, selfcheck.ts, index.ts, quote-provider.ts. Proven working end-to-end on real GCP TDX hardware.
- [x] `web` — React status page: on-chain certificate panel with live freshness countdown, manifest panel with findings table and client-side hash re-verification against the chain. Typechecks and builds clean.
- [x] **Real quote fixture (`fixtures/real-quote.hex`)** — from a real GCP TDX Confidential VM, via `configfs-tsm`.
- [x] **The gate: a real quote verifies against Automata's actual on-chain verifier on Base Sepolia.** `cast call ... verifyAndAttestOnChain(...)` → `true`, with our commitment echoed back in the return data. This was the single biggest open risk in the whole design, and it's now settled on real hardware.
- [x] **`AgentRegistry`/`GatedVault` deployed to Base Sepolia.**
  Registry: [`0xdA507A1C65E070Bb40F75e23a7eCd65B6B7189A4`](https://sepolia.basescan.org/address/0xdA507A1C65E070Bb40F75e23a7eCd65B6B7189A4),
  Vault: [`0x32382F3F0Ec4BC6E98d3d17B8BBDa2D33d31d336`](https://sepolia.basescan.org/address/0x32382F3F0Ec4BC6E98d3d17B8BBDa2D33d31d336).
  Constructor state verified on-chain: `dcap` matches the real Automata verifier, `freshnessWindow=1800`, `reportDataIsHashed=false`.
- [x] **All three demo acts verified for real, on-chain, with real hardware-signed quotes.**
  - *Clean*: the live agent's `certify()` succeeded on the production registry — [`0xc10a35fc...`](https://sepolia.basescan.org/tx/0xc10a35fc4e1848ad6269338ef682c75c136102d0d689a09c2574b6b88c8bb3fc), `isCertified()` returned `true`.
  - *Tampered*: a real quote's report_data cross-checked against a deliberately wrong `auditHash` — `certify()` reverted with `CommitmentMismatch(expected, got)`, both values fully decoded.
  - *Stale*: a throwaway registry with a 15-second freshness window — `isCertified()` was `true` immediately after certifying, `false` 20 seconds later.
  No demo video — this project isn't doing one. The live agent VM (`rime-agent-live`) has been **stopped and deleted**; see "Live agent" below to bring it back if needed.

## Chain: Base Sepolia — see `contracts/README.md`

Correction from the original plan: Automata's own testnet is retired.
`contracts/README.md` has the verified working chain/address and how to
re-verify it yourself.

## Local dev

```bash
npm install
node --test packages/shared/test/*.test.ts packages/scanner/test/*.test.ts packages/agent/test/*.test.ts

cd contracts && forge test -vv && cd ..

cd web && npm run build && cd ..   # typecheck + production build

# Scanner, standalone:
node --experimental-strip-types packages/scanner/src/cli.ts <project-dir> [--offline] [--fast]
```

## Getting a real TDX quote

Quotes come from `configfs-tsm` — the standard Linux TEE attestation
interface (kernel ≥6.7) — via `packages/agent/src/quote-provider.ts`. This
only works on a real TDX guest; there's no local simulator.

```bash
gcloud compute instances create rime-tdx-probe --zone=us-central1-a \
  --machine-type=c3-standard-4 --confidential-compute-type=TDX \
  --maintenance-policy=TERMINATE \
  --image-family=ubuntu-2204-lts --image-project=ubuntu-os-cloud

# on the VM:
sudo apt-get install -y linux-modules-extra-gcp && sudo modprobe tdx_guest

# from the VM (needs root — see ARCHITECTURE.md):
sudo node --experimental-strip-types scripts/generate-fixture.ts \
  --out fixtures/real-quote.hex \
  --audit-hash 0x<32 bytes> --agent 0x<20 bytes> --epoch 1

gcloud compute instances delete rime-tdx-probe --zone=us-central1-a  # don't forget this — ~$0.20-0.25/hr while running
```

`c3-standard-*`, Ubuntu 22.04, `us-central1-{a,b,c}` — this is Automata's
own documented configuration for their `tdx-attestation-sdk`, the same
verifier this project calls.

## Live agent

Ran as `rime-agent-live` (GCP, `us-central1-a`, `c3-standard-4`) — a
systemd service (`rime-agent.service`) re-certifying every 25 minutes.
**It's been stopped and deleted** (a running TDX VM costs ~$0.20–0.25/hr
the entire time it's up, and there's no ongoing need for it with no demo
to run). To bring it back:

```bash
gcloud compute instances create rime-agent-live --zone=us-central1-a \
  --machine-type=c3-standard-4 --confidential-compute-type=TDX \
  --maintenance-policy=TERMINATE \
  --image-family=ubuntu-2204-lts --image-project=ubuntu-os-cloud
# then: install linux-modules-extra-gcp + modprobe tdx_guest + Node 22,
# copy the repo + .env over, npm install, and the systemd unit described
# in ARCHITECTURE.md's "Live agent" section.

# check on it / stop it again
gcloud compute ssh rime-agent-live --zone=us-central1-a --command="sudo systemctl status rime-agent.service --no-pager"
gcloud compute instances delete rime-agent-live --zone=us-central1-a
```

Agent identity: `0x5ac20A5A6bf88338aF2651a4263023D2A68636bC` — funded
directly from the deploy wallet (an agent's signing key needs its own gas
to submit `certify()`, separate from whatever funded the deploy). Both
wallets are on faucet-scale balances (fractions of a cent) — top up via a
faucet or a small transfer from the deploy wallet before reactivating.

## State

Everything the core claim depends on has been proven for real, on-chain:
the report_data binding, the freshness window, and the DCAP hardware
check — see "Status" above for the three verified acts, and
`contracts/README.md` / `ARCHITECTURE.md` for the full trail including the
`view`/`STATICCALL` bug that blocked the first deploy attempt.

`fixtures/real-quote.hex` plus a `cast call` to `verifyAndAttestOnChain`
remains the fastest way to re-demonstrate the core claim without spinning
up hardware — see `contracts/README.md`.
