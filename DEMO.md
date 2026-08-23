# Rime demo script — 5:00 hard cap

Audience: hackathon/grant judges seeing this cold. Structure: the gap TDX
leaves open, how Rime closes it, then live proof — problem before proof,
proof before the kill shot. Everything below is real: real on-chain reads,
real hashing, real hardware attestation. Nothing is staged data.

Frontend: `cd web && npm run dev` → http://localhost:5173/

---

## Recording-day pre-flight (do this before hitting record)

1. Create the VM (README.md "Running the live agent"):
   ```bash
   gcloud compute instances create rime-agent-live --zone=us-central1-a \
     --machine-type=c3-standard-4 --confidential-compute-type=TDX \
     --maintenance-policy=TERMINATE \
     --image-family=ubuntu-2204-lts --image-project=ubuntu-os-cloud
   ```
   On the VM: `sudo apt-get install -y linux-modules-extra-gcp && sudo modprobe tdx_guest`,
   install Node 22, copy the repo + `.env`, `npm install`.
2. **Top up the agent wallet** (`0x5ac20A5A6bf88338aF2651a4263023D2A68636bC`)
   — it was at 0.000071 ETH last checked; certify() on two registries needs
   more than that.
3. On the VM, certify **production** first (`AGENT_REGISTRY_ADDRESS` =
   `0xdA507A1C65E070Bb40F75e23a7eCd65B6B7189A4`, the default in `.env`) —
   run `packages/agent/src/index.ts` once, confirm the log shows a
   successful `certify()`, then stop it.
4. Right before recording the stale beat (act 3), re-run the agent with
   `AGENT_REGISTRY_ADDRESS=0xed77437a8040d7B68b927C16909D82010f1DaC4f`
   (the 15-second registry) so the countdown is fresh when you hit record
   on that segment.
5. Confirm `cd web && npm run dev` is warm at http://localhost:5173/,
   browser zoomed to a legible size, demo panel visible without scrolling.
6. **The instant recording wraps:**
   `gcloud compute instances delete rime-agent-live --zone=us-central1-a`
   — ~$0.20–0.25/hr otherwise.

---

## Script

### 0:00–0:35 — The gap

> "TDX hardware can prove an enclave is genuine — memory encrypted by the
> chip, sealed from the host. What it *can't* prove is what's running
> inside it. A hijacked npm postinstall script runs just as happily inside
> a perfectly real, perfectly sealed enclave as clean code would. Hardware
> attestation without knowing *what* it's attesting to is trust theater."

**On screen:** Hero + claim strip (top of the page, act 1 "Clean" selected).
Point at the three chips: genuine hardware · this exact dependency tree ·
as of minutes ago.

### 0:35–1:10 — What Rime binds

> "Rime closes that gap. Before the agent boots, a scanner audits its
> dependency tree and hashes the result. That hash gets sealed into the
> hardware quote's report_data field — the same request that produces the
> attestation. A smart contract checks all of it: real hardware, this
> exact hash, and enforces a freshness window."

**On screen:** scroll to "How it works" diagram, trace the six-step flow.

### 1:10–2:00 — Act 1: Clean

> "Here's the certificate for the live agent, right now. This page isn't
> displaying a hash someone told it — it fetched the same manifest anyone
> can read, recomputed the hash in the browser, and is comparing it
> byte-for-byte against what the chain actually certified."

**On screen:** certificate panel (countdown ticking, live), then "The
binding" panel — 32/32 bytes matching, green checkmark.

**Action:** none needed — this is the default state.

### 2:00–2:50 — Act 2: Tampered

> "Now watch what happens if the dependency tree isn't what it claims to
> be." [click "2 — Tampered"] "This swaps in a real fixture with a
> malicious package — `evil-pkg`, with a postinstall script that phones
> home during install. One package changed, and because this is a
> cryptographic hash, that's not a one-byte difference — 31 of the 32
> bytes flip. The certificate doesn't just look different, it's
> unmistakably a different document."

**On screen:** click "2 — Tampered" in the demo panel. Byte grid turns
mostly red/diverging, DIRTY badge, critical finding (`egress-in-install`)
visible in the findings table.

### 2:50–3:30 — The hardware is real

> "And this isn't simulated hardware. This exact quote came off a real
> Intel TDX confidential VM on GCP. Here it is, right now, verified
> against Automata's actual deployed on-chain verifier — no mock, no
> local simulator."

**On screen:** terminal, run live:
```bash
cast call 0x95175096a9B74165BE0ac84260cc14Fc1c0EF5FF \
  "verifyAndAttestOnChain(bytes)(bool,bytes)" \
  "0x$(cat fixtures/real-quote.hex)" \
  --rpc-url https://base-sepolia-rpc.publicnode.com
```
Point at the `true` result and the echoed commitment bytes.

### 3:30–4:25 — Act 3: Stale

> "Last piece: freshness. A certificate from six months ago tells you
> nothing about what's running right now — code could've been swapped out
> since. So certificates expire, and the agent has to keep re-attesting."
> [click "3 — Stale"] "This is the same certificate, just read from a
> registry deployed with a 15-second window instead of 30 minutes — watch
> it actually run out." [let it hit EXPIRED] "And it's not just a badge
> flipping — the vault that pays this agent is gated on the exact same
> check. The moment the certificate goes stale, withdraw() itself starts
> reverting."

**On screen:** click "3 — Stale", let the countdown visibly run to
`EXPIRED`, then scroll to the vault panel showing `BLOCKED` /
`NotCertified(agent)`.

### 4:25–5:00 — Close

> "Everything here is real and on-chain: `AgentRegistry` and `GatedVault`
> deployed on Base Sepolia, a real certify() transaction, a real hardware
> quote independently verified. What's explicitly out of scope: the
> hardware measurement covers the VM's boot chain, not a line-by-line
> audit of the running process, and the scanner's heuristics catch known
> supply-chain patterns — it's not an infallible guarantee. That's Rime:
> hardware proves a sealed box ran something recently; this makes it prove
> *what*, and lets anyone check that claim themselves."

**On screen:** `AgentRegistry` address with explorer link, real certify()
tx (`0xc10a35fc4e1848ad6269338ef682c75c136102d0d689a09c2574b6b88c8bb3fc`).

---

## If something goes wrong mid-recording

- **Countdown already expired before you clicked record on act 3:**
  re-run the agent against the 15s registry, wait for a fresh `Certified`
  event, retry.
- **`cast call` hangs:** the public RPC occasionally rate-limits; have a
  second RPC URL ready (`https://sepolia.base.org` as a fallback).
- **Agent wallet out of gas mid-recording:** send more Base Sepolia ETH
  from the deploy wallet — check balance first with
  `cast balance 0x5ac20A5A6bf88338aF2651a4263023D2A68636bC --rpc-url https://base-sepolia-rpc.publicnode.com`.
