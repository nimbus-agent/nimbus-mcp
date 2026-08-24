import { expect, test } from "bun:test";
import { CANDIDATE_DIRS, explain, type Resolution, resolveNimbusBinary } from "./resolve-binary.ts";

const WIN_HOME = String.raw`C:\Users\u`;
const WIN_LOCALAPPDATA = String.raw`C:\Users\u\AppData\Local`;

/** The single install-docs link every unresolvable state has to carry. */
const DOCS_URL = "https://nimbus-agent.dev/docs/install";

/**
 * Every Windows case below describes the SAME machine — one home directory, one
 * %LOCALAPPDATA% — and differs only in which file exists and which extra env key is set.
 * Spelling the four-line input object out at each call site buried that one distinguishing
 * line. `extraEnv` is spread last, so a case that needs a different %LOCALAPPDATA% can still
 * say so.
 *
 * NOTE ON ENV KEYS: Node's `process.env` on Windows is a case-INSENSITIVE proxy, so at
 * runtime `env["PROGRAMDATA"]` finds the OS's mixed-case `ProgramData`. The plain objects
 * these tests pass are ordinary Records and ARE case-sensitive, so they must spell each
 * key exactly as `resolve-binary.ts` reads it.
 */
function resolveOnWindows(
  exists: (path: string) => boolean,
  extraEnv: Record<string, string> = {},
): Resolution {
  return resolveNimbusBinary({
    env: { LOCALAPPDATA: WIN_LOCALAPPDATA, ...extraEnv },
    platform: "win32",
    home: WIN_HOME,
    exists,
  });
}

test("an explicit NIMBUS_BIN wins over everything", () => {
  const got = resolveNimbusBinary({
    env: { NIMBUS_BIN: "/custom/nimbus" },
    platform: "linux",
    home: "/home/u",
    exists: (p) => p === "/custom/nimbus",
  });
  expect(got).toEqual({ kind: "found", path: "/custom/nimbus", via: "NIMBUS_BIN" });
});

test("a NIMBUS_BIN pointing at nothing is an explicit error, not a silent fallback", () => {
  const got = resolveNimbusBinary({
    env: { NIMBUS_BIN: "/missing/nimbus" },
    platform: "linux",
    home: "/home/u",
    exists: () => false,
  });
  expect(got.kind).toBe("bad-override");
});

test("PATH is used when NIMBUS_BIN is unset", () => {
  const got = resolveNimbusBinary({
    env: { PATH: "/usr/bin:/usr/local/bin" },
    platform: "linux",
    home: "/home/u",
    exists: (p) => p === "/usr/local/bin/nimbus",
  });
  expect(got).toEqual({ kind: "found", path: "/usr/local/bin/nimbus", via: "PATH" });
});

test("falls back to a known install directory", () => {
  const got = resolveNimbusBinary({
    env: {},
    platform: "linux",
    home: "/home/u",
    exists: (p) => p === "/home/u/.local/bin/nimbus",
  });
  expect(got).toEqual({ kind: "found", path: "/home/u/.local/bin/nimbus", via: "install-dir" });
});

test("windows looks for nimbus.exe", () => {
  const got = resolveOnWindows((p) => p.endsWith("nimbus.exe"));
  expect(got.kind).toBe("found");
  if (got.kind === "found") expect(got.path.endsWith("nimbus.exe")).toBe(true);
});

test("not found is reported, never thrown", () => {
  const got = resolveNimbusBinary({
    env: {},
    platform: "darwin",
    home: "/Users/u",
    exists: () => false,
  });
  expect(got.kind).toBe("not-found");
});

test("every platform has at least one candidate directory", () => {
  for (const p of ["win32", "darwin", "linux"] as const) {
    expect(CANDIDATE_DIRS(p, "/home/u", {}).length).toBeGreaterThan(0);
  }
});

/**
 * The installer-directory drift guard that used to live here read
 * `scripts/install/lib/paths.ts` as text out of the monorepo, via a relative path. That
 * path does not exist in this repo. It is replaced by `installer-contract.test.ts`
 * (vendored constants, checked every PR) plus the monorepo-side cross-repo audit, which
 * is the half that can actually see the installer move.
 */

test("no candidate directory is a location no installer or distribution channel writes to", () => {
  // `~/.nimbus/bin` was invented by the plan and appears nowhere else in the repo. Naming it here
  // keeps it from drifting back in as a plausible-looking guess.
  for (const p of ["win32", "darwin", "linux"] as const) {
    for (const dir of CANDIDATE_DIRS(p, "/home/u", { LOCALAPPDATA: "C:\\L" })) {
      expect(dir).not.toContain(".nimbus");
    }
  }
});

/**
 * Scoop and Homebrew-on-Linux are advertised install channels for the Nimbus CLI — the
 * monorepo's `docs/install.md` lists both, and `nimbus-agent/scoop-bucket` and
 * `nimbus-agent/homebrew-tap` are the repos serving them. A binary installed that way has
 * to resolve when the MCP client spawns us without the user's shell PATH, which is the
 * whole reason CANDIDATE_DIRS exists.
 */

test("a Scoop per-user shim is found at the default Scoop root", () => {
  const got = resolveOnWindows((p) => p === String.raw`C:\Users\u\scoop\shims\nimbus.exe`);
  expect(got).toEqual({
    kind: "found",
    path: String.raw`C:\Users\u\scoop\shims\nimbus.exe`,
    via: "install-dir",
  });
});

