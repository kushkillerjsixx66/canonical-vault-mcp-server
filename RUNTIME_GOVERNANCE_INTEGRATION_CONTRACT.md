# Proposed Lattice Runtime Governance Integration Contract

Status: **PROPOSED — NOT IMPLEMENTED**

This document defines a candidate trust boundary for integrating the TypeScript MCP server with the separately maintained Python Lattice governance runtime. It does not claim that the current MCP endpoint enforces Lattice governance, and it does not authorize a production deployment or environment change.

## 1. Current state

The MCP server runs as a TypeScript/Vercel application. The Lattice governance engine and revision-pinned canonical authority resolver live in the Python `canonical-vault` repository. The MCP entry point does not currently invoke that Python runtime.

Existing MCP controls remain useful but are not equivalent to a runtime authorization decision: repository scope, source-branch allowlists, deployment branch locks, path restrictions, canonical-target PR validation, and human-only merge authority.

## 2. Candidate architecture

Use a separately deployed, authenticated **governed execution gateway** as the sole owner of any GitHub write credential used for governed operations.

The MCP server submits a complete proposal to the gateway. The gateway retrieves and verifies the canonical authority snapshot, evaluates the transition using the Lattice runtime, revalidates authority and drift immediately before the effect, and only then performs the narrowly scoped GitHub operation. The gateway returns a lineage-bearing decision and effect receipt.

This is a proposal, not a selected or deployed architecture. Embedding Python into the TypeScript/Vercel process is not assumed. A remote authorization-only call followed by an independent MCP-side GitHub write is not sufficient by itself because it creates a time-of-check/time-of-use gap between authorization and effect.

## 3. Request contract

The gateway must derive caller identity from authenticated transport credentials, not from a caller-supplied identity string. The body must describe the requested transition explicitly:

- `request_id`: unique request identifier for correlation and replay handling.
- `operation`: allowlisted operation identifier, initially limited to creating a proposal/PR; never merge.
- `target`: repository owner/name, source branch, canonical destination branch, and any target path(s).
- `scope`: exact resources and permitted operation boundaries.
- `effect`: precise intended GitHub side effect, including whether file content is proposed or a PR is opened.
- `transition`: pre-state or expected head SHA, proposed state/content digest, trigger, constraints, and reversibility classification.
- `expected_canonical_revision`: full commit SHA required by deployment policy; never `main` or a mutable ref as a revision pin.
- `idempotency_key`: stable key to prevent retries from duplicating the same external effect.

Missing or ambiguous target, scope, effect, proposed state, or required authority evidence must be rejected before the mutation sink.

## 4. Canonical authority and decision contract

The gateway must resolve canonical authority from a trusted provider and verify both the expected canonical commit revision and authority-graph blob SHA. The caller must not be able to supply a binding and self-declare it ratified.

A decision record must include:

- request ID and authenticated principal/credential identity;
- allow/block verdict and stable reason code;
- canonical commit revision and verified authority-graph blob SHA;
- transition/target/scope/effect digest;
- lineage and evidence references;
- evaluation timestamp and policy/runtime version;
- final external effect result, if any, including GitHub object/commit identifiers.

An allow verdict is valid only for the exact request digest, target, effect, and canonical snapshot evaluated. It must not be reusable for another operation. An evaluation record alone is not an execution capability.

## 5. Fail-closed behavior

No governed side effect may occur when any of the following holds:

- authentication fails or caller scope is unknown;
- the canonical revision or graph blob SHA is missing, stale, mismatched, or unverifiable;
- canonical authority is unavailable or unratified;
- authority binding is unresolved, malformed, revoked, or drifted;
- transition inputs are missing or contradictory;
- constraints fail, reversibility cannot be established where required, or lineage cannot be recorded;
- the gateway times out or returns an invalid/partial decision;
- the expected GitHub state has changed since the proposal was evaluated.

A timeout is not an implicit allow. Retries must use idempotency protection and must not blindly repeat a possibly completed external effect.

## 6. Initial operation boundary

The first integration, if approved, should be limited to governed proposal operations:

- write only to explicitly allowed noncanonical model branches;
- open a PR only into the configured canonical target;
- reject source/target equality;
- preserve path denylist and path/branch coherence;
- never write directly to canonical main;
- never merge a PR;
- preserve human review and merge authority outside the gateway.

Read-only tools may remain outside this mutation gateway, but their documentation must not imply that reads are themselves runtime-authorized state transitions.

## 7. Required verification before production claims

1. Contract/schema tests for missing, malformed, contradictory, and overbroad requests.
2. Gateway tests proving blocked requests invoke the external side-effect sink zero times.
3. Tests for stale canonical revision, wrong graph blob SHA, provider outage, unresolved authority, revocation/drift, and GitHub precondition changes.
4. Integration tests using the actual gateway-to-GitHub mutation boundary, with a fake/test repository or controlled test branch.
5. Authentication tests proving a caller cannot spoof another model's identity or scope.
6. Retry/idempotency tests covering a timeout after the remote effect may have succeeded.
7. Deployment configuration verification and a live smoke test against the actual deployed request path before claiming production enforcement.

## 8. Explicit non-claims

This document does not establish that a gateway exists, that an endpoint is deployed, that the MCP server currently calls the Python runtime, or that production environment variables have been verified. It does not change canonical governance artifacts or grant any authority to mutate or merge canonical state.

Tracked architecture gap: [Issue #5](https://github.com/kushkillerjsixx66/canonical-vault-mcp-server/issues/5).
