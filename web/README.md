# Rime — web

Status page for the `AgentRegistry` certificate: polls the chain directly
via viem, recomputes `auditHash()` client-side from the audit manifest to
verify against what's actually certified on-chain, and previews a
`GatedVault.withdraw()` call so "the certificate is stale" has a visible
money consequence.

A pinned demo panel switches between the three verified acts (clean /
tampered / stale — see the repo root `README.md`'s "Status" section and
`DEMO.md`) by pointing the same hooks at different (real, already-deployed)
manifests and registries. Nothing in the acts is fabricated — the mismatch
and expiry are genuine recomputations against real on-chain state.

## Run it

```bash
npm install     # from the repo root, installs all workspaces
cd web && npm run dev
```

Reads config from `web/.env` (`VITE_REGISTRY_ADDRESS`, `VITE_AGENT_ADDRESS`,
`VITE_RPC_URL`, `VITE_STALE_REGISTRY_ADDRESS`, `VITE_VAULT_ADDRESS`) — see
`src/lib/config.ts` for defaults.

## Build

```bash
npm run build   # tsc -b && vite build
npm run lint    # oxlint
```

## Constraints worth knowing before touching this

- **No external fonts or CDN dependencies** — the page must work fully
  offline (judging may have no network beyond the RPC). System font stack
  only; see `src/styles/tokens.css`.
- No UI framework, no Tailwind, no icon library — hand-written CSS, kept
  intentionally small.
- `@rime/shared` resolves through the npm-workspace symlink to raw
  TypeScript source; Vite transpiles it directly. Don't add a build step
  in `packages/shared` that would break that resolution.
- All local imports use explicit `.ts`/`.tsx` extensions
  (`verbatimModuleSyntax` + `allowImportingTsExtensions` in
  `tsconfig.app.json`).
- Linter is **oxlint**, not ESLint.
