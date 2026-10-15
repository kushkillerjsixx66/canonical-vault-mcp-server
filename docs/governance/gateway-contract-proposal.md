# Governance Gateway Contract (Proposal)

**Status:** Design proposal only. Not canonical law, not ratified, not runtime enforcement.
**Scope:** Define the minimum contract between the TypeScript MCP server and a separately deployed Lattice governance service before implementation.
**Authority:** This document grants no authority to any caller, model, service, or operator.

## 1. Decision

The MCP server currently enforces repository write-scope rules locally. It does not call the Python `GovernanceBoundary`. Therefore, local branch/path checks must not be represented as a Lattice authorization decision.

For consequential repository writes, the target architecture is:

`MCP tool -> local syntactic/scope checks -> authenticated governance decision -> request-bound decision verification -> immediate write sink`

The governance service evaluates policy; it does not perform the GitHub mutation. The MCP server retains the proposal-only capability. Opening a PR is not merging it. No gateway response can authorize a direct canonical-branch write, a merge, deployment, or a different operation than the one evaluated.

Canonical reads remain read operations unless they trigger a consequential side effect. This contract does not claim that read requests are currently governed by the Python runtime.

## 2. Trust boundaries

- **MCP caller:** Untrusted request source. A supplied `actor`, `operator_id`, `role`, or `authority` field is a claim, not proof.
- **MCP service identity:** Must be authenticated by a mechanism verified by the gateway, such as mTLS or a short-lived service credential. The concrete mechanism and key lifecycle must be selected before implementation.
- **Governance service:** Must resolve actor and authority from trusted configuration/evidence. It must not infer authority from tool availability, GitHub write-token possession, branch membership, prior allow decisions, or a self-asserted identity.
- **Canonical evidence:** Must be pinned to an exact canonical revision and exact authority-graph blob SHA. Missing, stale, conflicting, unavailable, or unverifiable evidence produces no allow.
- **GitHub write adapter:** Side-effect boundary. No GitHub contents lookup or write request may occur before a matching current allow decision has been verified.

No secret, bearer token, private key, or raw identity document belongs in the request body, logs, decision evidence, or repository.

## 3. Request envelope

The following is a logical schema, not a finalized wire format:

```json
{
  "schema_version": "lattice.governance.request/1",
  "request_id": "unique-random-id",
  "issued_at": "RFC3339 timestamp",
  "expires_at": "RFC3339 timestamp",
  "operation": {
    "kind": "repository.file.propose",
    "target": {
      "repository": "owner/repository",
      "branch": "non-canonical branch",
      "path": "relative/repository/path"
    },
    "scope": ["exact target and permitted operation"],
    "effect": {
      "kind": "create_or_update_file",
      "content_digest": "sha256:..."
    },
    "reversibility": "explicitly assessed"
  },
  "canonical_evidence": {
    "revision": "verified commit SHA",
    "authority_graph_blob_sha": "verified blob SHA"
  },
  "lineage": {
    "parent_event_id": "optional prior event",
    "caller_trace_id": "opaque correlation identifier"
  }
}
```

Rules:

1. Identity used for authorization comes from authenticated transport and trusted gateway resolution, not a caller-controlled request field.
2. The gateway must bind the authenticated principal, full operation tuple, target, scope, effect digest, request ID, expiry, canonical revision, and authority-graph blob SHA into its decision.
3. The client must not choose which authority graph or policy is trusted. It may state the expected pin; the gateway independently resolves and verifies it.
4. Content is not sent to the gateway unless required by the evaluator. A digest is the minimum binding for the exact proposed content.
5. The service must reject expired requests, malformed envelopes, duplicate/replayed request IDs where replay could cause ambiguity, and unsupported schema versions.

## 4. Decision envelope

```json
{
  "schema_version": "lattice.governance.decision/1",
  "request_id": "same-request-id",
  "request_digest": "sha256:canonicalized-request",
  "decision_id": "unique-decision-id",
  "outcome": "allow | block | indeterminate",
  "issued_at": "RFC3339 timestamp",
  "expires_at": "RFC3339 timestamp",
  "binding": {
    "authenticated_principal": "gateway-resolved-principal",
    "operation_digest": "sha256:...",
    "target_digest": "sha256:...",
    "canonical_revision": "verified commit SHA",
    "authority_graph_blob_sha": "verified blob SHA"
  },
  "evidence": [
    {
      "evidence_id": "stable-reference",
      "result": "verified | rejected | unavailable"
    }
  ],
  "constraints": ["explicit restrictions"],
  "reason_code": "stable-machine-readable-code"
}
```

