# nimbus-mcp — Claude Code Context

## What this is

`@nimbus-dev/mcp` — the **MIT-licensed launcher** that exposes a locally-installed
Nimbus index and its agents to any MCP client. It does no work itself: it locates the
`nimbus` binary already on the machine and execs it as `nimbus mcp-server --stdio`,
then passes stdio straight through.

**The MCP server is not in this repo.** It lives in the AGPL monorepo at
`packages/cli/src/commands/mcp-server.ts` + `packages/cli/src/mcp/`, and serves six
read-only index tools plus eleven agent tools. This package only knows how to *find*
the binary — never how to run the gateway.

## Stack

- **Runtime:** Bun v1.2+ · **Language:** TypeScript 7.x strict · **Linter:** Biome
- **Zero runtime dependencies.** Not "few" — zero. `package.json` has `devDependencies`
  only. Adding a runtime dep is a licence and supply-chain decision, not a convenience call.
- **No `any`** — use `unknown` for external data; strict mode is non-negotiable.

## Commands

```bash
bun run typecheck      # tsc --noEmit
bun run lint           # biome check .
bun run test           # bun test
bun run test:coverage  # lcov -> coverage/lcov.info; what the SonarCloud gate consumes
bun run build          # dist/index.js (ESM, node target)
```

## Cross-repo relationships

- [`Nimbus`](https://github.com/nimbus-agent/Nimbus) — the gateway/CLI monorepo. Owns the
  MCP server this launcher starts, and owns the installer whose output directories
  `src/installer-contract.ts` vendors. This package was extracted from it
  (`packages/mcp-launcher`) on 2026-08-20.

## Design invariants

- **MIT, and it must stay importable-from-nothing.** This package must never import from
  the AGPL monorepo. `src/installer-contract.ts` vendors two path literals with
  attribution — copying values is fine, importing code is not.
- **`src/installer-contract.ts` is half of a cross-repo contract.** The other half is
  `scripts/structure-audit/check-launcher-installer-contract.ts` in the monorepo, run by
  two jobs there: `install-smoke.yml` at PR time (it already triggers on
  `scripts/install/**`) and `org-drift-sweep.yml` on a schedule — the latter being the
  only one that can see a change made *here*. That script parses the exported constant
  **names**, so renaming either one breaks it. Change both sides in the same sitting.
- **A green `bun test` here does not prove the install paths are right.** It proves this
  repo is self-consistent with its own vendored copy. Only the monorepo-side audit
  compares against `resolveInstallDir` itself.
- **Resolution order is `NIMBUS_BIN` → `PATH` → known install dirs, installer dir first.**
  The fallback exists because a GUI-launched editor on macOS spawns this process without
  the user's shell `PATH`. A wrong first candidate reports "Could not find the Nimbus CLI"
  against a perfectly good install — the worst first-run failure this package has.
- **Never invent a candidate directory.** Every entry in `CANDIDATE_DIRS` is either the
  installer's own output or a real distribution channel's. `~/.nimbus/bin` was invented
  once by a plan and is now named in a test specifically to keep it from drifting back in.

## Notes

- Releases: Conventional Commits → release-please → `npm publish --provenance --access public`
  via OIDC trusted publishing. **No npm token** — publishing is OIDC-only across this org,
  and `publishConfig.access` is `public` because the package is scoped.
- Release tags are `mcp-vX.Y.Z`, not `vX.Y.Z` — release-please's manifest strategy includes
  the component, derived from the last segment of the package name.
- `mcpName` in `package.json` (`io.github.nimbus-agent/nimbus`) is the MCP Registry's npm
  ownership check. It is verified against the *published tarball*, so it must ship in the
  package — changing it means cutting a new npm version.
