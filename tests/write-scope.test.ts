import assert from "node:assert/strict";
import test from "node:test";
import {
  GITHUB_DEFAULT_REF,
  WRITE_BRANCH_ALLOWLIST,
  WRITE_PATH_DENYLIST,
  modelSegmentFromPath,
} from "../src/constants.js";
import {
  assertWritableTarget,
  WriteScopeError,
  writeFileWithinScope,
} from "../src/services/write-scope.ts";

const policy = {
  allowedBranches: WRITE_BRANCH_ALLOWLIST,
  canonicalBranch: GITHUB_DEFAULT_REF,
  prohibitedPaths: WRITE_PATH_DENYLIST,
  modelSegmentFromPath,
};

test("canonical branch is rejected before the sink is invoked", async () => {
  let calls = 0;
  await assert.rejects(
    writeFileWithinScope(GITHUB_DEFAULT_REF, "01_modules/ide/spec.md", policy, async () => {
      calls += 1;
      return "written";
    }),
    WriteScopeError
  );
  assert.equal(calls, 0);
});

test("protected governance paths are rejected before the sink is invoked", async () => {
  let calls = 0;
  await assert.rejects(
    writeFileWithinScope("chatgpt", "00_governance/constitution/amendment.md", policy, async () => {
      calls += 1;
      return "written";
    }),
    /prohibited zone/
  );
  assert.equal(calls, 0);
});

test("model-owned path and branch mismatch is rejected before the sink is invoked", async () => {
  let calls = 0;
  await assert.rejects(
    writeFileWithinScope("chatgpt", "vault/grok/notes.md", policy, async () => {
      calls += 1;
      return "written";
    }),
    /owned by model 'grok'/
  );
  assert.equal(calls, 0);
});

test("a valid model-branch target invokes the sink exactly once", async () => {
  let calls = 0;
  const result = await writeFileWithinScope(
    "chatgpt",
    "vault/chatgpt/notes.md",
    policy,
    async () => {
      calls += 1;
      return { commit: "test-commit" };
    }
  );
  assert.equal(calls, 1);
  assert.deepEqual(result, { commit: "test-commit" });
});

test("branch absent from the production allowlist is rejected", () => {
  assert.throws(
    () => assertWritableTarget("operator", "01_modules/ide/spec.md", policy),
    WriteScopeError
  );
});