This example defines required semantics, not a cryptographic serialization. Production responses must be integrity-protected and authenticated; unsigned JSON alone is not an authorization artifact.

The MCP server may proceed only when all of these are true:

- outcome is exactly `allow`;
- the response authenticates to the configured governance service;
- request ID and request digest match the exact request sent;
- operation, target, effect/content digest, authenticated principal and scope match;
- canonical revision and authority-graph blob SHA match independently verified current pins;
- decision has not expired or been revoked;
- no required evidence is missing, stale, conflicting, or indeterminate;
- all constraints are satisfiable by the pending operation.

A mismatched, malformed, unauthenticated, stale, replayed, or unknown decision is a block, not a warning.

## 5. Execution ordering and time-of-check/time-of-use

The gateway decision must be bound to the exact effect. The MCP server must verify the decision immediately before crossing the side-effect boundary.

No GitHub read used to prepare a mutation (including retrieving the existing file SHA) may occur before authorization if that read is part of the mutation transaction. If the gateway protocol requires a preflight read, the design must explicitly classify it as non-mutating and prevent it from being mistaken for authorization.

Between authorization and mutation:
- do not alter branch, path, content, repository, operation kind, or effect digest;
- do not silently refresh canonical evidence and reuse the old decision;
- do not treat retries as a new authorized operation;
- if the decision expires or the relevant canonical pin changes, stop and request a new decision.

A GitHub API may still fail after an allow decision. That is an execution failure, not grounds to fabricate success or silently widen scope.

## 6. Failure behavior

| Condition | Required behavior |
|---|---|
| Gateway timeout, outage, DNS/TLS/authentication failure | Block; no write sink call |
| Missing/unknown authority | Block |
| Canonical revision unavailable or stale | Block |
| Authority graph SHA mismatch | Block |
| Conflicting evidence or evaluator error | Block or indeterminate; never allow |
| Decision expired, replayed, malformed, or wrong request binding | Block |
| Decision says allow but target/effect differs | Block |
| GitHub write fails after valid allow | Report execution failure with lineage; do not claim mutation succeeded |

No fallback to local branch checks, cached allow decisions, caller identity, or “best effort” authorization is permitted.

## 7. Minimum integration tests

Tests must exercise the actual MCP-to-gateway adapter and the same write adapter used by `vault_propose_change`, not only isolated evaluator functions.

1. No configured gateway: write sink called zero times.
2. Missing/invalid service credential: zero calls.
3. Gateway timeout/outage: zero calls.
4. Gateway block or indeterminate: zero calls.
5. Unknown actor/authority: zero calls.
6. Stale canonical revision: zero calls.
7. Authority-graph blob SHA mismatch: zero calls.
8. Decision request digest mismatch: zero calls.
9. Decision target/scope/effect mismatch: zero calls.
10. Expired/replayed decision: zero calls.
11. Content changed after decision: zero calls.
12. Valid, authenticated, current and exactly bound allow: one intended write sequence only.
13. GitHub SHA lookup or write fails after allow: return failure; do not report success.
14. Gateway allow for file proposal cannot authorize PR merge, direct canonical write, deployment, or another action.
15. Telemetry contains decision ID, request ID, pinned revision and stable reason code, but no secrets or raw identity documents.

Tests must assert sink call counts, not merely expected error text.

## 8. Rollout gates

**Gate A — Contract:** Review this proposal against the canonical Python request/decision models and authority resolver. Resolve schema differences before coding.

**Gate B — Authenticated adapter:** Implement the selected service authentication, canonical pin resolution, response integrity, expiry and replay rules.

**Gate C — Sink integration:** Route every governed write path through one gateway-verification boundary. Preserve local branch/path checks as additional constraints, never as substitutes for authorization.

**Gate D — Adversarial integration tests:** Prove all negative cases above block before any GitHub side effect.

**Gate E — Deployment evidence:** Verify deployed configuration without exposing secrets, inspect the actual deployed request path, and run a live smoke test with a controlled non-canonical proposal target. Until then, production enforcement remains unverified.

No gate is passed by documentation alone. No merge, deployment, canonical mutation, operator identity verification, or authority grant is implied by this proposal.
