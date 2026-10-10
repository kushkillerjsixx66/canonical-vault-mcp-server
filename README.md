# canonical-vault-mcp-server

MCP server that exposes the `canonical-vault` GitHub repo to any MCP client — GitHub Copilot, Claude, Grok, ChatGPT, or anything else that speaks Streamable HTTP MCP.

Five read-only tools, always available, scoped to `kushkillerjsixx66/canonical-vault`:

| Tool | Purpose |
|---|---|
| `vault_list_directory` | List files/dirs at a path |
| `vault_get_file` | Fetch a file's decoded text content |
| `vault_get_file_history` | Lineage — commit history for a path |
| `vault_get_commit` | Full detail + diff stats for one commit |
| `vault_search_files` | Code search across the repo |

Plus two write tools, registered **only** when `GITHUB_WRITE_TOKEN` is set — otherwise they don't exist on the server at all:

| Tool | Purpose |
|---|---|
| `vault_propose_change` | Create/update one file on a governed branch (never `main`, never a prohibited path) |
| `vault_open_pr` | Open a PR from a governed branch into `main` — never merges |

Scope is fixed by the Model Contribution Contract (`00_governance/contracts/model-contribution.md`) and `canonical_merge_authority: false`: no direct writes to the canonical branch, no path in a prohibited zone, no merge tool anywhere in this server.

---

## 1. Deploy to Vercel

```bash
npm install -g vercel
cd canonical-vault-mcp-server
vercel login
vercel --prod
```

MCP endpoint:

```
https://canonical-vault-mcp-server.vercel.app/api/mcp
```

### Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `GITHUB_TOKEN` | Strongly recommended | none | Read PAT (or public_repo). Raises rate limit to 5000/hr. |
| `GITHUB_OWNER` | No | `kushkillerjsixx66` | |
| `GITHUB_REPO` | No | `canonical-vault` | |
| `GITHUB_DEFAULT_REF` | No | `main` | |
| `GITHUB_WRITE_TOKEN` | No — write tools off without it | none | **Sensitive.** Fine-grained PAT: Contents R/W on `canonical-vault` only. |
| `GITHUB_WRITE_BRANCH_ALLOWLIST` | No | `grok,claude,chatgpt,gemini,copilot,muse` | Shared multi-model surface. Must never include `main`. |
| `MODEL_WRITE_SCOPE` | No | unset | **Hard lock.** e.g. `grok` → this deployment may only write to branch `grok`. Overrides the multi-model allowlist. Use one deployment per model for true isolation. |

After changing env vars, redeploy production.

---

## 1b. Write tools — branch sovereignty

Enforcement layers:

1. **`MODEL_WRITE_SCOPE` (recommended per model)** — Set `MODEL_WRITE_SCOPE=grok` on the Grok deployment, `=claude` on Claude’s, `=muse` on Muse’s, etc. Client cannot pick another branch.
2. **Path/branch coherence** — Paths under `vault/<model>/`, `runtime/<model>/`, or `00_governance/<model>/` require `branch === <model>`. Blocks e.g. writing `vault/claude/...` while targeting branch `grok`.
3. **Allowlist** — Without `MODEL_WRITE_SCOPE`, only listed model branches are writable; `main` is never writable.
4. **Path denylist** — Constitution, IP/legal, protected manifests.
5. **No merge tool** — `vault_open_pr` opens only; humans merge on GitHub.

**Recommended production config (Grok endpoint):**

```text
GITHUB_WRITE_TOKEN=<secret>
MODEL_WRITE_SCOPE=grok
GITHUB_WRITE_BRANCH_ALLOWLIST=grok
```

**Setup:**
1. Fine-grained PAT: `Contents: Read and write` on `canonical-vault` only → `GITHUB_WRITE_TOKEN` (Sensitive).
2. Set `MODEL_WRITE_SCOPE` to the model this URL serves.
3. Protect `main` on GitHub: require PR, no force-push, exclude write PAT from bypass.
4. Redeploy.

---

## 2. Connect clients

```json
{
  "servers": {
    "canonical-vault": {
      "type": "http",
      "url": "https://canonical-vault-mcp-server.vercel.app/api/mcp"
    }
  }
}
```

Always pass `branch` / `head` matching the model when the deployment is not hard-locked.

---

## 3. Local testing

```bash
npm install && npm run build
npx @modelcontextprotocol/inspector node dist/index.js
# or
vercel dev   # http://localhost:3000/api/mcp
```

---

## Notes

- Stateless per-request Streamable HTTP (`api/mcp.ts`).
- Lineage tools map to GitHub commit history.
- GitHub code search indexes the default branch only (propagation delay possible).


## 4. Governance enforcement boundary

This MCP server is a **Canonical Vault access and proposal interface**, not by itself the full Lattice runtime governance engine.

The server's TypeScript entry point creates `createServer()`, which registers repository read tools, canonical document resources, and optional governed-branch proposal tools. It does not instantiate the Python `05_runtime/governance/boundary.py` `GovernanceBoundary` or call its `AuthoritativeGovernanceEngine`.

Keep these controls distinct:

- **MCP scope controls:** repository allowlisting, branch allowlisting / `MODEL_WRITE_SCOPE`, path restrictions, and PR-only writes constrain what this service can propose.
- **Lattice runtime governance:** canonical-state retrieval, revision-pinned authority resolution, transition evaluation, authorization, drift revalidation, and post-decision enforcement are provided by the separate Python runtime when that runtime is actually invoked.
- **GitHub merge authority:** `vault_open_pr` proposes a change; it does not authorize or perform a merge.

Consequently, connecting an MCP client to this endpoint does **not** establish that every tool call has passed through the Python Lattice governance boundary. Do not describe this endpoint as enforcing the full Lattice runtime unless an explicit, authenticated integration is implemented and verified.

Any future integration must define the request and response contract, caller identity, exact target/scope/effect, pinned canonical revision, decision evidence, timeout and provider-failure behavior, and fail-closed semantics. Integration tests must exercise the actual mutation boundary. Production enforcement claims additionally require verifying deployment configuration and running a live smoke test against the deployed path.

Tracked follow-up: [Define and verify the runtime governance enforcement boundary](https://github.com/kushkillerjsixx66/canonical-vault-mcp-server/issues/5).
