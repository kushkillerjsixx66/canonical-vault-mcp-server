import { WRITE_PATH_DENYLIST, modelSegmentFromPath } from "../constants.js";

export class WritePathScopeError extends Error {}

/**
 * Validate a repository-relative write path before any GitHub API call.
 * Reject ambiguous path syntax, then apply protected-zone and model-ownership
 * rules to a normalized path so case changes cannot bypass policy.
 */
export function assertWritablePath(path: string, branch: string, allowedBranches: readonly string[]): string {
  if (typeof path !== "string" || path.length === 0 || path.trim() === "") {
    throw new WritePathScopeError("Write path must be a non-empty repository-relative path.");
  }
  if (path.startsWith("/") || path.includes("\\") || /^[A-Za-z]:/.test(path)) {
    throw new WritePathScopeError("Absolute paths, drive-letter paths, and backslashes are not allowed in repository write paths.");
  }
  if (Array.from(path).some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  })) {
    throw new WritePathScopeError("Control characters are not allowed in repository write paths.");
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new WritePathScopeError("Empty, dot, and parent-directory path segments are not allowed.");
  }
  const normalized = segments.join("/");
  const policyPath = normalized.toLowerCase();
  if (!allowedBranches.includes(branch)) {
    throw new WritePathScopeError(`'${branch}' is not a governed write branch (allowed: ${allowedBranches.join(", ")}).`);
  }
  if (WRITE_PATH_DENYLIST.some((rx) => rx.test(policyPath))) {
    throw new WritePathScopeError(`'${path}' is in a prohibited zone (direct_canonical_mutation). Refusing to write.`);
  }
  const modelSeg = modelSegmentFromPath(normalized);
  if (modelSeg && modelSeg !== branch.toLowerCase()) {
    throw new WritePathScopeError(
      `Path '${path}' is owned by model '${modelSeg}' but target branch is '${branch}'. Branch and path model segment must match.`
    );
  }
  return normalized;
}
