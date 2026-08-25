import { posix, win32 } from "node:path";

export type Platform = "win32" | "darwin" | "linux";

/**
 * `node:path`'s `join` always follows the HOST OS's separator convention, not an arbitrary target
 * platform — on a Windows host it inserts backslashes even for a "linux" resolution input. This
 * package's tests deliberately exercise all three platforms from any host (platform equality), so
 * every join here is routed through the matching `path.posix`/`path.win32` implementation instead
 * of the host-dependent default export.
 */
function join(platform: Platform, ...segments: string[]): string {
  return platform === "win32" ? win32.join(...segments) : posix.join(...segments);
}

export type Resolution =
  | { kind: "found"; path: string; via: "NIMBUS_BIN" | "PATH" | "install-dir" }
  | { kind: "bad-override"; path: string }
  | { kind: "not-found" };

export interface ResolveInput {
  readonly env: Record<string, string | undefined>;
  readonly platform: Platform;
  readonly home: string;
  readonly exists: (path: string) => boolean;
}

function binName(platform: Platform): string {
  return platform === "win32" ? "nimbus.exe" : "nimbus";
}

/**
 * Known install locations, by platform, INSTALLER DIRECTORY FIRST.
 *
 * This duplicates a small amount of path knowledge that the AGPL installer also holds —
 * deliberately, because this package is MIT and cannot import from it, and `scripts/` is not a
 * dependency of it either. The fallback matters precisely when an MCP client spawns this launcher
 * without the user's shell `PATH` (the normal case for a GUI-launched editor on macOS), so a list
 * that misses the real installer directory reports "Could not find the Nimbus CLI" against a
 * perfectly good install.
 *
 * The drift risk is covered in TWO halves, because this package no longer lives beside the
 * installer and nothing here can read its source:
 *
 *   1. `installer-contract.test.ts` asserts each platform's first candidate is built from
 *      `installer-contract.ts`'s vendored literals. That runs on every PR, but it only proves
 *      this repo is self-consistent — it cannot see the installer move.
 *   2. The monorepo's `scripts/structure-audit/check-launcher-installer-contract.ts` compares
 *      those vendored literals against `resolveInstallDir` itself, run by `install-smoke.yml`
 *      (PR-time, on `scripts/install/**` changes) and `org-drift-sweep.yml` (scheduled — the
 *      only one that can see a change made HERE).
 *
 * Half 2 is the one that actually catches drift. A green `bun test` in this repo is not
 * evidence that these directories still match what the installer writes.
 *
 * Entries after the first are additional plausible locations, not installer output — a
 * package-manager or hand-placed binary. Nothing invented: every path here either is the installer's
 * own, or is a directory a real distribution channel uses. The package-manager channels are the ones
 * the monorepo publishes manifests for in `scripts/release/package-manager-manifests.ts`, served by
 * `nimbus-agent/homebrew-tap` and `nimbus-agent/scoop-bucket`.
 *
 * ORDER IS APPEND-ONLY. New channels go at the END of a platform's list, so adding one can only
 * turn a `not-found` into a `found` — never redirect an install that already resolves. Two tests in
 * `resolve-binary.test.ts` pin that ("the installer directory still wins over ...").
 */
export function CANDIDATE_DIRS(
  platform: Platform,
  home: string,
  env: Record<string, string | undefined>,
): string[] {
  if (platform === "win32") {
    const localAppData = env["LOCALAPPDATA"] ?? join(platform, home, "AppData", "Local");
    // Scoop puts a real `.exe` shim in `<root>\shims`, so `binName` needs no PATHEXT handling —
    // only the directory was missing. Both roots are relocatable and commonly relocated off a small
    // C: drive, so the env overrides are read rather than assuming the defaults.
    //
    // These keys are read in UPPER CASE because Node's `process.env` on Windows is a
    // case-insensitive proxy — `PROGRAMDATA` finds the OS's mixed-case `ProgramData` at runtime.
    // Test doubles are plain Records and case-sensitive, so they must match this spelling.
    const scoopUser = env["SCOOP"] ?? join(platform, home, "scoop");
    const scoopGlobal =
      env["SCOOP_GLOBAL"] ??
      join(platform, env["PROGRAMDATA"] ?? String.raw`C:\ProgramData`, "scoop");
    return [
      join(platform, localAppData, "Programs", "Nimbus", "bin"),
      join(platform, scoopUser, "shims"),
      join(platform, scoopGlobal, "shims"),
    ];
  }
  if (platform === "darwin") {
    // Homebrew's macOS prefixes are `/opt/homebrew` (Apple Silicon) and `/usr/local` (Intel) —
    // both already in this list, so the tap needs no extra entry here.
    return [join(platform, home, ".local", "bin"), "/opt/homebrew/bin", "/usr/local/bin"];
  }
  // `/usr/local/bin` also covers the apt/yum packages, whose wrapper scripts land there
  // (`scripts/release/nfpm-config.ts`). The linuxbrew entries are Homebrew-on-Linux: the shared
  // prefix its installer creates, then the personal one used when that path is not writable.
  return [
    join(platform, home, ".local", "bin"),
    "/usr/local/bin",
    "/usr/bin",
    "/home/linuxbrew/.linuxbrew/bin",
    join(platform, home, ".linuxbrew", "bin"),
  ];
}

export function resolveNimbusBinary(input: ResolveInput): Resolution {
  const name = binName(input.platform);

  const override = input.env["NIMBUS_BIN"];
  if (override !== undefined && override.length > 0) {
    return input.exists(override)
      ? { kind: "found", path: override, via: "NIMBUS_BIN" }
      : { kind: "bad-override", path: override };
  }

  const sep = input.platform === "win32" ? ";" : ":";
  for (const dir of (input.env["PATH"] ?? "").split(sep)) {
    if (dir.length === 0) continue;
    const candidate = join(input.platform, dir, name);
    if (input.exists(candidate)) return { kind: "found", path: candidate, via: "PATH" };
  }

  for (const dir of CANDIDATE_DIRS(input.platform, input.home, input.env)) {
    const candidate = join(input.platform, dir, name);
    if (input.exists(candidate)) return { kind: "found", path: candidate, via: "install-dir" };
  }

  return { kind: "not-found" };
}

const DOCS = "https://nimbus-agent.dev/user-guide/install/";

/** The message shown for each unresolvable state. Each names the fix, never a bare exit code. */
export function explain(resolution: Resolution): string {
  if (resolution.kind === "bad-override") {
    return `NIMBUS_BIN is set to "${resolution.path}" but no file is there. Correct it or unset it. See ${DOCS}`;
  }
  return `Could not find the Nimbus CLI. Install it (see ${DOCS}), or set NIMBUS_BIN to its full path.`;
}
