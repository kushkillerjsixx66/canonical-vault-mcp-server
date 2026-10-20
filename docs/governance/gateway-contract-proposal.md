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


## 9. Reconciliation against the existing Python runtime (required before implementation)

A source review of Canonical Vault `main` found that this proposal is **not yet wire-compatible** with the existing Python modules. This section records the differences so nobody accidentally treats the illustrative envelope above as an implemented schema.

Reviewed sources:
- `05_runtime/gateway/proposal_contract.py` at canonical-vault main commit `efb4cb9e572ef0c1b63d03d5fbfb6d6562deb3b1`
- `05_runtime/governance/contracts.py` at the same revision
- `05_runtime/governance/canonical_binding_resolver.py` and `github_canonical_authority_provider.py` at the same revision
- `05_runtime/governance/boundary.py` and `runtime_factory.py` at the same revision

### Existing request contract

`validate_proposal_request` accepts only the top-level fields `request_id`, `operation`, `target`, `scope`, `effect`, `transition`, and `idempotency_key`. Its supported operation values are `propose_change` and `open_pull_request`. Target fields are `repository`, `head`, `base`, and `paths`. Transition fields are `expected_head_sha`, `proposed_content_sha256`, `trigger`, `constraints`, and `reversibility`.

It expressly rejects caller-supplied trusted-only fields including `operator_id`, `caller_identity`, `canonical_revision`, `expected_canonical_revision`, `authority_graph_blob_sha`, `canonical_authority`, `ratified`, and `authorized`. Therefore, the canonical revision and authority-graph blob SHA shown in the illustrative section 3 envelope must **not** be copied into the untrusted proposal payload. They must be resolved from gateway deployment configuration and verified by the runtime resolver.

### Existing runtime decision model

The Python `GovernedRequest` carries a `ValidatedOperatorContext`, `ValidatedIntent`, payload, source references, action, runtime/policy versions and optional canonical revision/governance fingerprint. `GovernanceDecision` uses explicit outcomes such as `ALLOW`, `BLOCK`, `SILENCE`, `ABSTAIN`, `CONSTRAIN`, `UNRESOLVED`, `STALE`, `REVALIDATE`, `FAILED` and `AUDIT_MISMATCH`. An adapter must map these conservatively: only exact `ALLOW` may be eligible for further sink-boundary checks. Every other outcome blocks.

The canonical binding resolver reads revision and authority-graph blob SHA from deployment-pinned configuration, independently fetches the authority graph at that revision, and checks both revision and blob SHA. The `GovernanceBoundary` also performs canonical-state drift checks around evaluation and has lineage/quarantine sinks. These are useful runtime primitives, but they are not by themselves a deployed HTTP API or authenticated MCP integration.

### Remaining compatibility and trust gaps

- No deployed authenticated request/decision API contract was found in the reviewed files.
- `proposal_contract.py` validates shape and computes a request digest; its own module documentation says it authenticates no caller, resolves no authority, authorizes no transition, and performs no external effect.
- The Python `GovernanceDecision.decision_hash` is a digest of decision summary data, not a service-response signature or proof of response origin.
- The reviewed decision dataclass has a timestamp but no explicit decision expiry, signed response, authenticated caller binding, or general replay store. The gateway must add or securely wrap these semantics before a response can authorize an external GitHub sink.
- The `ValidatedOperatorContext` type includes `verified=True` as a default field. A service adapter must construct this context only after actual trusted authentication/verification; the default value must never be treated as evidence that authentication happened.
- The resolver's pinning verifies a configured immutable revision and blob SHA. It does not independently prove that the deployment pin is current or ratified; freshness and pin-update governance remain separate requirements.
- The proposal's transport envelope, timestamps, and response binding remain a design layer to reconcile with the Python types. Do not add trusted-only fields to `validate_proposal_request` merely to make the examples fit.

### Required next implementation step

Before writing the network adapter, define and test a narrow mapping from the validated MCP proposal into `GovernedRequest`, including a trusted principal/credential resolution step that does not infer `JRM-01` from a caller string. Define a versioned response wrapper around `GovernanceDecision` that authenticates the service origin and binds the decision hash to the exact proposal digest, canonical revision, authority-graph blob SHA, request ID, expiry and one-time/idempotent execution key. If any required binding cannot be verified, the TypeScript write sink remains unreachable.

This reconciliation is based on repository source review only. It does not establish production configuration, a deployed endpoint, identity proofing, or authorization to execute.
