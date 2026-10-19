import { createHash } from "node:crypto";

/**
 * Versioned gateway digest primitive.
 *
 * This implementation targets JSON values already parsed by JavaScript. It
 * cannot detect duplicate keys in source JSON; callers must use a
 * duplicate-aware parser before constructing an object. Do not use this helper
 * to reinterpret legacy Canonical Vault hashes.
 */
export const GATEWAY_DIGEST_VERSION = "jcs-sha256-v1" as const;

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

export function canonicalizeGatewayJsonV1(value: unknown, ancestors = new Set<object>()): string {
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
    // Sparse arrays and custom array properties are not JSON data models.
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== value.length + 1 || ownKeys.some((key) =>
      key !== "length" && (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)
    )) {
      throw new TypeError("JCS_NON_JSON_ARRAY");
    }
    for (let i = 0; i < value.length; i += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, i)) throw new TypeError("JCS_SPARSE_ARRAY");
    }
    ancestors.add(value);
    try {
      return `[${value.map((item) => canonicalizeGatewayJsonV1(item, ancestors)).join(",")}]`;
    } finally {
      ancestors.delete(value);
    }
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (ancestors.has(record)) throw new TypeError("JCS_CIRCULAR_VALUE");
    const prototype = Object.getPrototypeOf(record);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("JCS_NON_JSON_OBJECT");
    }
    ancestors.add(record);
    try {
      const ownKeys = Reflect.ownKeys(record);
      if (ownKeys.some((key) => typeof key !== "string")) throw new TypeError("JCS_SYMBOL_KEY");
      const keys = ownKeys as string[];
      for (const key of keys) {
        assertUnicodeScalarString(key);
        const descriptor = Object.getOwnPropertyDescriptor(record, key);
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
          throw new TypeError("JCS_NON_JSON_PROPERTY");
        }
        if (descriptor.value === undefined) throw new TypeError("JCS_UNDEFINED_VALUE");
      }
      // ECMAScript's default sort compares UTF-16 code units, matching JCS.
      keys.sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalizeGatewayJsonV1(record[key], ancestors)}`).join(",")}}`;
    } finally {
      ancestors.delete(record);
    }
  }
  throw new TypeError("JCS_UNSUPPORTED_VALUE");
}

export function gatewayDigestV1(value: unknown): string {
  const canonical = canonicalizeGatewayJsonV1(value);
  return `${GATEWAY_DIGEST_VERSION}:sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}
