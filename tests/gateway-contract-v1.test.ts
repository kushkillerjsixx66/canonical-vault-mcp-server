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

function assertUnicodeScalarString(value: string): void {
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError("JCS_INVALID_UNICODE");
      }
      i += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError("JCS_INVALID_UNICODE");
    }
  }
}

/**
 * Test-only JCS subset for JSON values already parsed into JavaScript.
 * This does not detect duplicate keys in source JSON; that must be enforced
 * by a duplicate-aware parser before JSON.parse at any untrusted boundary.
 */
function canonicalizeJson(value: unknown, ancestors = new Set<object>()): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    assertUnicodeScalarString(value);
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("JCS_NON_FINITE_NUMBER");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError("JCS_CIRCULAR_VALUE");
    ancestors.add(value);
    try {
      return `[${value.map((item) => canonicalizeJson(item, ancestors)).join(",")}]`;
    } finally {
      ancestors.delete(value);
    }
  }
  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if (ancestors.has(objectValue)) throw new TypeError("JCS_CIRCULAR_VALUE");
    const prototype = Object.getPrototypeOf(objectValue);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("JCS_NON_JSON_OBJECT");
    }
    ancestors.add(objectValue);
    try {
      const keys = Object.keys(objectValue);
      for (const key of keys) {
        assertUnicodeScalarString(key);
        if (objectValue[key] === undefined) throw new TypeError("JCS_UNDEFINED_VALUE");
      }
      // Default JS sort compares UTF-16 code units, as required by RFC 8785.
      keys.sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalizeJson(objectValue[key], ancestors)}`).join(",")}}`;
    } finally {
      ancestors.delete(objectValue);
    }
  }
  throw new TypeError("JCS_UNSUPPORTED_VALUE");
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

  const requestVector = vectors.vectors.find(
    (vector: { name: string }) => vector.name === "request-minimal"
  );
  assert.ok(requestVector);
  assert.ok(
    requestVector.input.request_id.length >= requestSchema.properties.request_id.minLength
  );

  for (const vector of vectors.vectors) {
    assert.equal(canonicalizeJson(vector.input), vector.canonical_json, vector.name);
    const actual = createHash("sha256").update(vector.canonical_json, "utf8").digest("hex");
    assert.equal(`sha256:${actual}`, vector.sha256, vector.name);
  }
});

test("canonicalizer rejects values JSON cannot safely represent as JCS", () => {
  assert.throws(() => canonicalizeJson(Number.NaN), /JCS_NON_FINITE_NUMBER/);
  assert.throws(() => canonicalizeJson(Number.POSITIVE_INFINITY), /JCS_NON_FINITE_NUMBER/);
  assert.throws(() => canonicalizeJson("\ud800"), /JCS_INVALID_UNICODE/);
  assert.throws(() => canonicalizeJson({ value: undefined }), /JCS_UNDEFINED_VALUE/);
  assert.throws(() => canonicalizeJson(1n), /JCS_UNSUPPORTED_VALUE/);
});

test("canonicalizer preserves array order and does not normalize Unicode", () => {
  assert.equal(canonicalizeJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(canonicalizeJson([2, 1]), "[2,1]");
  assert.notEqual(canonicalizeJson("é"), canonicalizeJson("e\u0301"));
});

test("canonicalizer uses ECMAScript number serialization and UTF-16 key ordering", () => {
  assert.equal(canonicalizeJson(1e-7), "1e-7");
  assert.equal(canonicalizeJson(-0), "0");
  assert.equal(canonicalizeJson({ "\ue000": 1, "𐀀": 2 }), '{"𐀀":2,"\ue000":1}');
});
