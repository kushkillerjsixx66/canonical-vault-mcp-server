import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  GITHUB_DEFAULT_REF,
  GITHUB_OWNER,
  GITHUB_REPO,
  WRITE_BRANCH_ALLOWLIST,
  WRITE_PATH_DENYLIST,
} from "../constants.js";
import {
  githubCreatePullRequest,
  githubGetSha,
  githubPutFile,
  handleGitHubError,
} from "../services/github-write.js";
import { GitHubContentPutResponse, GitHubPullRequest } from "../types.js";

class WriteScopeError extends Error {}

function assertWritable(branch: string, path: string): void {
  if (!WRITE_BRANCH_ALLOWLIST.includes(branch)) {
    throw new WriteScopeError(
      `'${branch}' is not a governed write branch (allowed: ${WRITE_BRANCH_ALLOWLIST.join(", ")}). ` +
        `Per 00_governance/claude/manifest.json, canonical_merge_authority is false — ` +
        `'${GITHUB_DEFAULT_REF}' can only be reached via vault_open_pr, never written to directly.`
    );
  }
  if (WRITE_PATH_DENYLIST.some((rx) => rx.test(path))) {
    throw new WriteScopeError(
      `'${path}' is in a prohibited zone (direct_canonical_mutation, per manifest.json). Refusing to write.`
    );
  }
}

export function registerVaultWriteTools(server: McpServer): void {
  // ---------------------------------------------------------------------
  // vault_propose_change
  // ---------------------------------------------------------------------
  const ProposeChangeInputSchema = z
    .object({
      path: z.string().min(1).max(500).describe("File path within the repo, relative to root."),
      content: z
        .string()
        .max(500_000)
        .describe("Full new text content of the file (UTF-8). Replaces the whole file — this is not a patch/diff."),
      message: z.string().min(1).max(500).describe("Commit message."),
      branch: z
        .string()
        .default(WRITE_BRANCH_ALLOWLIST[0])
        .describe(`Target branch. Must be one of: ${WRITE_BRANCH_ALLOWLIST.join(", ")}. Never '${GITHUB_DEFAULT_REF}'.`),
    })
    .strict();
  type ProposeChangeInput = z.infer<typeof ProposeChangeInputSchema>;

  server.registerTool(
    "vault_propose_change",
    {
      title: "Propose Vault Change",
      description: `Create or update a single file on a governed non-canonical branch of ${GITHUB_OWNER}/${GITHUB_REPO}. Cannot write to '${GITHUB_DEFAULT_REF}' or any branch outside the write allowlist (${WRITE_BRANCH_ALLOWLIST.join(", ")}), and cannot touch paths in the prohibited zones defined by 00_governance/claude/manifest.json (constitution, ip_legal, the manifest itself).

This always appends a new commit via GitHub's Contents API — it cannot force-push or rewrite history. Use vault_open_pr afterward to propose merging into ${GITHUB_DEFAULT_REF}; there is no merge tool in this server.

Args:
  - path (string): File path relative to repo root
  - content (string): Full new file content — replaces the whole file
  - message (string): Commit message
  - branch (string): Target branch (default: '${WRITE_BRANCH_ALLOWLIST[0]}')

Returns:
  The new commit sha and its GitHub URL.

Error Handling:
  - Returns "Error: ... not a governed write branch" or "... prohibited zone" if the request is out of scope — these are refused before any GitHub call is made
  - Returns GitHub's own error (e.g. stale sha on a concurrent edit — call vault_get_file again and retry) if the write itself fails`,
      inputSchema: ProposeChangeInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: ProposeChangeInput) => {
      try {
        assertWritable(params.branch, params.path);

        const sha = await githubGetSha(params.path, params.branch);
        const result = await githubPutFile<GitHubContentPutResponse>(params.path, {
          message: params.message,
          branch: params.branch,
          content: Buffer.from(params.content, "utf-8").toString("base64"),
          ...(sha ? { sha } : {}),
        });

        const output = {
          path: params.path,
          branch: params.branch,
          commit_sha: result.commit.sha,
          commit_url: result.commit.html_url,
        };
        return {
          content: [{ type: "text", text: `Committed to ${output.branch}: ${output.path}\n${output.commit_url}` }],
          structuredContent: output,
        };
      } catch (error) {
        if (error instanceof WriteScopeError) {
          return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
        }
        return { isError: true, content: [{ type: "text", text: handleGitHubError(error, `write to '${params.path}'`) }] };
      }
    }
  );

  // ---------------------------------------------------------------------
  // vault_open_pr
  // ---------------------------------------------------------------------
  const OpenPrInputSchema = z
    .object({
      title: z.string().min(1).max(300).describe("PR title"),
      body: z.string().max(10_000).default("").describe("PR description"),
      head: z
        .string()
        .default(WRITE_BRANCH_ALLOWLIST[0])
        .describe(`Source branch. Must be one of: ${WRITE_BRANCH_ALLOWLIST.join(", ")}.`),
      base: z.string().default(GITHUB_DEFAULT_REF).describe(`Target branch (default: '${GITHUB_DEFAULT_REF}').`),
    })
    .strict();
  type OpenPrInput = z.infer<typeof OpenPrInputSchema>;

  server.registerTool(
    "vault_open_pr",
    {
      title: "Open Vault Pull Request",
      description: `Open a pull request from a governed branch into '${GITHUB_DEFAULT_REF}' on ${GITHUB_OWNER}/${GITHUB_REPO}. This tool can only OPEN the PR — there is no merge tool anywhere in this server. Merging stays a human action on GitHub, consistent with canonical_merge_authority: false in 00_governance/claude/manifest.json.

Args:
  - title (string): PR title
  - body (string): PR description (default: empty)
  - head (string): Source branch (default: '${WRITE_BRANCH_ALLOWLIST[0]}')
  - base (string): Target branch (default: '${GITHUB_DEFAULT_REF}')

Returns:
  The PR number and URL.

Error Handling:
  - Returns "Error: ... not a governed source branch" if 'head' is outside the write allowlist
  - Returns GitHub's own error if the PR can't be created (e.g. no diff between branches, or one is already open)`,
      inputSchema: OpenPrInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: OpenPrInput) => {
      try {
        if (!WRITE_BRANCH_ALLOWLIST.includes(params.head)) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Error: '${params.head}' is not a governed source branch. Allowed: ${WRITE_BRANCH_ALLOWLIST.join(", ")}.`,
              },
            ],
          };
        }
        const pr = await githubCreatePullRequest<GitHubPullRequest>({
          title: params.title,
          body: params.body,
          head: params.head,
          base: params.base,
        });
        return {
          content: [
            {
              type: "text",
              text: `Opened PR #${pr.number}: ${pr.html_url}\n${params.head} -> ${params.base} (awaiting human review/merge)`,
            },
          ],
          structuredContent: { number: pr.number, url: pr.html_url, head: params.head, base: params.base, state: pr.state },
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: handleGitHubError(error, `PR '${params.head}' -> '${params.base}'`) }] };
      }
    }
  );
}
