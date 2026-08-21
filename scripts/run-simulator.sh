#!/usr/bin/env bash
# Runs the dstack simulator in Docker. Works from a fresh clone — pulls the
# prebuilt image, no Rust toolchain or dstack source needed.
#
# Three things that aren't obvious and cost real time to work out:
#   1. Native macOS build fails: the `sev` crate's CertTableEntry::
#      cert_table_to_vec_bytes is #[cfg(target_os = "linux")] only. Built in
#      a container instead — see vendor/simulator-build/Dockerfile if you
#      want to rebuild from source (only needed to pick up a newer dstack
#      version; not needed for normal dev, hence not required here). Build
#      and runtime stages there must use the same Debian release
#      (trixie/trixie) or you get a GLIBC mismatch at runtime.
#   2. The simulator listens on Unix sockets (dstack.sock etc.), not a TCP
#      port — despite older docs implying an http://localhost:8090 endpoint.
#      Docker Desktop for Mac does not reliably pass bind-mounted Unix
#      sockets through the VM boundary to the host, so connecting FROM THE
#      HOST (e.g. plain `node ...` in your terminal) will hang/refuse. Run
#      whatever needs to reach it (Node, generate-fixture.ts) inside a
#      container attached to the same volume instead — see
#      scripts/dstack-exec.sh, which does exactly that.
#   3. The simulator needs its own small config assets (app-compose.json,
#      appkeys.json, attestation.bin, dstack.toml, sys-config.json) present
#      wherever it's run, or it crashes on startup. Committed at
#      scripts/simulator-assets/ (28KB total, not worth gitignoring) rather
#      than only existing inside vendor/, which is gitignored.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

IMAGE="ghcr.io/adhithyaragavan/rime-dstack-simulator:latest"
RUN_DIR="scripts/simulator-run"

mkdir -p "$RUN_DIR"
if [ ! -f "$RUN_DIR/dstack.toml" ]; then
  cp scripts/simulator-assets/* "$RUN_DIR/"
fi

docker rm -f rime-dstack-sim >/dev/null 2>&1 || true
docker pull "$IMAGE"
docker run --rm -d \
  -v "$(pwd)/$RUN_DIR:/assets" \
  --name rime-dstack-sim \
  "$IMAGE"

echo "simulator running as 'rime-dstack-sim', socket at $RUN_DIR/dstack.sock"
echo "reach it via: ./scripts/dstack-exec.sh <command...>"
