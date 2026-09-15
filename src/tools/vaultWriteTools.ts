import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  vaultWriteFile, vaultDeleteFile, vaultListFiles, AGENT_BRANCH_MAP,
} from "../services/vaultWriteService.js";

const AGENT_IDS = Object.keys(AGENT_BRANCH_MAP) as [string, ...string[]];

export function registerVaultWriteTools(server: McpServer): void {

  // ── vault_write_file ───────────────────────────────────────────────────────
  server.tool(
    "vault_write_file",
    `Create or update a file in canonical-vault on this agent's dedicated branch.
Branch mapping: chatgpt→chatgpt, claude→claude, grok→grok, gemini→gemini.
Cross-branch writes are NOT permitted.`,
    {
      agent_id: z.enum(AGENT_IDS as [string, ...string[]])
        .describe(`Your agent identity: "chatgpt", "claude", "grok", or "gemini".`),
      path: z.string().min(1)
        .describe(`Repo-relative path, e.g. "notes/session-2026-09-11.md". No leading slash or ".." segments.`),
      content: z.string()
        .describe("Full UTF-8 text content to write."),
      commit_message: z.string().min(1)
        .describe(`Git commit message, e.g. "chore(claude): add session notes"`),
    },
    async ({ agent_id, path, content, commit_message }) => {
      try {
        const result = await vaultWriteFile({
          agentId: agent_id, path, content, commitMessage: commit_message,
        });
        return {
          content: [{ type: "text", text: JSON.stringify({
            success: true, action: result.action,
            agent: result.agentId, branch: result.branch, path: result.path,
            commit_sha: result.commitSha, commit_url: result.commitUrl,
          }, null, 2) }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text", text: `ERROR: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    }
  );

  // ── vault_delete_file ──────────────────────────────────────────────────────
  server.tool(
    "vault_delete_file",
    "Delete a file from this agent's dedicated branch in canonical-vault.",
    {
      agent_id: z.enum(AGENT_IDS as [string, ...string[]])
        .describe(`Your agent identity: "chatgpt", "claude", "grok", or "gemini".`),
      path: z.string().min(1)
        .describe("Repo-relative path of the file to delete."),
      commit_message: z.string().min(1)
        .describe("Git commit message for the deletion."),
    },
    async ({ agent_id, path, commit_message }) => {
      try {
        const result = await vaultDeleteFile({
          agentId: agent_id, path, commitMessage: commit_message,
        });
        return {
          content: [{ type: "text", text: JSON.stringify({
            success: true, action: "deleted",
            agent: result.agentId, branch: result.branch, path: result.path,
            commit_sha: result.commitSha, commit_url: result.commitUrl,
          }, null, 2) }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text", text: `ERROR: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    }
  );

  // ── vault_list_files ───────────────────────────────────────────────────────
  server.tool(
    "vault_list_files",
    "List files and directories in this agent's dedicated branch of canonical-vault.",
    {
      agent_id: z.enum(AGENT_IDS as [string, ...string[]])
        .describe(`Your agent identity: "chatgpt", "claude", "grok", or "gemini".`),
      dir_path: z.string().optional()
        .describe(`Optional subdirectory, e.g. "notes/2026". Omit for repo root.`),
    },
    async ({ agent_id, dir_path }) => {
      try {
        const result = await vaultListFiles({ agentId: agent_id, dirPath: dir_path });
        return {
          content: [{ type: "text", text: JSON.stringify({
            success: true, agent: result.agentId, branch: result.branch,
            path: dir_path || "/", items: result.items,
          }, null, 2) }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text", text: `ERROR: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    }
  );
  }
