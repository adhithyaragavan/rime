#!/usr/bin/env bash
# Runs a command inside a container that shares the simulator's socket
# volume — the workaround for Docker Desktop on Mac not passing bind-mounted
# Unix sockets through to the host. See run-simulator.sh's header comment.
#
# Usage:
#   ./scripts/dstack-exec.sh node --experimental-strip-types scripts/generate-fixture.ts --out fixtures/simulator-quote.hex
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

docker run --rm \
  -v "$(pwd)/scripts/simulator-run:/assets" \
  -v "$(pwd):/rime" \
  -w /rime \
  -e DSTACK_SIMULATOR_ENDPOINT=/assets/dstack.sock \
  node:22-slim \
  "$@"
