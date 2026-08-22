# Contributing

Thanks for helping improve the Nimbus MCP launcher!

## Prerequisites

- [Bun](https://bun.sh) v1.2+

## Setup

```bash
bun install
```

## Develop

```bash
bun run typecheck      # tsc --noEmit over tsconfig.json (src, tests included)
bun run lint           # biome check .  (whole tree)
bun run test           # bun test
bun run test:coverage  # lcov → coverage/lcov.info; what the SonarCloud gate consumes
bun run build          # bun build → dist/index.js (ESM, node target)
```

## Architecture notes

- **Zero runtime dependencies.** `package.json` declares `devDependencies` only, and
  that is a licence and supply-chain boundary rather than a preference: this package is
  MIT and deliberately does not depend on the AGPL-3.0
  [Nimbus](https://github.com/nimbus-agent/Nimbus) monorepo. If you need a helper,
  inline it.
- **This package launches; it does not implement.** The MCP server itself lives in the
  monorepo (`packages/cli/src/commands/mcp-server.ts` + `packages/cli/src/mcp/`). Work
  that changes what tools an MCP client sees belongs there, not here.
- **No `any`; TypeScript strict.** Use `unknown` for data crossing a boundary and narrow
  with a type guard. Biome enforces the rules in `biome.json`.
- **`src/installer-contract.ts` is half of a cross-repo contract.** It vendors two path
  literals from the monorepo's `scripts/install/lib/paths.ts` (`resolveInstallDir`). The
  other half is `scripts/structure-audit/check-launcher-installer-contract.ts` over
  there, which parses these exact constant *names*. Renaming or reshaping either constant
  breaks that parser; changing a value without a matching monorepo change strands every
  PATH-less MCP client on a wrong directory.
- **A green test run here does not prove the install paths are correct.** It proves this
  repo agrees with its own vendored copy. Only the monorepo-side audit compares against
  `resolveInstallDir` itself, and it runs there — on `scripts/install/**` PRs and on the
  scheduled org drift sweep.
- **Never invent a candidate directory.** Every entry in `CANDIDATE_DIRS` is either the
  installer's own output or a real distribution channel's. `~/.nimbus/bin` was invented
  once and is now named in a test to keep it from drifting back in.

## Relationship to other repos

- [`Nimbus`](https://github.com/nimbus-agent/Nimbus) — the gateway/CLI monorepo. It owns
  the MCP server this launcher starts and the installer whose directories
  `src/installer-contract.ts` vendors. This package was extracted from it
  (`packages/mcp-launcher`) on 2026-08-20.

## Questions

Most questions about this package turn out to be boundary questions: the behaviour you
want to change is probably in the monorepo, not here. Tool definitions, agent briefs,
index queries, credentials and the HITL gate are all gateway-side. What lives here is
binary resolution, argument passing, and exit-status translation — roughly two hundred
lines.

Ask on [Nimbus Discussions](https://github.com/nimbus-agent/Nimbus/discussions); the
gateway repo keeps that board on behalf of every repo in the family, so a question
spanning two of them has somewhere to go. "Would you accept a PR that does X?" belongs
there too, before you write it.

When the answer is clearly *here* — the launcher cannot find an installed Nimbus, an
exit code or signal is translated wrongly, a candidate directory is missing for a real
distribution channel — open an issue in this repo instead. Vulnerabilities go through
[`SECURITY.md`](./SECURITY.md), never a public thread on either.

## Pull requests

- Keep PRs focused; include tests for behavior changes.
- Use [Conventional Commits](https://www.conventionalcommits.org/) — release-please
  derives the version bump and changelog from them.
- `bun run build && bun run typecheck && bun run lint && bun test` must pass. **Build
  first**, matching the order CI uses (`ci.yml`): the CI smoke steps run the built
  `dist/index.js`, and `dist/` is gitignored, so on a fresh clone they have nothing to
  run until a build has happened.
- CI additionally smoke-tests the built bin under Node — asserting it exits 1 with the
  "Could not find the Nimbus CLI" message when no binary is resolvable — and asserts no
  build-machine path is baked into `dist/index.js`. SonarCloud runs
  `bun run test:coverage` as a blocking gate.

## Releases

Releases are automated by [release-please](https://github.com/googleapis/release-please):
merged Conventional Commits open a release PR; merging it tags the release
(`mcp-vX.Y.Z`) and publishes `@nimbus-dev/mcp` to npm with provenance via GitHub OIDC
(no long-lived npm token).

A third job then publishes the MCP Registry entry from `server.json`, authenticating with
the same GitHub OIDC token (the registry derives the `io.github.nimbus-agent/*` namespace
from this repository's owner, so no credential is stored). `server.json`'s two version
fields are kept in step by release-please's `extra-files` config, and that job *asserts*
they match the version npm just published rather than rewriting them — an assertion
failure there means the `extra-files` config needs fixing, not the file.
