import assert from "node:assert/strict";
import test from "node:test";
import { resolveWriteBranch, WriteBranchScopeError } from "../src/services/write-branch-scope.ts";

test("locked deployment resolves omitted client branch to its configured branch", () => {
  assert.equal(resolveWriteBranch(undefined, true, "chatgpt", "chatgpt", ["chatgpt"]), "chatgpt");
});

test("locked deployment rejects a different requested branch", () => {
  assert.throws(
    () => resolveWriteBranch("grok", true, "chatgpt", "chatgpt", ["chatgpt"]),
    (error: unknown) =>
      error instanceof WriteBranchScopeError &&
      /locked to branch 'chatgpt'/.test(error.message) &&
      /Refusing client branch 'grok'/.test(error.message)
  );
});

test("unlocked allowlist mode honors an explicit requested branch for downstream allowlist validation", () => {
  assert.equal(resolveWriteBranch("muse", false, undefined, "grok,chatgpt,muse", ["grok", "chatgpt", "muse"]), "muse");
});

test("unlocked allowlist mode defaults to the first configured branch", () => {
  assert.equal(resolveWriteBranch(undefined, false, undefined, "", ["grok", "chatgpt"]), "grok");
});

test("empty allowlist does not invent a fallback branch", () => {
  assert.equal(resolveWriteBranch(undefined, false, undefined, "", []), "");
});
