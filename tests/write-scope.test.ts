import assert from "node:assert/strict";
import test from "node:test";
import {
  assertWritableTarget,
  WriteScopeError,
  writeFileWithinScope,
} from "../src/services/write-scope.ts";

const policy = {
  allowedBranches: ["chatgpt", "claude", "grok", "gemini"],
  canonicalBranch: "main",
  prohibitedPaths: [
    /^00_governance\/constitution\//,
    /^06_ip_legal\//,
    /^00_governance\/claude\/manifest\.json$/,
    /(^|\/)\.git(\/|$)/,
  ],
  modelSegmentFromPath(path: string): string | undefined {
    const match = /^(?:vault|runtime|00_governance)\/(chatgpt|claude|grok|gemini|copilot|muse)\//i.exec(path);
    return match?.[1].toLowerCase();
  },
};

test("canonical branch is rejected before the sink is invoked", async () => {
  let calls = 0;
  await assert.rejects(
    writeFileWithinScope("main", "01_modules/ide/spec.md", policy, async () => {
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

test("pure target validation rejects an unknown branch", () => {
  assert.throws(
    () => assertWritableTarget("muse", "01_modules/ide/spec.md", policy),
    WriteScopeError
  );
});
