# canonical-vault-mcp-server

Read-only MCP server that exposes the `canonical-vault` GitHub repo to any MCP client — GitHub Copilot, Claude, or anything else that speaks Streamable HTTP MCP.

Five tools, all read-only, all scoped to `kushkillerjsixx66/canonical-vault`:

| Tool | Purpose |
|---|---|
| `vault_list_directory` | List files/dirs at a path |
| `vault_get_file` | Fetch a file's decoded text content |
| `vault_get_file_history` | Lineage — commit history for a path |
| `vault_get_commit` | Full detail + diff stats for one commit |
| `vault_search_files` | Code search across the repo |

No write tools exist in this server on purpose — nothing here can commit, push, or modify the vault.

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

After adding env vars, redeploy (`vercel --prod`) so the function picks them up.

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
- **Read-only by design, per your answer** — this server cannot write to canonical-vault. If you later want Copilot to *commit* back (e.g. via a PR), that's a separate set of write tools with real destructive-action review, not something to bolt on quietly.
- **Search caveat**: GitHub's code search API only indexes the default branch and has its own propagation delay — a file committed seconds ago may not show up in `vault_search_files` yet. `vault_get_file` and `vault_list_directory` always reflect the live tree.
