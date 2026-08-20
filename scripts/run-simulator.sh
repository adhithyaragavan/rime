#!/usr/bin/env bash
# Runs the dstack simulator in Docker.
#
# Two things that aren't obvious and cost real time to work out:
#   1. Native macOS build fails: the `sev` crate's CertTableEntry::
#      cert_table_to_vec_bytes is #[cfg(target_os = "linux")] only. Built in
#      vendor/simulator-build/Dockerfile instead (build + runtime stages MUST
#      use the same Debian release — trixie/trixie — or you get a GLIBC
#      version mismatch at runtime).
#   2. The simulator listens on Unix sockets (dstack.sock etc.), not a TCP
#      port — despite older docs implying an http://localhost:8090 endpoint.
#      Docker Desktop for Mac does not reliably pass bind-mounted Unix
#      sockets through the VM boundary to the host, so connecting FROM THE
#      HOST (e.g. plain `node ...` in your terminal) will hang/refuse. Run
#      whatever needs to reach it (Node, generate-fixture.ts) inside a
#      container attached to the same volume instead — see
#      scripts/dstack-exec.sh, which does exactly that.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

RUN_DIR="vendor/simulator-build/run"
if [ ! -S "$RUN_DIR/dstack.sock" ]; then
  mkdir -p "$RUN_DIR"
  cp vendor/simulator-build/sdk-simulator-assets/* "$RUN_DIR/" 2>/dev/null || true
fi

docker rm -f rime-dstack-sim >/dev/null 2>&1 || true
docker run --rm -d \
  -v "$(pwd)/$RUN_DIR:/assets" \
  --name rime-dstack-sim \
  rime/dstack-simulator:local

echo "simulator running as 'rime-dstack-sim', socket at $RUN_DIR/dstack.sock"
echo "reach it via: ./scripts/dstack-exec.sh <command...>"
