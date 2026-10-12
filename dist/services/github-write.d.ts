import { handleGitHubError, REPO_PATH } from "./github.js";
export { handleGitHubError, REPO_PATH };
/**
 * Look up a file's current blob sha on a branch, or undefined if the file
 * doesn't exist yet there. Required by the Contents API for updates (a
 * create needs no sha; an update without the current sha is rejected —
 * which is exactly the concurrent-edit guard we want).
 */
export declare function githubGetSha(path: string, branch: string): Promise<string | undefined>;
export declare function githubPutFile<T>(path: string, body: Record<string, unknown>): Promise<T>;
export declare function githubCreatePullRequest<T>(body: Record<string, unknown>): Promise<T>;
//# sourceMappingURL=github-write.d.ts.map