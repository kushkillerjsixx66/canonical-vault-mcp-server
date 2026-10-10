import assert from "node:assert/strict";
import test from "node:test";
import { pullRequestTargetError } from "../src/services/pr-scope.ts";

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
