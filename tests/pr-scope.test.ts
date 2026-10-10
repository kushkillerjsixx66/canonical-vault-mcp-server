import assert from "node:assert/strict";
import test from "node:test";
import { createPullRequestWithinScope, pullRequestTargetError, PullRequestTargetScopeError } from "../src/services/pr-scope.ts";

test("accepts an allowlisted source targeting the configured canonical branch", () => {
  assert.equal(pullRequestTargetError("chatgpt", "main", "main"), undefined);
});

test("rejects a destination other than the configured canonical target", () => {
  assert.match(
    pullRequestTargetError("chatgpt", "develop", "main") ?? "",
    /must match configured canonical target 'main'/
  );
});

test("rejects identical source and destination branches", () => {
  assert.match(
    pullRequestTargetError("main", "main", "main") ?? "",
    /source and destination branches must differ/
  );
});

test("rejects alternate base even when source branch is valid", () => {
  assert.notEqual(pullRequestTargetError("grok", "release", "main"), undefined);
});

test("does not invoke the PR creation sink for an unauthorized destination", async () => {
  let calls = 0;
  await assert.rejects(
    createPullRequestWithinScope("chatgpt", "release", "main", async () => {
      calls += 1;
      return { number: 1 };
    }),
    PullRequestTargetScopeError
  );
  assert.equal(calls, 0);
});

test("invokes the PR creation sink exactly once for an authorized destination", async () => {
  let calls = 0;
  const result = await createPullRequestWithinScope("chatgpt", "main", "main", async () => {
    calls += 1;
    return { number: 7 };
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { number: 7 });
});
