#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { childExitCode } from "./exit-status.ts";
import { explain, type Platform, resolveNimbusBinary } from "./resolve-binary.ts";

const resolution = resolveNimbusBinary({
  env: process.env,
  platform: process.platform as Platform,
  home: homedir(),
  exists: existsSync,
});

if (resolution.kind !== "found") {
  process.stderr.write(`${explain(resolution)}\n`);
  process.exit(1);
}

/** Both spawn failure modes end here, so the client never sees a raw stack trace. */
function failedToStart(message: string): never {
  process.stderr.write(`Failed to start the Nimbus MCP server: ${message}\n`);
  process.exit(1);
}

/**
 * `spawn` reports failure TWO ways, and only one of them reaches `child.on("error")`.
 *
 * The documented path is an asynchronous `error` event (ENOENT for a path that vanished between
 * the `existsSync` check and the spawn, EACCES for a file without the execute bit). But some
 * errnos surface as a SYNCHRONOUS throw from the call itself — on Windows, a file that exists and
 * is named `.exe` but is not a valid executable image throws `spawn UNKNOWN` (errno -4094) before
 * a listener can be attached. Without this catch that becomes an uncaught exception: the user gets
 * a Node stack trace instead of a message naming the fix.
 *
 * Reachable in practice via a stale package-manager shim — `scoop uninstall` can leave one behind,
 * and `CANDIDATE_DIRS` searches the shims directory precisely so a Scoop install resolves.
 */
let child: ReturnType<typeof spawn>;
try {
  child = spawn(resolution.path, ["mcp-server", "--stdio"], { stdio: "inherit" });
} catch (err) {
  failedToStart(err instanceof Error ? err.message : String(err));
}

child.on("exit", (code, signal) => {
  process.exit(childExitCode(code, signal));
});
child.on("error", (err) => {
  failedToStart(err.message);
});
