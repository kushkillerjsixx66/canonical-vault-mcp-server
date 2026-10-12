/**
 * Branch-scoped write service for the canonical-vault repo.
 *
 * Required env vars:
 *   VAULT_WRITE_TOKEN  – GitHub PAT with repo/contents:write on canonical-vault
 *   VAULT_OWNER        – GitHub owner (e.g. "kushkillerjsixx66")
 *   VAULT_REPO         – Repo name (e.g. "canonical-vault")
 */
export type AgentId = "chatgpt" | "claude" | "grok" | "gemini";
export declare const AGENT_BRANCH_MAP: Record<AgentId, string>;
export declare function isValidAgent(id: string): id is AgentId;
export declare function branchForAgent(agentId: string): string;
export interface WriteFileResult {
    action: "created" | "updated";
    agentId: string;
    branch: string;
    path: string;
    commitSha: string;
    commitUrl: string;
}
export declare function vaultWriteFile(params: {
    agentId: string;
    path: string;
    content: string;
    commitMessage: string;
}): Promise<WriteFileResult>;
export interface DeleteFileResult {
    agentId: string;
    branch: string;
    path: string;
    commitSha: string;
    commitUrl: string;
}
export declare function vaultDeleteFile(params: {
    agentId: string;
    path: string;
    commitMessage: string;
}): Promise<DeleteFileResult>;
export interface ListBranchResult {
    agentId: string;
    branch: string;
    items: Array<{
        name: string;
        path: string;
        type: "file" | "dir";
        size?: number;
    }>;
}
export declare function vaultListFiles(params: {
    agentId: string;
    dirPath?: string;
}): Promise<ListBranchResult>;
//# sourceMappingURL=vaultWriteService.d.ts.map