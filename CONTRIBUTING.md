# Contributing

Thanks for helping improve the Nimbus MCP launcher!

## Prerequisites

- [Bun](https://bun.sh), at the release pinned in [`.bun-version`](./.bun-version) — CI
  installs the same one

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
- **Append to `CANDIDATE_DIRS`; never insert.** A new channel goes at the END of its
  platform's list, so adding one can only turn a not-found into a found — never redirect
  an install that already resolves.

## Relationship to other repos

- [`Nimbus`](https://github.com/nimbus-agent/Nimbus) — the gateway/CLI monorepo. It owns
  the MCP server this launcher starts and the installer whose directories
  `src/installer-contract.ts` vendors. This package was extracted from it
  (`packages/mcp-launcher`) on 2026-08-20.

## Questions

Most questions about this package turn out to be boundary questions: the behaviour you
want to change is probably in the monorepo, not here. Tool definitions, agent briefs,
index queries, credentials and the HITL gate are all gateway-side. What lives here is
binary resolution, argument passing, and exit-status translation — four source files,
under 250 lines including comments.

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

## Updating dependencies

There is no update bot — Dependabot was retired in October 2026. A maintainer updates
dependencies in periodic bulk PRs: `bun outdated`, edit the ranges in `package.json`,
`bun install`, then run the full check list under *Pull requests*. Dependabot *alerts*
stay on, so a vulnerable dependency still surfaces in the Security tab, but nothing opens
a fix PR for it: answer an alert with an out-of-cycle update PR.

That procedure only reaches direct dependencies. `bun outdated` lists nothing else, and
`bun install` and `bun install --force` keep every transitive dependency at its locked
version — the October 2026 update found `@types/node` and `undici-types` behind that way.
To move them, run a bare `bun update` on the pinned Bun. Measured on Bun 1.4.2, it
re-resolves the whole tree within the ranges in `package.json`, raises those ranges to the
versions it installs, and keeps `bun.lock` in its current format; Bun 1.3.14's `bun update`
left transitive dependencies where they were. Do not delete `bun.lock` to force the
re-resolve instead: Bun 1.4.2 writes a lockfile created from scratch as
`"lockfileVersion": 2`, which Bun 1.3.14 refuses to read. Review the lockfile diff before
committing it.

These have to move together:

- **`bun.lock` with `package.json` — and only through Bun.** npm neither reads nor writes
  `bun.lock`, so a change made with npm leaves the lockfile stale and CI's
  `bun install --frozen-lockfile` fails with "lockfile had changes, but lockfile is
  frozen". Commit both files in the same PR.
- **`@biomejs/biome` with `biome.json`'s `$schema`.** The schema URL names a Biome
  version. A mismatch is reported as *info*, not an error, so `bun run lint` stays green
  while it drifts; set the URL to the installed version (`bunx biome --version`).
- **`github/codeql-action/init` with `github/codeql-action/analyze`.** Both must carry the
  same commit SHA, or CodeQL fails with "Loaded a configuration file for version X, but
  running version Y". Actions are pinned to full commit SHAs, most with the version in a
  trailing comment: bump the comment together with the SHA, in every workflow that uses
  the action.
- **The Bun version.** `.bun-version` and the `bun-version:` input in `ci.yml`,
  `release.yml` and `sonar.yml` name the same release, and nothing checks that they
  agree; change all four together.
- **`mcp-publisher` in `release.yml`.** It is a release asset fetched by a `run:` step and
  pinned to a literal SHA-256, not a `uses:` reference, so updating the action pins never
  reaches it. Bumping `MCP_PUBLISHER_VERSION` means re-deriving `MCP_PUBLISHER_SHA256` the
  way the comment above that step describes.

A bulk update touches `devDependencies` only — it is never the place to add a runtime
dependency (see *Architecture notes*). If Dependabot is ever reinstated, read
[#11](https://github.com/nimbus-agent/nimbus-mcp/pull/11) first: its ecosystem must be
`bun`, not `npm`, for the lockfile reason above, and the `cla` job needs its
`dependabot[bot]` skip back — Dependabot-triggered runs get no Actions secrets, even on
`pull_request_target`, so the CLA token mint fails and the required `cla` check stays red
unless someone re-runs it by hand.

## Releases

Releases are automated by [release-please](https://github.com/googleapis/release-please):
merged Conventional Commits open a release PR; merging it tags the release
(`mcp-vX.Y.Z`) and publishes `@nimbus-dev/mcp` to npm with provenance via GitHub OIDC
(no long-lived npm token).

A third job then publishes the MCP Registry entry from `server.json`. It is a separate job
with its own `id-token: write`, authenticating via `mcp-publisher login github-oidc` — the
registry derives the `io.github.nimbus-agent/*` namespace from this repository's owner, so
no credential is stored. `server.json`'s two version fields are kept in step by
release-please's `extra-files` config, and that job *asserts* they match the version npm
just published rather than rewriting them — an assertion failure there means the
`extra-files` config needs fixing, not the file.

That assertion runs after `npm publish`, which cannot be undone after 72 hours, so
`src/release-metadata.test.ts` makes the same claims earlier: `server.json`'s two versions,
`.release-please-manifest.json`'s base version, and the `mcpName` ↔ registry-entry identity
pair. Being an ordinary `bun test` file, it runs on every PR — which is where a release PR
is reviewed — and again in the publish job *before* the publish step. Both copies are
deliberate; do not remove one as duplication.
