# @nimbus-dev/mcp

## What this is

A tiny launcher that exposes your local [Nimbus](https://nimbus-agent.dev) index and agents to
any [MCP (Model Context Protocol)](https://modelcontextprotocol.io) client — editors, chat clients,
or other MCP-speaking tools. It does no work itself: it locates the Nimbus CLI binary already
installed on your machine and execs it as `nimbus mcp-server --stdio`, then gets out of the way and
lets stdio pass straight through.

This package is MIT-licensed and does not depend on (or import from) the AGPL-3.0 `packages/cli` or
`packages/gateway` Nimbus source — it only knows how to *find* the installed binary, never how to
run the gateway itself.

**Requires the Nimbus gateway to already be installed.** This launcher does not install or bundle
Nimbus; run the regular Nimbus installer first, and keep the gateway configured the way you
normally use it (the `mcp-server --stdio` command talks to your existing local index).

## Scope

Finding the binary, spawning it with stdio inherited, and staying in the process tree only long
enough to translate the child's exit status back to the client is the whole job. Keeping it that
way is what lets this package stay MIT while the gateway it launches is AGPL-3.0. Specifically,
it does not:

- **Install, bundle, update, or version-check Nimbus.** Use the regular Nimbus installer.
- **Implement any MCP tools.** The index and agent tools are served by `nimbus mcp-server` in the
  [Nimbus](https://github.com/nimbus-agent/Nimbus) monorepo (`packages/cli`, `packages/gateway`).
  A tool that is missing or misbehaving is a bug there, not here.
- **Parse, filter, proxy, or rewrite the MCP stream.** The child process inherits stdio, and traffic
  passes through untouched in both directions.
- **Manage gateway configuration, authentication, or the index itself.** Configure those the way you
  normally do; this launcher passes your environment through unchanged and otherwise stays out of
  the way.
- **Take on runtime dependencies.** `package.json` has `devDependencies` only. That is a licence and
  supply-chain boundary rather than a style preference — adding a runtime dependency here is a
  deliberate decision, not a convenience call.

## Install

Run it directly, without a global install, from your MCP client's config (see below), or install it
explicitly:

```bash
npm install -g @nimbus-dev/mcp
```

## Quickstart

Add `nimbus-mcp` as a command in your MCP client's server configuration, for example:

```json
{
  "mcpServers": {
    "nimbus": {
      "command": "npx",
      "args": ["-y", "@nimbus-dev/mcp"]
    }
  }
}
```

Clients that install from the [MCP Registry](https://registry.modelcontextprotocol.io) can find this
server listed as `io.github.nimbus-agent/nimbus`.

### Running from a local checkout

To run the launcher straight from a clone of
[this repository](https://github.com/nimbus-agent/nimbus-mcp) — when developing it, or to try a
change before it is released — point your MCP client at the entry point itself. Use absolute paths:
an editor-spawned MCP server does not inherit your shell's working directory.

```json
{
  "mcpServers": {
    "nimbus": {
      "command": "bun",
      "args": ["/absolute/path/to/nimbus-mcp/src/index.ts"]
    }
  }
}
```

If you already have the Nimbus CLI installed, you can skip the launcher altogether and have your
client run `nimbus mcp-server --stdio` directly — the launcher exists only to find that binary for
you.

### How the binary is found

The launcher looks for the Nimbus binary in this order:

1. `NIMBUS_BIN` — an explicit full path to the binary, if set. A `NIMBUS_BIN` that points at a
   non-existent file is reported as an error, never silently ignored.
2. `PATH` — the first `nimbus` (or `nimbus.exe` on Windows) found on your `PATH`.
3. Known per-platform install directories, the installer's own output directory first:
   `%LOCALAPPDATA%\Programs\Nimbus\bin` on Windows, `~/.local/bin` on macOS and Linux, then
   `/opt/homebrew/bin` and `/usr/local/bin` (macOS) or `/usr/local/bin` and `/usr/bin` (Linux).

Step 3 is what carries a GUI-launched editor on macOS, which typically spawns MCP servers without
your shell's `PATH`. If none of those resolve, the launcher exits with a message naming the fix —
never a bare exit code.

### Environment variables

- `NIMBUS_BIN` — override the resolved binary path. Point it at the exact Nimbus CLI executable.
- `NIMBUS_MCP_TIMEOUT_MS` — how long the Nimbus **CLI's MCP adapter** waits for an agent brief
  before returning a clean timeout error; it defaults to 60 s. Lower it when your editor's own MCP
  transport timeout is shorter, so the tool reports a timeout instead of having the call severed
  underneath it. This is the adapter's own budget — the gateway imposes no such timeout. It is read
  by the underlying `nimbus mcp-server` process, which this launcher execs with your environment
  inherited unchanged.

## See also

- [`docs/architecture.md`](https://github.com/nimbus-agent/Nimbus/blob/main/docs/architecture.md) —
  Nimbus subsystem design and the MCP connector standard.
- The gateway's `mcp-server` command, in the main [Nimbus](https://github.com/nimbus-agent/Nimbus)
  repository (`packages/gateway`, `packages/cli`) — this package launches it, but does not contain
  or license it.

## License

MIT — see [`LICENSE`](./LICENSE). Note that the Nimbus gateway and CLI this launcher execs are
licensed separately under AGPL-3.0.
