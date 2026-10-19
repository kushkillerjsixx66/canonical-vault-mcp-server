import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`../contracts/${name}`, import.meta.url));

const requestSchema = JSON.parse(
  readFileSync(fixturePath("lattice-governance-request-v1.schema.json"), "utf8")
);
const decisionSchema = JSON.parse(
  readFileSync(fixturePath("lattice-governance-decision-v1.schema.json"), "utf8")
);
const vectors = JSON.parse(
  readFileSync(fixturePath("digest-golden-vectors-v1.json"), "utf8")
);

function sortedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(sortedJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${sortedJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

test("gateway DTO schemas are strict and versioned proposal artifacts", () => {
  assert.equal(requestSchema.properties.schema_version.const, "lattice.governance.request/1");
  assert.equal(decisionSchema.properties.schema_version.const, "lattice.governance.decision/1");
  assert.equal(requestSchema.additionalProperties, false);
  assert.equal(decisionSchema.additionalProperties, false);
  assert.equal("canonical_revision" in requestSchema.properties, false);
  assert.equal("authority_graph_blob_sha" in requestSchema.properties, false);
  assert.equal("authenticated_principal" in requestSchema.properties, false);
});

test("digest golden vectors match their declared canonical bytes and SHA-256", () => {
  assert.equal(vectors.canonicalization.encoding, "UTF-8");
  assert.equal(vectors.canonicalization.digest, "SHA-256 over exact JCS bytes");
  assert.ok(vectors.vectors.length >= 3);

  for (const vector of vectors.vectors) {
    assert.equal(sortedJson(vector.input), vector.canonical_json, vector.name);
    const actual = createHash("sha256").update(vector.canonical_json, "utf8").digest("hex");
    assert.equal(`sha256:${actual}`, vector.sha256, vector.name);
  }
});
