# Rime

Verifiable supply-chain integrity for AI agents. Full context: `~/.claude/plans/5-verifiable-supply-chain-integrity-misty-sonnet.md`.

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
- [x] `contracts` — TDXQuote parsing, AgentRegistry, GatedVault, Deploy script. 20/20 tests.
- [x] `packages/agent` — attest.ts, selfcheck.ts, index.ts, Dockerfile, compose. **Proven working end-to-end against the local dstack simulator** (see below) — the SDK's `getQuote()` hex-encoding quirk and the TDXQuote offset were both real bugs, both found and fixed this way.
- [x] `web` — React status page: on-chain certificate panel with live freshness countdown, manifest panel with findings table and client-side hash re-verification against the chain. Typechecks and builds clean; not yet wired to a real deployment.
- [ ] Real quote fixture (`fixtures/real-quote.hex`) — **blocked on your Phala Cloud signup**, see below. This is now the only remaining unknown in the on-chain path.
- [ ] End-to-end rehearsal of the three demo acts against a real deployment.

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

`generate-fixture.ts`'s output already answered the two biggest open
questions from Day 0, empirically, against the real SDK:
- **report_data mode is `raw`** (not sha256'd) — `REPORT_DATA_IS_HASHED=false` is correct.
- **`TDXQuote.sol`'s `REPORT_DATA_OFFSET` (568) is correct** — confirmed by cross-checking our own byte-offset parse against the SDK's own reported value.

Simulator quotes are still NOT hardware-signed and will be rejected by the
real on-chain verifier — the encoding/offset questions are settled, but
whether a *real* quote verifies at all is not, and remains gated on the next
step.

## Your action item (blocks the real on-chain path)

1. Sign up for Phala Cloud, claim free credits, `npm i -g phala && phala auth login`.
2. Deploy a hello-world container that calls `getQuote()` (packages/agent
   already has everything needed — point `docker-compose.yml` at a built
   image and `phala deploy -c packages/agent/docker-compose.yml`).
3. From inside that deployment, run `scripts/generate-fixture.ts` against the
   real dstack socket (no `DSTACK_SIMULATOR_ENDPOINT` — it defaults to
   `/var/run/dstack.sock`), save the output as `fixtures/real-quote.hex`.
4. Since the offset/mode questions are already settled, the OFFSET CHECK line
   should just say PASS again — if it doesn't, something differs on real
   hardware vs. the simulator and is worth a closer look before trusting
   certify().

Once you have that, the hard gate from the plan applies: if the real quote
doesn't verify against the deployed Automata verifier on Base Sepolia
(`forge test` against a fork, or a manual `cast call`), fall back to Plan B
in the plan file rather than debugging DCAP on Day 1.
