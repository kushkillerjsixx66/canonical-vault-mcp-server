# canonical-vault-mcp-server

Read-only MCP server that exposes the `canonical-vault` GitHub repo to any MCP client — GitHub Copilot, Claude, or anything else that speaks Streamable HTTP MCP.

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

Scope for both is fixed by `00_governance/claude/manifest.json` (`canonical_merge_authority: false`): no direct writes to the canonical branch, no path in a prohibited zone, no merge tool anywhere in this server. See "Write tools" below for setup.

---

## 1. Deploy to Vercel

```bash
npm install -g vercel   # if you don't have it
cd canonical-vault-mcp-server
vercel login
vercel
```

Accept the defaults (Vercel auto-detects `api/mcp.ts` as a Node serverless function). After `vercel --prod`, you'll get a URL like:

```
https://canonical-vault-mcp-server.vercel.app
```

Your MCP endpoint is:

```
https://canonical-vault-mcp-server.vercel.app/api/mcp
```

### Environment variables (set in Vercel dashboard → Settings → Environment Variables)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `GITHUB_TOKEN` | Strongly recommended | none | A GitHub PAT with `repo` (or just public_repo, since the vault is public) read scope. Without it you're capped at 60 GitHub API requests/hour shared across every caller; with it, 5000/hour. |
| `GITHUB_OWNER` | No | `kushkillerjsixx66` | Change only if the repo moves |
| `GITHUB_REPO` | No | `canonical-vault` | Change only if the repo is renamed |
| `GITHUB_DEFAULT_REF` | No | `main` | Default branch tools read from when no `ref` is given |
| `GITHUB_WRITE_TOKEN` | No — write tools are disabled without it | none | A **separate**, fine-grained PAT scoped to `Contents: Read and write` on `canonical-vault` only (no Administration, no other repos). Setting this is the only thing that activates `vault_propose_change` / `vault_open_pr`. |
| `GITHUB_WRITE_BRANCH_ALLOWLIST` | No | `claude` | Comma-separated branches the write tools may touch. The server refuses to boot if this ever includes `GITHUB_DEFAULT_REF`. |

After adding env vars, redeploy (`vercel --prod`) so the function picks them up.

---

## 1b. Write tools (opt-in)

Everything here is governed by `00_governance/claude/manifest.json`:

- `canonical_merge_authority: false` → there is no merge tool, ever. `vault_open_pr` opens a PR; a human merges it on GitHub.
- `prohibited_zones` → `WRITE_PATH_DENYLIST` in `src/constants.ts` blocks the constitution, IP/legal docs, and the manifest itself, regardless of branch.
- Branch scope → `WRITE_BRANCH_ALLOWLIST` (default: `claude` only). The server throws on startup if `main` (or whatever `GITHUB_DEFAULT_REF` is) is ever added to it — a misconfigured env var fails loud, not silent.

**Setup:**
1. Create a fine-grained GitHub PAT scoped to `kushkillerjsixx66/canonical-vault` only, permission `Contents: Read and write`. Nothing else.
2. Set it as `GITHUB_WRITE_TOKEN` in Vercel — separate from `GITHUB_TOKEN`.
3. On GitHub → repo Settings → Branches, add a protection rule on `main`: require a pull request before merging, disallow force pushes, exclude this PAT's identity from any push-bypass list. This is what actually stops a bug in the tool code from reaching `main` — don't rely on the allowlist alone.
4. Redeploy. The two write tools now appear in the tool list; skip steps 1-2 and they simply don't exist.

Recommended: make your `stumpy` test suite a required status check on the PR, so `vault_open_pr` can't be merged without it passing — that enforces `bypass_of_stumpy_audit` at the platform level instead of trusting the tool code alone.

---

## 2. Connect GitHub Copilot to it

Copilot (in VS Code, and Copilot coding agent) reads MCP server config from `.vscode/mcp.json` in your workspace, or from VS Code's global MCP settings. Add:

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

Then in VS Code: Command Palette → "MCP: List Servers" → `canonical-vault` → Start. Copilot Chat will pick up the five `vault_*` tools automatically and can invoke them in agent mode.

For Copilot's remote coding agent (not VS Code-local), the same URL can be registered under your organization's MCP server settings on github.com, wherever Copilot's agent MCP config lives for your plan — that part is on GitHub's side, not this server's.

---

## 3. Local testing (before you deploy)

```bash
npm install
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```

This opens the MCP Inspector UI where you can call each tool by hand against the live repo before wiring Copilot to it.

To test the HTTP path locally instead of stdio:

```bash
npm install -g vercel
vercel dev
# endpoint: http://localhost:3000/api/mcp
```

---

## Notes on design choices

- **Stateless per-request transport**: `api/mcp.ts` creates a fresh `McpServer` + `StreamableHTTPServerTransport` on every POST. This is the correct pattern for serverless — Vercel functions don't persist memory between invocations, so there's no session to keep, and it avoids request-ID collisions if two callers hit the endpoint at once.
- **Lineage = commit history**, not a bespoke concept — `vault_get_file_history` is literally `GET /commits?path=...`, which is the closest honest mapping of "lineage" onto what GitHub's API actually offers. If your vault's lineage chain concept (governance/vault pipeline) needs something more specific — e.g. reading a lineage manifest file that lives *in* the repo — that's better served by pointing `vault_get_file` at that manifest directly rather than us reimplementing git history.
- **Write tools are the separate, reviewed addition this note originally called for** — `src/services/github-write.ts` and `src/tools/vault-write.ts` are new, standalone modules; nothing in the existing read-only path (`services/github.ts`, `tools/vault.ts`, `tools/canonical.ts`) was touched. They only activate when `GITHUB_WRITE_TOKEN` is explicitly set, so a deployment that never sets it behaves exactly as it did before this was added. Enforcement is layered, not just in-code: the PAT is scoped to `Contents: Read and write` on this repo alone, GitHub branch protection on `main` blocks direct/force pushes independent of anything this server does, and the tool code refuses out-of-scope branches or paths before it ever calls GitHub. There is no merge tool anywhere in this server — `vault_open_pr` only opens the PR.
- **Search caveat**: GitHub's code search API only indexes the default branch and has its own propagation delay — a file committed seconds ago may not show up in `vault_search_files` yet. `vault_get_file` and `vault_list_directory` always reflect the live tree.
