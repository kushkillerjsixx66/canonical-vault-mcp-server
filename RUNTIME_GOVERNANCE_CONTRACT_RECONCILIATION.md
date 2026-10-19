# Runtime Governance Contract Reconciliation

**Status:** RECONCILIATION FINDING — PROPOSAL ONLY  
**Branch:** `chatgpt-governance-gateway-contract`  
**Scope:** Source-level comparison of the MCP gateway proposal with the Python runtime contracts on Canonical Vault `chatgpt`.  
**Authority:** This document grants no execution, identity, merge, deployment, or canonical mutation authority.

## 1. Finding

The TypeScript request/decision envelope proposed in `RUNTIME_GOVERNANCE_INTEGRATION_CONTRACT.md` is not a direct serialization of the current Python runtime model. It must be treated as a separate transport contract with an explicit, tested adapter. Do not implement a field-for-field JSON translation and assume the result is authorized.

The source review covers:

- `05_runtime/governance/contracts.py`
- `05_runtime/governance/boundary.py`
- `05_runtime/governance/runtime_factory.py`
- `05_runtime/governance/github_canonical_authority_provider.py`
- MCP `src/tools/vault-write.ts` and `src/server.ts`

This is source inspection, not a live test or deployment verification.

## 2. Current Python contract versus proposed wire contract

| Concern | Python runtime contract | Proposed gateway wire contract | Reconciliation requirement |
|---|---|---|---|
| Request identity | `GovernedRequest.request_id` | `request_id`, expiry, idempotency key | Gateway must enforce uniqueness/replay policy; Python model does not itself provide a complete HTTP replay protocol. |
| Caller identity | `ValidatedOperatorContext` nested in request | Authenticated transport principal resolved by gateway | Never deserialize a caller-provided identity/role/verified flag as trusted context. The runtime boundary requires an injected independent `operator_context_validator` for mutation. |
| Intent and scope | `ValidatedIntent.kind/scope/nonce/issued_at` | `operation.kind/target/scope/effect` | Adapter must construct intent from the authenticated request and canonicalized target/effect. Caller scope is a claim until validated. |
| Payload/content binding | `input_payload`, `payload_hash`, `artifact_hash` | Content/effect digest and request/operation/target digests | Define one canonical serialization and digest format across TypeScript and Python; test cross-language golden vectors. Do not assume their current hash helpers are interchangeable without tests. |
| Canonical revision | Optional `GovernedRequest.canonical_revision`; runtime factory pins `LATTICE_CANONICAL_REVISION` | Trusted deployment pin | Runtime deployment pin must remain authoritative. Request body cannot override it; a mismatch must block. |
| Authority graph integrity | Resolver verifies pinned commit revision and authority-graph Git blob SHA from deployment configuration | Decision binds revision and graph blob SHA | Gateway must expose the verified snapshot metadata and ensure the decision is bound to the same snapshot. Python's public `GovernanceDecision` fields do not expose a dedicated authority-graph blob SHA field. |
| Decision | `GovernanceDecision.decision`, gate results, reasons, evidence refs, evaluator versions, decision hash, timestamp | `allow/block/indeterminate`, request digest, binding, expiry, reason code | Define an explicit mapping. Only a current, independently verified `ALLOW` bound to the exact request can map to wire `allow`; every unknown or unmappable state must fail closed. |
| Lineage | `LineageEvent` binds request/intent/transition/decision/artifact hashes | Decision/effect receipt references lineage | Gateway must preserve and return the runtime lineage identifiers and separately record the external GitHub effect receipt. Runtime lineage alone does not prove a GitHub side effect occurred. |
| External side effect | `GovernanceBoundary` delegates persistence to its configured Vault and returns a `CommitReceipt` | GitHub contents write / PR creation | The current Python persistence path is not a GitHub write adapter. A separately specified, narrow effect adapter is required; do not equate a successful CanonicalVault transition with a successful GitHub operation. |

## 3. Enforcement constraints established by source review

1. `GovernanceBoundary.execute()` fails closed for mutating actions when no independent operator-context validator is configured.
2. Authentication is distinct from transition authority. Mutation also requires a supplied delegated-authority object and an independently trusted transition-authority validator.
3. The runtime factory accepts the canonical commit SHA and authority-graph blob SHA from deployment configuration and rejects partial/malformed pins.
4. The GitHub authority provider checks the requested immutable commit, expected authority graph path, Git blob SHA, returned bytes, and parsed graph shape.
5. The current MCP server's `vault_propose_change` handler performs its own GitHub content SHA lookup and write. The MCP entry point does not invoke the Python `GovernanceBoundary`.
6. Branch allowlists and path restrictions constrain where the MCP tool can write; they are not a substitute for an authenticated, request-bound runtime decision.

