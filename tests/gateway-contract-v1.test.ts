import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalizeGatewayJsonV1, gatewayDigestV1, GATEWAY_DIGEST_VERSION } from "../src/governance/jcs-digest-v1.js";

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
    assert.equal(canonicalizeGatewayJsonV1(vector.input), vector.canonical_json, vector.name);
    const actual = gatewayDigestV1(vector.input);
    assert.equal(actual, `jcs-sha256-v1:${vector.sha256}`, vector.name);
  }
});

test("canonicalizer rejects values JSON cannot safely represent as JCS", () => {
  assert.throws(() => canonicalizeGatewayJsonV1(Number.NaN), /JCS_NON_FINITE_NUMBER/);
  assert.throws(() => canonicalizeGatewayJsonV1(Number.POSITIVE_INFINITY), /JCS_NON_FINITE_NUMBER/);
  assert.throws(() => canonicalizeGatewayJsonV1("\ud800"), /JCS_INVALID_UNICODE/);
  assert.throws(() => canonicalizeGatewayJsonV1({ value: undefined }), /JCS_UNDEFINED_VALUE/);
  assert.throws(() => canonicalizeGatewayJsonV1(1n), /JCS_UNSUPPORTED_VALUE/);
});

test("canonicalizer preserves array order and does not normalize Unicode", () => {
  assert.equal(canonicalizeGatewayJsonV1({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(canonicalizeGatewayJsonV1([2, 1]), "[2,1]");
  assert.notEqual(canonicalizeGatewayJsonV1("é"), canonicalizeGatewayJsonV1("e\u0301"));
});

test("canonicalizer uses ECMAScript number serialization and UTF-16 key ordering", () => {
  assert.equal(canonicalizeGatewayJsonV1(1e-7), "1e-7");
  assert.equal(canonicalizeGatewayJsonV1(-0), "0");
  assert.equal(canonicalizeGatewayJsonV1({ "\ue000": 1, "𐀀": 2 }), '{"𐀀":2,"\ue000":1}');
});

test("versioned gateway digest is explicitly namespaced and deterministic", () => {
  const value = { b: 2, a: 1 };
  assert.equal(GATEWAY_DIGEST_VERSION, "jcs-sha256-v1");
  assert.equal(gatewayDigestV1(value), gatewayDigestV1({ a: 1, b: 2 }));
  assert.match(gatewayDigestV1(value), /^jcs-sha256-v1:sha256:[0-9a-f]{64}$/);
});
