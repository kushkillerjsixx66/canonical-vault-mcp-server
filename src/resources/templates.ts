import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CHARACTER_LIMIT,
  GITHUB_DEFAULT_REF,
  GITHUB_OWNER,
  GITHUB_REPO,
  MAX_FILE_BYTES,
} from "../constants.js";
import { githubGet, handleGitHubError, REPO_PATH } from "../services/github.js";
import type { GitHubCommitDetail, GitHubFileContent } from "../types.js";

/**
 * Resource templates (MCP upgrade Phase 1, 2026-10-07).
 *
 * The 13 curated substrate documents are static resources. Everything else
 * in the vault was previously reachable only through tool calls
 * (vault_get_file / vault_get_commit), which forces file reads through the
 * action surface and returns them as tool blobs. These templates make any
 * vault file and any commit addressable as a resource:
 *
 *   vault://file/{+path}   — any file in the repo at the default ref
 *   vault://commit/{sha}   — a single commit (full or abbreviated SHA)
 *
 * The URI is the provenance: it names repo, path/sha, and (in the returned
 * header) the resolved ref, blob SHA, and size. Read semantics mirror
 * fetchCanonicalContent: same GitHub contents API, same MAX_FILE_BYTES
 * guard, same CHARACTER_LIMIT truncation with an explicit marker.
 */

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= CHARACTER_LIMIT) return { text, truncated: false };
  return {
    text:
      text.slice(0, CHARACTER_LIMIT) +
      "\n\n[Truncated at " +
      CHARACTER_LIMIT +
      " characters.]",
    truncated: true,
  };
}

function mimeForPath(path: string): string {
  if (path.endsWith(".md")) return "text/markdown";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".py")) return "text/x-python";
  return "text/plain";
}

function varString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.join("/");
  return value ?? "";
}

export function registerResourceTemplates(server: McpServer): void {
  // ----- vault://file/{+path} -------------------------------------------
  server.registerResource(
    "vault-file",
    new ResourceTemplate("vault://file/{+path}", { list: undefined }),
    {
      title: "Vault File (by path)",
      description:
        "Any file in the canonical-vault repository, addressed by repo-relative path at the default ref. Prefer the curated vault://<name> resources for substrate documents; use this template for everything else.",
      mimeType: "text/plain",
    },
    async (uri: URL, variables) => {
      const path = decodeURIComponent(varString(variables.path)).replace(
        /^\/+/,
        ""
      );
      if (!path) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: "Error: vault://file/ requires a non-empty path, e.g. vault://file/VAULT_INDEX.md",
            },
          ],
        };
      }
      try {
        const endpoint =
          REPO_PATH +
          "/contents/" +
          encodeURIComponent(path).replace(/%2F/g, "/");
        const data = await githubGet<GitHubFileContent>(endpoint, {
          ref: GITHUB_DEFAULT_REF,
        });
        if (Array.isArray(data) || data.type !== "file") {
          throw new Error(`'${path}' is not a file`);
        }
        if (data.size > MAX_FILE_BYTES) {
          throw new Error(
            `'${path}' is ${data.size} bytes (limit ${MAX_FILE_BYTES})`
          );
        }
        if (!data.content || data.encoding !== "base64") {
          throw new Error(`'${path}' has no readable text content`);
        }
        const decoded = Buffer.from(data.content, "base64").toString("utf-8");
        const header =
          "# Vault File\n" +
          "uri: vault://file/" +
          path +
          "\n" +
          "path: " +
          path +
          "\n" +
          "ref: " +
          GITHUB_DEFAULT_REF +
          " · sha: " +
          data.sha +
          " · " +
          data.size +
          " bytes\n" +
          "repo: " +
          GITHUB_OWNER +
          "/" +
          GITHUB_REPO +
          "\n\n";
        const { text } = truncate(header + decoded);
        return {
          contents: [
            { uri: uri.href, mimeType: mimeForPath(path), text },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: handleGitHubError(error, `file '${path}'`),
            },
          ],
        };
      }
    }
  );

  // ----- vault://commit/{sha} -------------------------------------------
  server.registerResource(
    "vault-commit",
    new ResourceTemplate("vault://commit/{sha}", { list: undefined }),
    {
      title: "Vault Commit (by SHA)",
      description:
        "A single commit in the canonical-vault repository: message, author, date, stats, and changed files. Accepts a full or abbreviated SHA.",
      mimeType: "text/markdown",
    },
    async (uri: URL, variables) => {
      const sha = varString(variables.sha).trim();
      if (!sha) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: "Error: vault://commit/ requires a SHA, e.g. vault://commit/678a152",
            },
          ],
        };
      }
      try {
        const data = await githubGet<GitHubCommitDetail>(
          `${REPO_PATH}/commits/${encodeURIComponent(sha)}`
        );
        const author =
          data.commit.author?.name ?? data.author?.login ?? "unknown";
        const date = data.commit.author?.date ?? "";
        const lines: string[] = [
          "# Commit " + data.sha,
          "uri: vault://commit/" + data.sha,
          "repo: " + GITHUB_OWNER + "/" + GITHUB_REPO,
          "author: " + author + (date ? " · " + date : ""),
          data.html_url ? "url: " + data.html_url : "",
          "",
          data.commit.message,
          "",
        ];
        if (data.stats) {
          lines.push(
            `Changes: ${data.stats.total} file(s), +${data.stats.additions} / -${data.stats.deletions}`,
            ""
          );
        }
        for (const f of data.files ?? []) {
          lines.push(
            `- ${f.filename} (${f.status}, +${f.additions} / -${f.deletions})`
          );
        }
        const { text } = truncate(lines.filter(Boolean).join("\n"));
        return {
          contents: [{ uri: uri.href, mimeType: "text/markdown", text }],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: handleGitHubError(error, `commit '${sha}'`),
            },
          ],
        };
      }
    }
  );
}
