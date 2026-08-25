## Summary

<!-- What does this change and why? -->

## Checklist

- [ ] `bun run build` succeeds — **first**, matching `ci.yml`: the CI smoke steps run the built `dist/index.js`, and `dist/` is gitignored
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run test` passes (tests added/updated for behavior changes)
- [ ] No new runtime dependency — this package has **zero** by design (`package.json` declares `devDependencies` only); that is the MIT-vs-AGPL licence and supply-chain boundary, not a preference
- [ ] No `any` (used `unknown` + a type guard for external/cross-boundary data)
- [ ] No invented `CANDIDATE_DIRS` entry — every one is either the Nimbus installer's own output directory or a real distribution channel's, appended at the END of its platform's list
- [ ] Behaviour changes are reflected in the Conventional Commit type. The public surface here is the **bin's** behaviour — resolution order, `CANDIDATE_DIRS`, exit status, the messages `explain()` prints — not an exported type: `package.json` declares only `bin`, with no `main`/`exports`/`types`, so nothing in `src/` is importable by a consumer