test("a relocated Scoop root is honoured via $SCOOP", () => {
  const got = resolveOnWindows((p) => p === String.raw`D:\scoop\shims\nimbus.exe`, {
    SCOOP: String.raw`D:\scoop`,
  });
  expect(got.kind).toBe("found");
  if (got.kind === "found") expect(got.path).toBe(String.raw`D:\scoop\shims\nimbus.exe`);
});

test("a global Scoop install is found under %ProgramData%", () => {
  const got = resolveOnWindows((p) => p === String.raw`C:\ProgramData\scoop\shims\nimbus.exe`, {
    PROGRAMDATA: String.raw`C:\ProgramData`,
  });
  expect(got.kind).toBe("found");
  if (got.kind === "found") {
    expect(got.path).toBe(String.raw`C:\ProgramData\scoop\shims\nimbus.exe`);
  }
});

test("a relocated global Scoop root is honoured via $SCOOP_GLOBAL", () => {
  const got = resolveOnWindows((p) => p === String.raw`E:\shared\scoop\shims\nimbus.exe`, {
    SCOOP_GLOBAL: String.raw`E:\shared\scoop`,
  });
  expect(got.kind).toBe("found");
  if (got.kind === "found") expect(got.path).toBe(String.raw`E:\shared\scoop\shims\nimbus.exe`);
});

test("the installer directory still wins over a Scoop shim when both exist", () => {
  // The new entries are APPENDED, never inserted: every input that resolves today must
  // resolve to the same path afterwards. Reordering the list would break this.
  const got = resolveOnWindows(() => true);
  expect(got).toEqual({
    kind: "found",
    path: String.raw`C:\Users\u\AppData\Local\Programs\Nimbus\bin\nimbus.exe`,
    via: "install-dir",
  });
});

test("a Homebrew-on-Linux install is found at the shared linuxbrew prefix", () => {
  const got = resolveNimbusBinary({
    env: {},
    platform: "linux",
    home: "/home/u",
    exists: (p) => p === "/home/linuxbrew/.linuxbrew/bin/nimbus",
  });
  expect(got).toEqual({
    kind: "found",
    path: "/home/linuxbrew/.linuxbrew/bin/nimbus",
    via: "install-dir",
  });
});

test("a Homebrew-on-Linux install is found at the personal linuxbrew prefix", () => {
  const got = resolveNimbusBinary({
    env: {},
    platform: "linux",
    home: "/home/u",
    exists: (p) => p === "/home/u/.linuxbrew/bin/nimbus",
  });
  expect(got.kind).toBe("found");
  if (got.kind === "found") expect(got.path).toBe("/home/u/.linuxbrew/bin/nimbus");
});

test("the installer directory still wins over linuxbrew when both exist", () => {
  const got = resolveNimbusBinary({
    env: {},
    platform: "linux",
    home: "/home/u",
    exists: () => true,
  });
  expect(got).toEqual({ kind: "found", path: "/home/u/.local/bin/nimbus", via: "install-dir" });
});

/**
 * Every other Windows test supplies `PROGRAMDATA` explicitly, so the built-in default is the one
 * path in `CANDIDATE_DIRS` that nothing asserts. It is written with `String.raw`; losing that tag
 * without re-escaping turns `\P` into a plain `P`, so the default silently becomes the relative
 * `C:ProgramData` and a global Scoop install stops resolving. (A doubled separator is NOT the
 * failure mode here — `win32.join` collapses it — which is why this pins the whole directory.)
 */
test("the default machine-wide Scoop root is the real %ProgramData% path", () => {
  expect(CANDIDATE_DIRS("win32", WIN_HOME, {})).toContain(String.raw`C:\ProgramData\scoop\shims`);
});

/**
 * `explain()` produces the ONLY thing a user ever sees when the launcher cannot start: an MCP
 * client surfaces the failed process's stderr and nothing else, and `index.ts` prints exactly
 * this string before exiting 1. A message that drops the offending path, the env var name or the
 * docs link turns a one-minute fix into a support round-trip. Nothing called this function until
 * now — it was the only uncovered code in the package.
 */

const UNRESOLVABLE: readonly Resolution[] = [
  { kind: "bad-override", path: "/missing/nimbus" },
  { kind: "not-found" },
];

test("every unresolvable state is explained with a link to the install docs", () => {
  for (const resolution of UNRESOLVABLE) {
    expect(explain(resolution)).toContain(DOCS_URL);
  }
});

test("a bad NIMBUS_BIN is explained by naming the path, the variable and both ways out", () => {
  const message = explain({ kind: "bad-override", path: String.raw`D:\tools\nimbus.exe` });
  expect(message).toContain(String.raw`D:\tools\nimbus.exe`);
  expect(message).toContain("NIMBUS_BIN");
  expect(message).toContain("Correct it or unset it");
});

test("a not-found is explained as a missing install, not as a bad override", () => {
  const message = explain({ kind: "not-found" });
  expect(message).toContain("Could not find the Nimbus CLI");
  // The escape hatch is still offered — this is also the state a PATH-less GUI client hits.
  expect(message).toContain("NIMBUS_BIN");
  // The bad-override wording quotes a path, and in THIS state there is no path to quote:
  // printing it would send the user off to correct an env var they never set.
  expect(message).not.toContain("is set to");
});
