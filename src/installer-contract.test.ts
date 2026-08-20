import { expect, test } from "bun:test";
import { INSTALLER_POSIX_SUFFIX, INSTALLER_WIN32_SUFFIX } from "./installer-contract.ts";
import { CANDIDATE_DIRS } from "./resolve-binary.ts";

test("the FIRST candidate on every platform is built from the vendored installer suffix", () => {
  // cross-platform-ok: these separators come from the vendored installer contract,
  // not from a host-path assumption.
  const localAppData = "C:\\Users\\u\\AppData\\Local";
  expect(CANDIDATE_DIRS("win32", "C:\\Users\\u", { LOCALAPPDATA: localAppData })[0]).toBe(
    `${localAppData}${INSTALLER_WIN32_SUFFIX}`,
  );
  expect(CANDIDATE_DIRS("darwin", "/Users/u", {})[0]).toBe(`/Users/u${INSTALLER_POSIX_SUFFIX}`);
  expect(CANDIDATE_DIRS("linux", "/home/u", {})[0]).toBe(`/home/u${INSTALLER_POSIX_SUFFIX}`);
});

test("the vendored suffixes are non-empty", () => {
  // A previous version of this guard asserted `length > 0` on the candidate list and
  // passed against [""]. Assert the constants themselves, so an emptied vendor file
  // cannot make the test above trivially true.
  expect(INSTALLER_WIN32_SUFFIX.length).toBeGreaterThan(0);
  expect(INSTALLER_POSIX_SUFFIX.length).toBeGreaterThan(0);
});
