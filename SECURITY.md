# Security Policy

`@nimbus-dev/mcp` is an MIT-licensed launcher: it resolves the `nimbus` binary
already installed on the machine and execs it as `nimbus mcp-server --stdio`,
then passes stdio through. It has **zero runtime dependencies**, holds no
credentials, and makes no outbound network calls of its own.

What it does do is **decide which executable to run**, which is the whole of its
security surface — see below.

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue:

- Use GitHub's [private vulnerability reporting](https://github.com/nimbus-agent/nimbus-mcp/security/advisories/new)
  for this repository, or
- Follow the disclosure process in the main
  [Nimbus security policy](https://github.com/nimbus-agent/Nimbus/security/policy).

Please include reproduction steps and the launcher version. We aim to acknowledge
reports within a few business days.

## Security posture

- **Zero runtime dependencies.** The published package declares `devDependencies`
  only, so its supply-chain surface is this repo's own source and nothing else.
- **Provenance publishing.** Releases are published with `npm publish --provenance`
  via GitHub Actions OIDC / npm trusted-publisher — there is no long-lived npm
  token in repository or organization secrets, and each release carries a
  verifiable attestation.
- **Binary resolution is the security surface.** The launcher picks an executable
  and runs it. Resolution order is `NIMBUS_BIN` (explicit operator override) →
  `PATH` → a fixed, closed list of known install directories in
  `src/resolve-binary.ts`. That list is not open-ended and not user-extensible:
  every entry is either the Nimbus installer's own output directory or a
  directory a real distribution channel writes to. A report that makes the
  launcher execute an attacker-chosen path is in scope here.
- **No privilege of its own.** The launcher runs as the invoking user and grants
  nothing the user did not already have. Credential handling, the HITL consent
  gate, connector sandboxing, and the egress ledger all live in the
  [Nimbus](https://github.com/nimbus-agent/Nimbus) gateway, not here.

## Scope

Issues in the gateway, the MCP server itself (`packages/cli/src/mcp/` in the
monorepo), connectors, the Vault, or the HITL/consent machinery belong in the
[Nimbus](https://github.com/nimbus-agent/Nimbus) repository. Issues in this
launcher's binary resolution, argument handling, or exit-status translation
belong here.
