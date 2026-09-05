import axios, { AxiosError } from "axios";
import {
  GITHUB_API_BASE_URL,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_TOKEN,
} from "../constants.js";

/**
 * Shared, read-only GitHub REST API client scoped to the canonical-vault
 * repository. Every function here issues GET requests only. Write access
 * (opt-in, governed) lives entirely in ./github-write.ts instead of being
 * added here, so this module's read-only guarantee stays true by inspection.
 */
async function makeGitHubRequest<T>(
  endpoint: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  try {
    const response = await axios({
      method: "GET",
      url: `${GITHUB_API_BASE_URL}${endpoint}`,
      params,
      timeout: 30000,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
      },
    });
    return response.data as T;
  } catch (error) {
    throw error;
  }
}

export function handleGitHubError(error: unknown, context: string): string {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const remaining = error.response?.headers?.["x-ratelimit-remaining"];
    if (status === 404) {
      return `Error: ${context} not found in ${GITHUB_OWNER}/${GITHUB_REPO}. Check the path or ref is correct and that it exists on the branch you specified.`;
    }
    if (status === 403 && remaining === "0") {
      return "Error: GitHub API rate limit exceeded. This server is running unauthenticated or with a low-limit token — set the GITHUB_TOKEN environment variable to raise the limit to 5000 requests/hour.";
    }
    if (status === 403) {
      return `Error: Permission denied accessing ${context}. If canonical-vault is private, confirm GITHUB_TOKEN has read access to it.`;
    }
    if (status === 422) {
      return `Error: Invalid query for ${context}. Check your search syntax and try a simpler query.`;
    }
    if (error.code === "ECONNABORTED") {
      return `Error: Request for ${context} timed out. Try again or narrow the request.`;
    }
    return `Error: GitHub API request for ${context} failed with status ${status ?? "unknown"}.`;
  }
  return `Error: Unexpected error fetching ${context}: ${
    error instanceof Error ? error.message : String(error)
  }`;
}

export function githubGet<T>(
  endpoint: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  return makeGitHubRequest<T>(endpoint, params);
}

export const REPO_PATH = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
