# Runs inside the dstack CVM. Kept intentionally simple (single stage, no
# native deps) so the image digest that gets measured into RTMR3 is a
# straightforward function of this file + package-lock.json + source —
# nothing environment-dependent for dstack's measurement to be "surprised" by.
FROM node:22-slim

WORKDIR /app

# Workspace layout: copy manifests first for layer caching, then source.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/scanner/package.json packages/scanner/package.json
COPY packages/agent/package.json packages/agent/package.json

RUN npm install --omit=dev

COPY packages/shared packages/shared
COPY packages/scanner packages/scanner
COPY packages/agent packages/agent
COPY scripts scripts

# The manifest is a build artifact, not source — baked in at image build time
# so the agent can never regenerate a more favorable one against itself at
# runtime. Produced by `npm run scan` against this same tree before `docker build`.
COPY rime.manifest.json ./rime.manifest.json

ENV RIME_PROJECT_DIR=/app
ENV RIME_MANIFEST_PATH=/app/rime.manifest.json
ENV NODE_OPTIONS="--experimental-strip-types"

CMD ["node", "packages/agent/src/index.ts"]
