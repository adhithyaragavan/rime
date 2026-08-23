# Rime

Verifiable supply-chain integrity for AI agents. Full context:
`~/.claude/plans/5-verifiable-supply-chain-integrity-misty-sonnet.md`
(original plan) and `~/.claude/plans/okay-so-what-could-sleepy-donut.md`
(the Phala Cloud → GCP TDX pivot).

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
- [x] `packages/agent` — attest.ts, selfcheck.ts, index.ts, quote-provider.ts, Dockerfile, compose. Proven working end-to-end against both the local dstack simulator **and real GCP TDX hardware**.
- [x] `web` — React status page: on-chain certificate panel with live freshness countdown, manifest panel with findings table and client-side hash re-verification against the chain. Typechecks and builds clean; not yet wired to a real deployment.
- [x] **Real quote fixture (`fixtures/real-quote.hex`)** — from a real GCP TDX Confidential VM (Phala Cloud's account top-up failed, so this went a different route — see below).
- [x] **The gate: a real quote verifies against Automata's actual on-chain verifier on Base Sepolia.** `cast call ... verifyAndAttestOnChain(...)` → `true`, with our commitment echoed back in the return data. This was the single biggest open risk in the whole design, and it's now settled on real hardware, not just the simulator.
- [x] **`AgentRegistry`/`GatedVault` deployed to Base Sepolia.**
  Registry: [`0xdA507A1C65E070Bb40F75e23a7eCd65B6B7189A4`](https://sepolia.basescan.org/address/0xdA507A1C65E070Bb40F75e23a7eCd65B6B7189A4),
  Vault: [`0x32382F3F0Ec4BC6E98d3d17B8BBDa2D33d31d336`](https://sepolia.basescan.org/address/0x32382F3F0Ec4BC6E98d3d17B8BBDa2D33d31d336).
  Constructor state verified on-chain: `dcap` matches the real Automata verifier, `freshnessWindow=1800`, `reportDataIsHashed=false`.
- [x] **The agent is running live**, on a real GCP TDX Confidential VM (`rime-agent-live`, systemd-managed), calling `certify()` for real. `isCertified()` for the agent address returns `true` on-chain right now. **This VM runs continuously and costs money the whole time** — see "Live agent" below for how to check on it and how to stop it.
- [ ] Rehearse the tampered/stale acts against the live deployment and record the demo video.

## Phala Cloud is blocked — read this before trying to deploy the agent there

Account top-up failed (`Current balance: $0.00`, card declined). The
fallback that actually worked: a **raw GCP TDX Confidential VM, no dstack**,
using the standard Linux `configfs-tsm` interface directly. This isn't a
lesser workaround — it's Automata's own documented path (their
`tdx-attestation-sdk` README specifies exactly this GCP configuration:
`c3-standard-*`, Ubuntu 22.04, `us-central1-{a,b,c}`) to the exact verifier
this project calls.

`packages/agent/src/quote-provider.ts` now has both paths behind one
interface (`RIME_QUOTE_PROVIDER=dstack|configfs-tsm`, default `dstack`) —
Phala Cloud still works the moment billing is fixed, nothing about that
path was removed, it's just not what produced the current real-quote fixture.

Getting another real quote (or a fresh one, e.g. with real deployment
addresses baked into the commitment):

```bash
gcloud compute instances create rime-tdx-probe --zone=us-central1-a \
  --machine-type=c3-standard-4 --confidential-compute-type=TDX \
  --maintenance-policy=TERMINATE \
  --image-family=ubuntu-2204-lts --image-project=ubuntu-os-cloud

# on the VM:
sudo apt-get install -y linux-modules-extra-gcp && sudo modprobe tdx_guest

# from your machine, once RIME_QUOTE_PROVIDER=configfs-tsm code runs on the VM:
RIME_QUOTE_PROVIDER=configfs-tsm node --experimental-strip-types \
  scripts/generate-fixture.ts --out fixtures/real-quote.hex \
  --audit-hash 0x<32 bytes> --agent 0x<20 bytes> --epoch 1

gcloud compute instances delete rime-tdx-probe --zone=us-central1-a  # don't forget this — ~$0.20-0.25/hr while running
```

## Chain: Base Sepolia — see `contracts/README.md`

Correction from the original plan: Automata's own testnet is retired.
`contracts/README.md` has the verified working chain/address and how to
re-verify it yourself.

## Local dev

```bash
npm install
node --test packages/shared/test/*.test.ts packages/scanner/test/*.test.ts

cd contracts && forge test -vv && cd ..

cd web && npm run build && cd ..   # typecheck + production build

# Scanner, standalone:
node --experimental-strip-types packages/scanner/src/cli.ts <project-dir> [--offline] [--fast]
```

### dstack simulator (local TEE dev, no Phala account needed)

Two non-obvious things cost real time to work out here, both documented in
`scripts/run-simulator.sh`'s header comment:

1. The simulator doesn't build natively on macOS — the `sev` crate's
   `CertTableEntry::cert_table_to_vec_bytes` is Linux-only. It's built inside
   a container instead (`vendor/simulator-build/Dockerfile`).
2. It listens on **Unix sockets**, not a TCP port, and Docker Desktop for Mac
   doesn't reliably pass bind-mounted Unix sockets through to the host — so
   anything that talks to it (Node, `generate-fixture.ts`) has to run inside
   a container on the same volume, not directly in your terminal.

```bash
./scripts/run-simulator.sh     # builds run/ dir with the socket, starts the container

./scripts/dstack-exec.sh node --experimental-strip-types scripts/generate-fixture.ts \
  --out fixtures/simulator-quote.hex \
  --audit-hash 0x<32 bytes> --agent 0x<20 bytes> --epoch 1

docker stop rime-dstack-sim
```

Simulator quotes are NOT hardware-signed and will always be rejected by the
real on-chain verifier — useful for exercising the code path, not a
substitute for the real thing.

## Live agent

`rime-agent-live` (GCP, `us-central1-a`, `c3-standard-4`) runs the actual
agent as a systemd service (`rime-agent.service`), re-certifying every 25
minutes. **This costs ~$0.20–0.25/hr the entire time it's running** — it is
not a one-shot probe like the other VMs referenced elsewhere in this repo.

```bash
# check on it
gcloud compute ssh rime-agent-live --zone=us-central1-a --command="sudo systemctl status rime-agent.service --no-pager"
gcloud compute ssh rime-agent-live --zone=us-central1-a --command="sudo journalctl -u rime-agent.service -f"   # tail logs

# STOP IT WHEN DONE — this is the only way to stop paying for it
gcloud compute instances delete rime-agent-live --zone=us-central1-a
```

Agent identity: `0x5ac20A5A6bf88338aF2651a4263023D2A68636bC` — funded
directly from the deploy wallet (an agent's signing key needs its own gas
to submit `certify()`, separate from whatever funded the deploy). Both
wallets are running on faucet-scale balances (fractions of a cent); if the
heartbeat needs to keep running for a long demo window, top up via a
faucet or another small transfer from the deploy wallet.

## Remaining action item

1. Rehearse the tampered/stale acts against this live deployment (tamper a
   dependency, rescan, watch `certify()` revert; let the freshness window
   lapse, watch `withdraw()` revert) and record the video.
2. Stop `rime-agent-live` when done — see above.

If time is short, `fixtures/real-quote.hex` plus a `cast call` to
`verifyAndAttestOnChain` is a legitimate, honest fallback for demonstrating
the core claim without a live agent running — see `contracts/README.md`.
