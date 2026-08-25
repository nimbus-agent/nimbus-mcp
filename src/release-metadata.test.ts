import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The four version/identity links between `package.json`, `server.json` and
 * `.release-please-manifest.json`, asserted BEFORE anything is published.
 *
 * `release.yml`'s `publish-registry` job already asserts the `server.json` half — but it runs
 * AFTER `npm publish`, and npm cannot unpublish after 72 hours. At that point the assertion
 * reports damage rather than preventing it: the npm version is live and the registry entry it was
 * supposed to describe never lands. Running the same claims inside `bun test` moves them to two
 * strictly earlier points, with no new CI wiring:
 *
 *   1. every PR, on all three OSes (`ci.yml`), which is where a release PR is reviewed; and
 *   2. `release.yml`'s publish job itself, whose `bun test` step runs BEFORE `npm publish`.
 *
 * Nothing keeps these files in step by construction. `server.json`'s two version fields are
 * rewritten by release-please's `extra-files` config (two `jsonpath` entries in
 * `release-please-config.json`), which is ordinary configuration: a release-please major bump, a
 * schema change in `server.json`, or a hand-edit can silently stop it working, and the release PR
 * would still look correct — the CHANGELOG and `package.json` bump either way.
 *
 * The identity pair is not version-dependent and can only be broken by hand, but it is the pair
 * the MCP Registry uses to prove we own the npm package (`mcpName` is checked against the
 * PUBLISHED tarball). Getting it wrong ships a registry entry pointing at a package it cannot
 * claim, and fixing it costs a new npm version — so it is worth a line here too.
 */

const ROOT = join(import.meta.dir, "..");

function readJsonObject(file: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(join(ROOT, file), "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${file} did not parse to a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

/** Reads a required string field, failing loudly rather than comparing two `undefined`s. */
function requireString(obj: Record<string, unknown>, key: string, where: string): string {
  const value = obj[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${where} is missing a non-empty string "${key}"`);
  }
  return value;
}

const pkg = readJsonObject("package.json");
const server = readJsonObject("server.json");
const manifest = readJsonObject(".release-please-manifest.json");

function firstServerPackage(): Record<string, unknown> {
  const packages = server["packages"];
  if (!Array.isArray(packages)) {
    throw new Error("server.json is missing a `packages` array");
  }
  const first: unknown = packages[0];
  if (typeof first !== "object" || first === null || Array.isArray(first)) {
    throw new Error("server.json's `packages[0]` is not an object");
  }
  return first as Record<string, unknown>;
}

test("server.json's two version fields track package.json", () => {
  // Both are `extra-files` jsonpath entries in release-please-config.json. If either stops being
  // rewritten, this is the first thing that notices — and it notices while the release PR is still
  // open, which is the last moment the outcome is still free.
  const version = requireString(pkg, "version", "package.json");
  expect(requireString(server, "version", "server.json")).toBe(version);
  expect(requireString(firstServerPackage(), "version", "server.json packages[0]")).toBe(version);
});

test("the release-please manifest agrees with package.json", () => {
  // release-please reads the manifest, not package.json, to decide what the CURRENT version is.
  // A drift here makes it compute the next version from the wrong base — and its release PR
  // looks perfectly normal.
  expect(requireString(manifest, ".", ".release-please-manifest.json")).toBe(
    requireString(pkg, "version", "package.json"),
  );
});

test("the npm package and the MCP Registry entry name each other", () => {
  // `mcpName` is how the registry verifies npm ownership, and it is checked against the PUBLISHED
  // tarball — so a mismatch is not a metadata edit away from being fixed, it costs a new version.
  expect(requireString(server, "name", "server.json")).toBe(
    requireString(pkg, "mcpName", "package.json"),
  );
  expect(requireString(firstServerPackage(), "identifier", "server.json packages[0]")).toBe(
    requireString(pkg, "name", "package.json"),
  );
});

test("the registry entry still describes a stdio launcher", () => {
  // The launcher's entire contract is `nimbus mcp-server --stdio` with stdio inherited. A registry
  // entry advertising any other transport would send clients down a path this package cannot
  // serve, and nothing else in the repo reads this field.
  const transport = firstServerPackage()["transport"];
  if (typeof transport !== "object" || transport === null || Array.isArray(transport)) {
    throw new Error("server.json's `packages[0].transport` is not an object");
  }
  expect((transport as Record<string, unknown>)["type"]).toBe("stdio");
});
