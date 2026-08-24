---
name: nimbus-mcp-boundaries
description: >
  Where this launcher ends and the Nimbus monorepo begins, and which of its guards
  prove less than they look. Use when changing binary resolution, touching
  `src/installer-contract.ts`, adding a dependency, wondering why a test cannot
  cover `src/index.ts`, or debugging a release/publish.
---

# nimbus-mcp — boundaries, guards, and what the gates miss

`CLAUDE.md` and `CONTRIBUTING.md` already carry the rules: zero runtime dependencies,
MIT and never importing from the AGPL monorepo, resolution order `NIMBUS_BIN` → `PATH`
→ known install dirs. **Those two files win on doctrine.** This one is the part that is
expensive to rediscover: which guard is load-bearing, which is theatre, and what a
change here has to touch in the other repo.

## 1. The installer contract is two-sided, and this side is the weak half

`src/installer-contract.ts` exports two literals vendored from the monorepo's
`scripts/install/lib/paths.ts` (`resolveInstallDir`). `installer-contract.test.ts`
asserts `CANDIDATE_DIRS`' first entry per platform is built from them.

**That test cannot fail when the installer changes.** It compares this repo against its
own copy. If someone changes `resolveInstallDir` in the monorepo tomorrow, everything
here stays green and every PATH-less MCP client starts reporting "Could not find the
Nimbus CLI" against a working install.

The half that actually catches it is
`scripts/structure-audit/check-launcher-installer-contract.ts` in the monorepo, run by:

- `install-smoke.yml` — PR-time, triggered on `scripts/install/**`. Catches *their*
  change.
- `org-drift-sweep.yml` — scheduled, clones this repo. The **only** thing that catches
  a change made *here*.

Practical consequences:

- That script parses the constant **names** with a regex, and the literal **forms**
  (`String.raw` backtick for win32, double-quoted for posix). Renaming a constant or
  switching quote style breaks the parser — and a broken parser reports a *mismatch*,
  which reads like real drift. Change both sides in one sitting.
- Editing a value here without a matching monorepo change will not fail this repo's CI.
  It fails the sweep, later, in another repository.

## 2. `src/index.ts` cannot be unit-tested, and that is deliberate

It is a shebang bin entry with top-level side effects: it resolves, spawns a child, and
wires `exit`. Importing it from a test **executes it** — spawning a process and
potentially calling `process.exit`. That is why it carries `sonar.coverage.exclusions`
and why the monorepo exempted the same file while it lived there.

Do not "improve coverage" by importing it. It is covered two ways that do not import it,
and **neither moves a coverage number** — the Sonar exclusion still stands, so a flat
coverage figure is not evidence that `index.ts` is untested:

- `src/launcher-e2e.test.ts` runs it as a real child process (`bun src/index.ts`) against
  a fake `nimbus` binary. This is where the spawn argv (`mcp-server --stdio`),
  `stdio: "inherit"`, the exit-status wiring, and *which stream a diagnostic goes to* are
  pinned. It runs on every PR, on all three OSes.
- The CI bin smoke in `ci.yml` runs the **built** `dist/index.js` under **Node**, with
  `NIMBUS_BIN` unset and `PATH`, `HOME`/`USERPROFILE` and `LOCALAPPDATA` all pointed at
  empty temp dirs, asserting exit 1 plus the not-found message. It greps for the literal
  `Could not find the Nimbus CLI`, so rewording that sentence in `explain()` reds CI in a
  workflow file, not in a test — by design, but only obvious once you know.

They look redundant and are not: different artifact, different runtime, and only the smoke
covers the not-found branch. Deleting either loses real coverage. The not-found branch is
deliberately absent from the e2e file — making it hermetic means neutralising every
candidate directory, and the POSIX ones (`/usr/local/bin`, `/usr/bin`, both linuxbrew
prefixes) are absolute and cannot be redirected by env.

**Why the smoke's isolation matters:** without it the smoke silently depends on the runner
having no Nimbus installed. The day anything installs the CLI, resolution succeeds, the
launcher spawns an MCP server that waits on stdio, and the step fails as a *timeout*
rather than a message mismatch. The empty-dir setup is what keeps that from being a
latent trap.

