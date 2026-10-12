import axios, { AxiosError } from "axios";
import { GITHUB_API_BASE_URL, GITHUB_WRITE_TOKEN } from "../constants.js";
import { handleGitHubError, REPO_PATH } from "./github.js";
/**
 * Write-capable GitHub REST client, deliberately kept out of ./github.ts so
 * that module's read-only guarantee stays true by inspection, not just by
 * convention. Every function here requires GITHUB_WRITE_TOKEN — in normal
 * operation nothing ever calls this module without it, because the write
 * tools that use it are never registered unless it's set (see server.ts).
 * The check below is a second line of defense, not the only one.
 */
async function makeGitHubWriteRequest(method, endpoint, body) {
    if (!GITHUB_WRITE_TOKEN) {
        throw new Error("GITHUB_WRITE_TOKEN is not configured. Write tools should be unreachable without it — " +
            "seeing this means a code path called this module directly instead of going through vault-write tools.");
    }
    const response = await axios({
        method,
        url: `${GITHUB_API_BASE_URL}${endpoint}`,
        data: body,
        timeout: 30000,
        headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            Authorization: `Bearer ${GITHUB_WRITE_TOKEN}`,
        },
    });
    return response.data;
}
export { handleGitHubError, REPO_PATH };
/**
 * Look up a file's current blob sha on a branch, or undefined if the file
 * doesn't exist yet there. Required by the Contents API for updates (a
 * create needs no sha; an update without the current sha is rejected —
 * which is exactly the concurrent-edit guard we want).
 */
export async function githubGetSha(path, branch) {
    try {
        const response = await axios({
            method: "GET",
            url: `${GITHUB_API_BASE_URL}${REPO_PATH}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`,
            params: { ref: branch },
            timeout: 30000,
            headers: {
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                ...(GITHUB_WRITE_TOKEN ? { Authorization: `Bearer ${GITHUB_WRITE_TOKEN}` } : {}),
            },
        });
        const data = response.data;
        return Array.isArray(data) ? undefined : data.sha;
    }
    catch (error) {
        if (error instanceof AxiosError && error.response?.status === 404)
            return undefined;
        throw error;
    }
}
export function githubPutFile(path, body) {
    return makeGitHubWriteRequest("PUT", `${REPO_PATH}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`, body);
}
export function githubCreatePullRequest(body) {
    return makeGitHubWriteRequest("POST", `${REPO_PATH}/pulls`, body);
}
//# sourceMappingURL=github-write.js.map