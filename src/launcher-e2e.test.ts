import { afterAll, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * End-to-end tests for `src/index.ts` — the bin entry itself, run as a real child process.
 *
 * `index.ts` is `sonar.coverage.exclusions`-exempt because it is a shebang entry whose work
 * happens at module scope, so these do not move a coverage number. They exist because it is the
 * WIRE between two well-tested halves (`resolveNimbusBinary`/`explain` and `childExitCode`) and
 * nothing here exercised it: a test on each end proves the ends, never the wire. The three things
 * that can only break here are (1) the argv handed to the CLI, (2) `stdio: "inherit"`, without
 * which the MCP client talks to a server it cannot hear, and (3) which stream a diagnostic goes
 * to — stdout is the JSON-RPC channel, so one stray line on it is a protocol violation.
 *
 * CI's `bash` smoke step covers the not-found branch against the BUILT bundle; that branch is
 * deliberately not repeated here, because making it hermetic means neutralising every candidate
 * directory and the POSIX ones (`/usr/local/bin`, `/usr/bin`, the linuxbrew prefixes) are
 * absolute and cannot be pointed elsewhere by env.
 */

const LAUNCHER = join(import.meta.dir, "index.ts");
const IS_WINDOWS = process.platform === "win32";

/** Generous: this spawns bun, which then spawns a second process, on a shared CI runner. */
const E2E_TIMEOUT_MS = 30_000;

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "nimbus-mcp-e2e-"));
  tempDirs.push(dir);
  return dir;
}

/**
 * A stand-in for the real CLI: it reports the argv it was handed on stdout and exits with a
 * known status. A `.cmd` on Windows and a `#!/bin/sh` script elsewhere — what matters is only
 * that the OS can execute the file directly, since the launcher spawns the resolved path with
 * no shell. (The real resolved binary is `nimbus.exe`/`nimbus`; this is a test double, and the
 * launcher neither knows nor cares which it got.)
 */
function fakeNimbus(exitCode: number): string {
  const path = join(tempDir(), IS_WINDOWS ? "nimbus.cmd" : "nimbus");
  if (IS_WINDOWS) {
    writeFileSync(path, `@echo off\r\necho FAKE-NIMBUS %*\r\nexit /b ${exitCode}\r\n`);
  } else {
    writeFileSync(path, `#!/bin/sh\necho "FAKE-NIMBUS $*"\nexit ${exitCode}\n`);
    chmodSync(path, 0o755);
  }
  return path;
}

/** A file that exists — so resolution succeeds — but that the OS refuses to execute. */
function unusableNimbus(): string {
  const path = join(tempDir(), IS_WINDOWS ? "nimbus.exe" : "nimbus");
  // No execute bit on POSIX (EACCES); on Windows a file named `.exe` that is not a valid
  // executable image is the `spawn UNKNOWN` case `index.ts`'s try/catch documents.
  writeFileSync(path, "not an executable image\n");
  return path;
}

interface LaunchResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Runs the bin entry with `NIMBUS_BIN` pointed at `nimbusBin`, capturing the two output streams
 * SEPARATELY — the split is half of what these tests assert, so a combined `2>&1` capture would
 * defeat them. The override short-circuits `CANDIDATE_DIRS` entirely, which is what keeps these
 * independent of whether the machine running them has Nimbus installed.
 */
async function runLauncher(nimbusBin: string): Promise<LaunchResult> {
  const proc = Bun.spawn([process.execPath, LAUNCHER], {
    cwd: tmpdir(),
    env: { ...process.env, NIMBUS_BIN: nimbusBin },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

test(
  "the resolved binary is run as `mcp-server --stdio`, with the client's streams inherited",
  async () => {
    const { code, stdout, stderr } = await runLauncher(fakeNimbus(0));
    // The child wrote this to ITS stdout. Seeing it here is what proves `stdio: "inherit"`:
    // a launcher that piped instead would leave this empty, and the MCP client would sit
    // waiting on a server whose handshake never arrives.
    expect(stdout).toContain("FAKE-NIMBUS");
    expect(stdout).toContain("mcp-server --stdio");
    expect(stderr).toBe("");
    expect(code).toBe(0);
  },
  E2E_TIMEOUT_MS,
);

test(
  "the child's exit status is the launcher's exit status",
  async () => {
    // 7 rather than 1: it cannot be confused with the launcher's own failure exit, so this
    // fails if the wiring ever collapses to a hardcoded code.
    const { code } = await runLauncher(fakeNimbus(7));
    expect(code).toBe(7);
  },
  E2E_TIMEOUT_MS,
);

test(
  "an unusable NIMBUS_BIN is reported on stderr, never on stdout",
  async () => {
    const missing = join(tempDir(), "nimbus-that-is-not-there");
    const { code, stdout, stderr } = await runLauncher(missing);
    expect(code).toBe(1);
    expect(stderr).toContain(missing);
    expect(stderr).toContain("https://nimbus-agent.dev/docs/install");
    // stdout is the MCP JSON-RPC channel. A diagnostic here is a protocol violation, not a
    // cosmetic slip: the client parses the first thing it reads as a frame.
    expect(stdout).toBe("");
  },
  E2E_TIMEOUT_MS,
);

test(
  "a file that exists but will not execute produces a message, not a stack trace",
  async () => {
    const { code, stdout, stderr } = await runLauncher(unusableNimbus());
    expect(code).toBe(1);
    expect(stderr).toContain("Failed to start the Nimbus MCP server:");
    // A raw stack frame means the throw escaped both the try/catch and the `error` listener —
    // exactly the "user gets a Node stack trace instead of the fix" outcome they exist to stop.
    expect(stderr).not.toContain("\n    at ");
    expect(stdout).toBe("");
  },
  E2E_TIMEOUT_MS,
);
