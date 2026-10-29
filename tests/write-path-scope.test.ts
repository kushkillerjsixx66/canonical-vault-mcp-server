import assert from "node:assert/strict";
import test from "node:test";
import { assertWritablePath, WritePathScopeError } from "../src/services/write-path-scope.ts";

const branches = ["chatgpt", "claude", "grok", "gemini", "muse"];

test("allows a repository-relative ordinary path for an allowed branch", () => {
  assert.equal(assertWritablePath("01_modules/ide/spec.md", "chatgpt", branches), "01_modules/ide/spec.md");
});

test("rejects absolute paths, backslashes, empty segments, and traversal before mutation", () => {
  for (const path of ["/01_modules/spec.md", "\\\\host\\file", "a\\b", "a//b", "./a", "a/../b", "a/./b", ""]) {
    assert.throws(() => assertWritablePath(path, "chatgpt", branches), WritePathScopeError, path || "(empty)");
  }
});

test("protected zones cannot be bypassed with leading slash or case changes", () => {
  for (const path of [
    "00_governance/constitution/v1.md",
    "00_GOVERNANCE/CONSTITUTION/v1.md",
    "06_IP_LEGAL/priority.md",
    "00_governance/claude/manifest.json",
    "dir/.GIT/config",
  ]) {
    assert.throws(() => assertWritablePath(path, "chatgpt", branches), WritePathScopeError, path);
  }
});

test("model-owned paths must match the target branch", () => {
  assert.throws(
    () => assertWritablePath("vault/claude/notes.md", "chatgpt", branches),
    /owned by model 'claude'/
  );
  assert.equal(assertWritablePath("vault/ChatGPT/notes.md", "chatgpt", branches), "vault/ChatGPT/notes.md");
});

test("rejects unapproved branches and control characters", () => {
  assert.throws(() => assertWritablePath("notes.md", "main", branches), /not a governed write branch/);
  assert.throws(() => assertWritablePath("notes\u0000.md", "chatgpt", branches), /Control characters/);
});
