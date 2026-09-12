/**
 * Branch-scoped write service for the canonical-vault repo.
 *
 * Required env vars:
 *   VAULT_WRITE_TOKEN  – GitHub PAT with repo/contents:write on canonical-vault
 *   VAULT_OWNER        – GitHub owner (e.g. "kushkillerjsixx66")
 *   VAULT_REPO         – Repo name (e.g. "canonical-vault")
 */

const GITHUB_API = "https://api.github.com";

export type AgentId = "chatgpt" | "claude" | "grok" | "gemini";

export const AGENT_BRANCH_MAP: Record<AgentId, string> = {
  chatgpt: "chatgpt",
  claude:  "claude",
  grok:    "grok",
  gemini:  "gemini",
};

export function isValidAgent(id: string): id is AgentId {
  return Object.keys(AGENT_BRANCH_MAP).includes(id);
}

export function branchForAgent(agentId: string): string {
  if (!isValidAgent(agentId)) {
    throw new Error(
      `Unknown agent "${agentId}". Allowed: ${Object.keys(AGENT_BRANCH_MAP).join(", ")}`
    );
  }
  return AGENT_BRANCH_MAP[agentId];
}

function getConfig() {
  const token = process.env.VAULT_WRITE_TOKEN;
  const owner = process.env.VAULT_OWNER;
  const repo  = process.env.VAULT_REPO;
  if (!token) throw new Error("VAULT_WRITE_TOKEN is not set.");
  if (!owner) throw new Error("VAULT_OWNER is not set.");
  if (!repo)  throw new Error("VAULT_REPO is not set.");
  return { token, owner, repo };
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function encodeFilePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function getCurrentFileSha(
  owner: string, repo: string, branch: string,
  path: string, token: string
): Promise<string | null> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeFilePath(path)}?ref=${branch}`;
  const res = await fetch(url, { headers: githubHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`SHA lookup failed (${res.status}): ${await res.text()}`);
  const data = await res.json() as { sha: string };
  return data.sha;
}

// ─── Write ────────────────────────────────────────────────────────────────────

export interface WriteFileResult {
  action: "created" | "updated";
  agentId: string; branch: string; path: string;
  commitSha: string; commitUrl: string;
}

export async function vaultWriteFile(params: {
  agentId: string; path: string; content: string; commitMessage: string;
}): Promise<WriteFileResult> {
  const { agentId, path, content, commitMessage } = params;
  const branch = branchForAgent(agentId);
  const { token, owner, repo } = getConfig();

  if (!path || path.trim() === "" || path.includes(".."))
    throw new Error(`Invalid file path: "${path}"`);

  const sha    = await getCurrentFileSha(owner, repo, branch, path, token);
  const action = sha ? "updated" : "created";

  const body: Record<string, unknown> = {
    message: commitMessage,
    content: Buffer.from(content, "utf-8").toString("base64"),
    branch,
  };
  if (sha) body.sha = sha;

  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeFilePath(path)}`;
  const res = await fetch(url, {
    method: "PUT", headers: githubHeaders(token), body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Write failed (${res.status}): ${await res.text()}`);

  const data = await res.json() as { commit: { sha: string; html_url: string } };
  return { action, agentId, branch, path, commitSha: data.commit.sha, commitUrl: data.commit.html_url };
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export interface DeleteFileResult {
  agentId: string; branch: string; path: string;
  commitSha: string; commitUrl: string;
}

export async function vaultDeleteFile(params: {
  agentId: string; path: string; commitMessage: string;
}): Promise<DeleteFileResult> {
  const { agentId, path, commitMessage } = params;
  const branch = branchForAgent(agentId);
  const { token, owner, repo } = getConfig();

  if (!path || path.trim() === "" || path.includes(".."))
    throw new Error(`Invalid file path: "${path}"`);

  const sha = await getCurrentFileSha(owner, repo, branch, path, token);
  if (!sha) throw new Error(`File not found on branch "${branch}": ${path}`);

  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeFilePath(path)}`;
  const res = await fetch(url, {
    method: "DELETE", headers: githubHeaders(token),
    body: JSON.stringify({ message: commitMessage, sha, branch }),
  });

  if (!res.ok) throw new Error(`Delete failed (${res.status}): ${await res.text()}`);

  const data = await res.json() as { commit: { sha: string; html_url: string } };
  return { agentId, branch, path, commitSha: data.commit.sha, commitUrl: data.commit.html_url };
}

// ─── List ─────────────────────────────────────────────────────────────────────

export interface ListBranchResult {
  agentId: string; branch: string;
  items: Array<{ name: string; path: string; type: "file" | "dir"; size?: number }>;
}

export async function vaultListFiles(params: {
  agentId: string; dirPath?: string;
}): Promise<ListBranchResult> {
  const { agentId, dirPath = "" } = params;
  const branch = branchForAgent(agentId);
  const { token, owner, repo } = getConfig();

  const pathPart = dirPath ? `/${encodeFilePath(dirPath)}` : "";
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents${pathPart}?ref=${branch}`;
  const res = await fetch(url, { headers: githubHeaders(token) });

  if (!res.ok) throw new Error(`List failed (${res.status}): ${await res.text()}`);

  const raw = await res.json() as Array<{
    name: string; path: string; type: string; size?: number;
  }>;

  return {
    agentId, branch,
    items: raw.map(({ name, path, type, size }) => ({
      name, path, type: type === "dir" ? "dir" : "file", size,
    })),
  };
  }
