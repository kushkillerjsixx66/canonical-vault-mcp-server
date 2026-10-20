# Gateway Contract DTOs and Digest Rules

**Status: PROPOSAL ONLY.** These schemas and vectors are design artifacts. They are not canonical law, a deployed endpoint, a verified identity source, or permission to execute a write.

## Files

- `lattice-governance-request-v1.schema.json`: strict proposal request DTO.
- `lattice-governance-decision-v1.schema.json`: strict decision response DTO.
- `digest-golden-vectors-v1.json`: cross-language canonicalization/hash fixtures.

## Trust and authority rules

1. The request schema deliberately has no caller-controlled canonical revision, authority-graph blob SHA, authenticated principal, role, delegated authority, or `verified` flag. Those are trusted-runtime outputs/configuration, not caller assertions.
2. The gateway must load canonical revision and authority-graph blob SHA from trusted deployment configuration and independently resolve/verify the pinned bytes. The decision must report the snapshot actually used.
3. A syntactically valid `ALLOW` is not sufficient. Until a service-authentication protocol is selected and implemented, the decision body is unauthenticated data and must never authorize a write.
4. The runtime's current decision model does not itself establish decision expiry, replay protection, response authentication, or an external GitHub effect receipt. The transport adapter must not pretend these are already provided.
5. The initial operation constant is limited to `repository.file.propose`. PR creation needs a separately defined operation/effect contract. Merge, direct canonical writes, and deployment are outside scope.
6. These schemas describe transport DTOs only. They do not resolve the independent operator identity/trust-source gap, grant authority, or reconcile canonical G1-G3 with operator G1-G6.

## Canonical digest contract (proposed)

- Canonicalize JSON with RFC 8785 JSON Canonicalization Scheme (JCS).
- Hash the exact canonical UTF-8 bytes with SHA-256.
- Render as `sha256:` followed by 64 lowercase hexadecimal characters.
- Reject duplicate object keys before canonicalization; reject invalid Unicode and non-finite numbers.
- Do not normalize Unicode, reorder arrays, hash pretty-printed JSON, or use language-native object stringification.
- For a target digest, hash the target object only. For an operation digest, hash the operation object only. For a request digest, hash the complete request object as received after strict schema validation, excluding no fields.
- Content digest hashes the exact UTF-8 bytes of the proposed file content, not a JSON wrapper around the content. If binary payloads are ever supported, define a new explicit contract rather than silently reusing this one.

The fixtures include small deterministic vectors. They are not enough to prove full RFC 8785 conformance. Before implementation, both TypeScript and Python must run the same fixtures through independently reviewed JCS implementations and add vectors covering escaped strings, Unicode, arrays, nulls, and numeric edge cases. Numeric fields should be avoided in security bindings unless they are necessary.

## Required adapter behavior before any integration

- Strictly validate schema version and reject unknown fields.
- Derive the principal only from authenticated service transport and independently validated identity context.
- Verify request expiry, idempotency/replay state, canonical pins, and all request/decision digest bindings.
- Map only a current, authenticated, exact-request-bound runtime allow to a gateway `ALLOW`; all missing, stale, conflicting, unknown, unavailable, or unmappable states block.
- Ensure authorization and the external effect are one gateway-owned operation, or provide a separately reviewed design that closes the time-of-check/time-of-use gap. Do not authorize in one service and then let the MCP server independently write.
- Test the actual MCP handler and production-composed effect adapter. Every blocked/indeterminate case must assert zero GitHub mutation-sink calls.
- Do not add credentials, wire the runtime, merge, deploy, or claim enforcement on the strength of schema validation alone.
