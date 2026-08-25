# nimbus-mcp — Claude Code Context

## What this is

`@nimbus-dev/mcp` — the **MIT-licensed launcher** that exposes a locally-installed
Nimbus index and its agents to any MCP client. It does no work itself: it locates the
`nimbus` binary already on the machine and execs it as `nimbus mcp-server --stdio`,
then passes stdio straight through.

**The MCP server is not in this repo.** It lives in the AGPL monorepo at
`packages/cli/src/commands/mcp-server.ts` + `packages/cli/src/mcp/`, and serves **21**
tools: nine read-only index tools (`INDEX_TOOL_SPECS`) plus twelve agent-classified ones
(`AGENT_CLASSIFIED_TOOL_SPECS` — the eleven `AGENT_TOOL_SPECS` entries plus `peekWhy`).
This package only knows how to *find* the binary — never how to run the gateway.
Re-derive that split from `packages/cli/src/mcp/adapter.ts` before restating it: only the
TOTAL is pinned over there (`adapter.test.ts`: `expect(TOOL_SPECS).toHaveLength(21)`), so
the split drifts silently — "six index tools" was stated here, and is still stated in
`adapter.ts`'s own `buildMcpServer` doc comment, long after the list grew to nine.

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
- **The `DOCS` URL in `src/resolve-binary.ts` is shipped user-facing text.** `explain()`
  prints it to every user whose install cannot be resolved — the one moment this package
  has their attention. It shipped as `https://nimbus-agent.dev/docs/install` in 0.2.0,
  0.3.0 and 0.4.0; that path is a **404** (the live page is `/user-guide/install/`, which
  is what the monorepo's own docs link to). **No workflow and no test in this repo checks
  that a documentation URL resolves** — there is no link checker here, and `src/` makes no
  network call at all — so probe one yourself before writing it down —
  `curl -s -o /dev/null -w '%{http_code}' -L <url>`; the site serves real 404s, so the
  check means something. The URL's two verbatim copies in `resolve-binary.test.ts` and
  `launcher-e2e.test.ts` are deliberate — a test that imports the constant it asserts is a
  tautology — so changing it means three edits in one commit.

## Notes

- Releases: Conventional Commits → release-please → `npm publish --provenance --access public`
  via OIDC trusted publishing. **No npm token** — publishing is OIDC-only across this org,
  and `publishConfig.access` is `public` because the package is scoped.
- Release tags are `mcp-vX.Y.Z`, not `vX.Y.Z` — release-please's manifest strategy includes
  the component, derived from the last segment of the package name.
- `mcpName` in `package.json` (`io.github.nimbus-agent/nimbus`) is the MCP Registry's npm
  ownership check. It is verified against the *published tarball*, so it must ship in the
  package — changing it means cutting a new npm version.