**All three inputs have to be neutralised, and `PATH` was the one that was missed.**
Until 2026-08-24 the step scrubbed only `NIMBUS_BIN` and the directory roots — but `PATH`
is searched *before* `CANDIDATE_DIRS`, so the "clean runner" assumption survived in the
branch that runs first. Reproduce it on any machine that has Nimbus installed: extract
that step's `run:` block and execute it. The pre-fix version prints `exit=0` and an empty
message and stops exercising the not-found branch entirely; the current one prints
`exit=1` and the explanation. Because `PATH` is now empty for the child, `node` is invoked
by absolute path (`command -v node`) — do not "simplify" that back to a bare `node`.

## 3. Zero dependencies is a licence boundary, not a style rule

The package is MIT; the monorepo is AGPL-3.0. Vendoring two path *literals* with
attribution is fine — copying values creates neither a package dependency nor a licence
problem. Importing code would create both.

This is also why `tsconfig.json` inlines its compiler options instead of extending a
shared base: the original extended `../../tsconfig.base.json`, which does not exist
outside the monorepo. If you find yourself wanting to share config with Nimbus, that is
the boundary reasserting itself.

## 4. Release mechanics that surprise people

- **Tags are `mcp-vX.Y.Z`, not `vX.Y.Z`.** release-please's manifest strategy includes
  the component by default and derives it from the last segment of the package name.
  The `Protected release tags` ruleset is pinned to `refs/tags/mcp-v*` accordingly — and
  a ruleset whose pattern matches nothing fails **silently**, so if you ever change the
  package name, check the ruleset in the same change.
- **`mcpName` in `package.json` ships in the tarball.** It is how the MCP Registry
  verifies npm ownership, and it is checked against the *published* package. Changing it
  means cutting a new npm version — it is not a metadata edit.
- **`server.json`'s two version fields are bumped by release-please, not by the workflow.**
  They are `extra-files` entries in `release-please-config.json`. The `publish-registry`
  job *asserts* they match what npm published rather than rewriting them, because a
  rewrite would mask a broken `extra-files` config and ship a registry entry pointing at
  a version nobody can install. If that assert fails, fix the config — do not patch the
  file in CI.
- **That assertion runs twice, on purpose, and the earlier copy is the useful one.**
  `publish-registry`'s check happens AFTER `npm publish`, which cannot be undone after 72
  hours — it reports damage rather than preventing it. `src/release-metadata.test.ts`
  makes the same claims (plus the `.release-please-manifest.json` base version and the
  `mcpName` ↔ `server.json` identity pair) inside `bun test`, so they run on every PR and
  again in the publish job *before* the publish step. Do not delete one as duplication:
  the late one is the last line of defence if someone bypasses CI, the early one is the
  only one that can still change the outcome.
- **Publishing to the MCP Registry from CI is credential-free; doing it by hand is not.**
  `login github-oidc` works because the OIDC subject is this repo, so the org namespace
  follows from the repo's owner. Interactively, it cannot: the registry's login app
  ("MCP Registry Login (Prod)", client `Iv23liUydBbI7Z2Q9bOZ`) is a **private GitHub App**,
  so it cannot be installed on `nimbus-agent`, so a device-flow token can never read the
  org role — and org publishing then requires a `read:org` PAT. The CLI's error text
  ("make your organization membership public") points at the wrong thing; public
  membership is not the requirement. Prefer letting CI do it.
- **`SONAR_TOKEN` absence makes the Sonar check pass, not fail.** `sonar.yml` guards the
  analysis *step* with `if: env.SONAR_TOKEN != ''`, while the *job* always reports. A
  green "SonarQube Cloud analysis" is therefore not evidence anything was analysed.
- **No npm token exists anywhere.** Publishing is OIDC trusted-publishing only, org-wide.
  If you find yourself wanting `NODE_AUTH_TOKEN`, something else is wrong.