These are code-level observations. They do not establish that production pins, authenticators, validators, or a gateway are configured or deployed.

## 4. Blocking mismatches before implementation

- **No wire DTO exists in the Python runtime.** Define a versioned gateway request and decision schema plus strict validation.
- **No cross-language digest contract exists.** Specify canonical JSON rules, UTF-8 encoding, digest prefixes, null/array handling, and golden test vectors.
- **No decision authenticity protocol exists between MCP and gateway.** Select authenticated service transport and authenticated response handling before coding; unsigned JSON must never authorize a write.
- **No exact GitHub effect handler exists in the Python boundary.** Define the narrow effect adapter and its preconditions, idempotency behavior, result receipt, and failure recovery.
- **No atomic authorization-plus-effect boundary exists.** An authorization-only HTTP response followed by an independent MCP-side GitHub write leaves a time-of-check/time-of-use gap. Prefer a gateway that owns the GitHub write credential and performs the effect after revalidation, or provide an equivalent atomic/preconditioned design.
- **No verified external operator identity binding is established.** Do not treat JRM-01 labels, GitHub write access, an MCP tool call, or a proof-of-possession result alone as verified operator identity or transition authority.
- **The canonical gate definitions require reconciliation.** The Python decision schema exposes G1-G3; the operator-side G1-G6 model must not be silently substituted into the wire contract.

## 5. Minimum contract tests

Before implementing a production client, add shared test vectors and prove:

1. TypeScript and Python calculate identical request, target, effect, and content digests for the same canonical input.
2. Caller-supplied identity, authority, canonical revision, graph blob SHA, or verified flags cannot override trusted transport/deployment context.
3. Missing pins, mismatched revision/blob SHA, provider failure, invalid decision authentication, expiry, replay, and unknown decision state block.
4. A decision bound to one request, path, branch, content digest, or operation cannot authorize a changed one.
5. Blocked/indeterminate/stale decisions cause zero GitHub read-for-write and zero write/PR sink calls.
6. A valid decision permits only the exact configured noncanonical proposal operation; it cannot authorize main writes, merges, deployments, or another effect.
7. A GitHub failure after authorization is reported as failure with correlated lineage, never as success; retries do not duplicate an effect.
8. Tests exercise the actual MCP tool handler and the same effect adapter used by production composition, not only isolated validators.

## 6. Next governed step

Treat this reconciliation as Gate A input, not as Gate A approval. Review the field mapping and unresolved design decisions, then define the versioned DTO and cross-language digest vectors. Do not wire the MCP server to the runtime, add production credentials, enable a fallback path, merge, or deploy until the trust source, effect ownership, and end-to-end negative tests are independently reviewed.

The trust-source gap remains unresolved. Proposal capability remains distinct from execution authority, and merge authority remains human-controlled.

## 7. Concrete digest mismatch found during implementation review

The current Python `sha256_digest` helper in `05_runtime/governance/contracts.py` is **not** an RFC 8785/JCS implementation:

- For strings and bytes, it hashes the raw UTF-8/string bytes directly.
- For other values, it uses Python `json.dumps(value, sort_keys=True, separators=(",", ":"))`, whose default `ensure_ascii=True` behavior escapes non-ASCII characters.
- It returns bare lowercase hexadecimal, without the proposed `sha256:` prefix.
- `GovernedRequest.payload_hash`, `GovernedRequest.artifact_hash`, and `GovernanceDecision.decision_hash` have different input shapes and must not be treated as interchangeable gateway request/operation/content digests.

The shared three-vector fixture currently covers only simple ASCII objects. Matching those hashes does not prove that the current Python helper and an RFC 8785 implementation agree for Unicode, numeric edge cases, or all JSON values. The TypeScript test helper is also a narrow fixture serializer, not a full JCS implementation.

**Required disposition:** preserve existing runtime hash semantics until a separately reviewed change authorizes and tests a migration. Implement the gateway's wire digest using independently reviewed JCS libraries on both sides, or define a versioned adapter that explicitly preserves the current runtime hash as a separate field. Do not relabel an existing `decision_hash` or `payload_hash` as a JCS request digest. Add non-ASCII and escaped-string vectors before claiming cross-language conformance.
