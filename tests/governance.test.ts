import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  KNOWN_MODEL_BRANCHES,
  WRITE_BRANCH_ALLOWLIST,
  WRITE_PATH_DENYLIST,
  GITHUB_DEFAULT_REF,
  modelSegmentFromPath,
} from "../src/constants.js";
import {
  AGENT_BRANCH_MAP,
  isValidAgent,
  branchForAgent,
} from "../src/services/vaultWriteService.js";

describe("write branch allowlist (governance invariant)", () => {
  it("never includes the canonical/default branch", () => {
    assert.equal(WRITE_BRANCH_ALLOWLIST.includes(GITHUB_DEFAULT_REF), false);
    assert.equal(WRITE_BRANCH_ALLOWLIST.includes("main"), false);
  });

  it("defaults to the known model branches when no env scope is set", () => {
    for (const b of WRITE_BRANCH_ALLOWLIST) {
      assert.ok(
        (KNOWN_MODEL_BRANCHES as readonly string[]).includes(b),
        `unexpected branch in allowlist: ${b}`
      );
    }
  });

  it("known model branches do not include the canonical branch", () => {
    assert.equal((KNOWN_MODEL_BRANCHES as readonly string[]).includes("main"), false);
  });
});

describe("WRITE_PATH_DENYLIST", () => {
  const denied = [
    "00_governance/constitution/v1.1.md",
    "06_ip_legal/priority.md",
    "00_governance/claude/manifest.json",
    ".git/config",
    "some/dir/.git/HEAD",
  ];
  const allowed = [
    "01_modules/ide/spec.md",
    "00_governance/contracts/example.md",
    "vault/claude/notes.md",
  ];

  it("blocks constitution, IP/legal, manifest, and .git paths", () => {
    for (const p of denied) {
      assert.ok(
        WRITE_PATH_DENYLIST.some((re) => re.test(p)),
        `expected denylist to block ${p}`
      );
    }
  });

  it("does not block ordinary content paths", () => {
    for (const p of allowed) {
      assert.ok(
        !WRITE_PATH_DENYLIST.some((re) => re.test(p)),
        `expected denylist to allow ${p}`
      );
    }
  });
});

describe("modelSegmentFromPath", () => {
  it("extracts the model segment from model-owned roots", () => {
    assert.equal(modelSegmentFromPath("vault/claude/notes.md"), "claude");
    assert.equal(modelSegmentFromPath("runtime/grok/state.json"), "grok");
    assert.equal(modelSegmentFromPath("00_governance/gemini/log.md"), "gemini");
  });

  it("is case-insensitive and tolerates a leading slash", () => {
    assert.equal(modelSegmentFromPath("/vault/Claude/x.md"), "claude");
  });

  it("returns undefined for governance-owned and ordinary paths", () => {
    assert.equal(modelSegmentFromPath("00_governance/contracts/x.md"), undefined);
    assert.equal(modelSegmentFromPath("00_governance/operator_manual/x.md"), undefined);
    assert.equal(modelSegmentFromPath("01_modules/ide/spec.md"), undefined);
  });
});

describe("vaultWriteService agent branch mapping", () => {
  it("recognises exactly the four governed agents", () => {
    for (const a of ["chatgpt", "claude", "grok", "gemini"]) {
      assert.equal(isValidAgent(a), true, a);
    }
    for (const a of ["copilot", "muse", "operator", ""]) {
      assert.equal(isValidAgent(a), false, a || "(empty)");
    }
  });

  it("maps every agent to its own branch", () => {
    for (const [agent, branch] of Object.entries(AGENT_BRANCH_MAP)) {
      assert.equal(branchForAgent(agent), branch);
    }
  });

  it("throws on an unknown agent instead of guessing a branch", () => {
    assert.throws(() => branchForAgent("copilot"), /Unknown agent/);
  });
});
