/**
 * The Nimbus installer's own output directories, vendored as literals.
 *
 * The source of truth is `scripts/install/lib/paths.ts` (`resolveInstallDir`) in the
 * nimbus-agent/Nimbus monorepo. This package is MIT and that file is AGPL-3.0, so the
 * values are copied with attribution rather than imported — copying two path literals
 * creates neither a package dependency nor a licence problem.
 *
 * These directories are tried FIRST when resolving the `nimbus` binary, and they matter
 * precisely when an MCP client spawns this launcher WITHOUT the user's shell PATH (the
 * normal case for a GUI-launched editor on macOS). A stale value here reports
 * "Could not find the Nimbus CLI" against a perfectly good install.
 *
 * DRIFT GUARD: this file cannot detect a change on the installer side by itself — a
 * vendored copy is a change-detector, not a two-sided contract. The real guard lives in
 * the monorepo: `scripts/structure-audit/check-launcher-installer-contract.ts`, run by
 * two jobs there — `install-smoke.yml` at PR time (it already triggers on
 * `scripts/install/**`) and `org-drift-sweep.yml` on a schedule, which is the only one
 * that can see a change made HERE. It clones this repo and fails if these two literals
 * stop matching `resolveInstallDir`. If you rename either constant, update that script's
 * parser in the same change.
 */

/** Appended to `%LOCALAPPDATA%` on Windows. */
export const INSTALLER_WIN32_SUFFIX = String.raw`\Programs\Nimbus\bin`;

/** Appended to `$HOME` on macOS and Linux. */
export const INSTALLER_POSIX_SUFFIX = "/.local/bin";
