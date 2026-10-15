import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  GITHUB_DEFAULT_REF,
  GITHUB_OWNER,
  GITHUB_REPO,
  LOCKED_WRITE_BRANCH,
  MODEL_WRITE_SCOPE,
  WRITE_BRANCH_ALLOWLIST,
  WRITE_BRANCH_LOCKED,
  WRITE_PATH_DENYLIST,
  modelSegmentFromPath,
} from "../constants.js";
import {
  githubCreatePullRequest,
  githubGetSha,
  githubPutFile,
  handleGitHubError,
} from "../services/github-write.js";
import { GitHubContentPutResponse, GitHubPullRequest } from "../types.js";
import { createPullRequestWithinScope, PullRequestTargetScopeError } from "../services/pr-scope.js";
import { resolveWriteBranch, WriteBranchScopeError } from "../services/write-branch-scope.js";
import { WriteScopeError, writeFileWithinScope } from "../services/write-scope.js";


export function registerVaultWriteTools(server: McpServer): void {
  const defaultBranch = LOCKED_WRITE_BRANCH || WRITE_BRANCH_ALLOWLIST[0];
  const scopeNote = WRITE_BRANCH_LOCKED
    ? ` This deployment is hard-locked to branch '${defaultBranch}' only.`
    : ` Allowed branches: ${WRITE_BRANCH_ALLOWLIST.join(", ")}. Path under vault|runtime|00_governance/<model>/ must use matching branch.`;

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
        .default(defaultBranch)
        .describe(
          `Target branch. Must be one of: ${WRITE_BRANCH_ALLOWLIST.join(", ")}. Never '${GITHUB_DEFAULT_REF}'.` +
            (WRITE_BRANCH_LOCKED
              ? ` Locked to '${defaultBranch}' on this deployment.`
              : ` Must match model path segment when writing under vault|runtime|00_governance/<model>/.`)
        ),
    })
    .strict();
  type ProposeChangeInput = z.infer<typeof ProposeChangeInputSchema>;

  server.registerTool(
    "vault_propose_change",
    {
      title: "Propose Vault Change",
      description: `Create or update a single file on a governed non-canonical branch of ${GITHUB_OWNER}/${GITHUB_REPO}. Cannot write to '${GITHUB_DEFAULT_REF}' or any branch outside the write allowlist (${WRITE_BRANCH_ALLOWLIST.join(", ")}), and cannot touch paths in the prohibited zones (constitution, ip_legal, protected manifests).

Branch sovereignty (Model Contribution Contract): each model writes only to its own branch.${scopeNote}

This always appends a new commit via GitHub's Contents API — it cannot force-push or rewrite history. Use vault_open_pr afterward to propose merging into ${GITHUB_DEFAULT_REF}; there is no merge tool in this server.

Args:
  - path (string): File path relative to repo root
  - content (string): Full new file content — replaces the whole file
  - message (string): Commit message
  - branch (string): Target branch (default: '${defaultBranch}')

Returns:
  The new commit sha and its GitHub URL.

Error Handling:
  - Returns scope / prohibited-zone / path-coherence errors before any GitHub call
  - Returns GitHub's own error (e.g. stale sha) if the write itself fails`,
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
        const branch = resolveBranch(params.branch);
        const result = await writeFileWithinScope(
          branch,
          params.path,
          {
            allowedBranches: WRITE_BRANCH_ALLOWLIST,
            canonicalBranch: GITHUB_DEFAULT_REF,
            prohibitedPaths: WRITE_PATH_DENYLIST,
            modelSegmentFromPath,
          },
          async () => {
            const sha = await githubGetSha(params.path, branch);
            return githubPutFile<GitHubContentPutResponse>(params.path, {
              message: params.message,
              branch,
              content: Buffer.from(params.content, "utf-8").toString("base64"),
              ...(sha ? { sha } : {}),
            });
          }
        );

        const output = {
          path: params.path,
          branch,
          commit_sha: result.commit.sha,
          commit_url: result.commit.html_url,
        };
        return {
          content: [{ type: "text", text: `Committed to ${output.branch}: ${output.path}\n${output.commit_url}` }],
          structuredContent: output,
        };
      } catch (error) {
        if (error instanceof WriteScopeError || error instanceof PullRequestTargetScopeError) {
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
        .default(defaultBranch)
        .describe(
          `Source branch. Must be one of: ${WRITE_BRANCH_ALLOWLIST.join(", ")}.` +
            (WRITE_BRANCH_LOCKED ? ` Locked to '${defaultBranch}'.` : "")
        ),
      base: z.string().default(GITHUB_DEFAULT_REF).describe(`Target branch (default: '${GITHUB_DEFAULT_REF}').`),
    })
    .strict();
  type OpenPrInput = z.infer<typeof OpenPrInputSchema>;

  server.registerTool(
    "vault_open_pr",
    {
      title: "Open Vault Pull Request",
      description: `Open a pull request from a governed branch into '${GITHUB_DEFAULT_REF}' on ${GITHUB_OWNER}/${GITHUB_REPO}. This tool can only OPEN the PR — there is no merge tool anywhere in this server. Merging stays a human action on GitHub.${scopeNote}

Args:
  - title (string): PR title
  - body (string): PR description (default: empty)
  - head (string): Source branch (default: '${defaultBranch}')
  - base (string): Target branch (default: '${GITHUB_DEFAULT_REF}')

Returns:
  The PR number and URL.

Error Handling:
  - Returns scope errors if 'head' is outside the write allowlist or locked scope
  - Returns GitHub's own error if the PR can't be created`,
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
        const head = resolveBranch(params.head);
        if (!WRITE_BRANCH_ALLOWLIST.includes(head)) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Error: '${head}' is not a governed source branch. Allowed: ${WRITE_BRANCH_ALLOWLIST.join(", ")}.`,
              },
            ],
          };
        }
        const pr = await createPullRequestWithinScope(
          head,
          params.base,
          GITHUB_DEFAULT_REF,
          () => githubCreatePullRequest<GitHubPullRequest>({
            title: params.title,
            body: params.body,
            head,
            base: params.base,
          })
        );
        return {
          content: [
            {
              type: "text",
              text: `Opened PR #${pr.number}: ${pr.html_url}\n${head} -> ${params.base} (awaiting human review/merge)`,
            },
          ],
          structuredContent: { number: pr.number, url: pr.html_url, head, base: params.base, state: pr.state },
        };
      } catch (error) {
        if (error instanceof WriteScopeError || error instanceof PullRequestTargetScopeError) {
          return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
        }
        return { isError: true, content: [{ type: "text", text: handleGitHubError(error, `PR '${params.head}' -> '${params.base}'`) }] };
      }
    }
  );
}
