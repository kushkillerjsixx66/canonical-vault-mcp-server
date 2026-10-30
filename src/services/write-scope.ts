/** Error raised before any GitHub write side effect when scope is invalid. */
export class WriteScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteScopeError";
  }
}

export interface WriteScopePolicy {
  allowedBranches: readonly string[];
  canonicalBranch: string;
  prohibitedPaths: readonly RegExp[];
  modelSegmentFromPath: (path: string) => string | undefined;
}

/** Validate the complete write target without performing I/O. */
export function assertWritableTarget(
  branch: string,
  path: string,
  policy: WriteScopePolicy
): void {
  if (!policy.allowedBranches.includes(branch)) {
    throw new WriteScopeError(
      `'${branch}' is not a governed write branch (allowed: ${policy.allowedBranches.join(", ")}). ` +
        `Per Model Contribution Contract (branch sovereignty) and canonical_merge_authority: false — ` +
        `'${policy.canonicalBranch}' can only be reached via vault_open_pr, never written to directly. ` +
        "Each model must write only to its own branch (e.g. grok → grok, claude → claude)."
    );
  }

  if (policy.prohibitedPaths.some((pattern) => pattern.test(path))) {
    throw new WriteScopeError(
      `'${path}' is in a prohibited zone (direct_canonical_mutation). Refusing to write.`
    );
  }

  const modelSegment = policy.modelSegmentFromPath(path);
  if (modelSegment && modelSegment !== branch) {
    throw new WriteScopeError(
      `Path '${path}' is owned by model '${modelSegment}' but target branch is '${branch}'. ` +
        "Per Model Contribution Contract, branch and path model segment must match " +
        `(write to branch '${modelSegment}' or use a path under vault/${branch}/).`
    );
  }
}

/**
 * Keep target validation and the side-effect callback in one call boundary.
 * Callers must place all write-related network I/O inside the callback so
 * rejected targets cannot trigger a GitHub lookup or mutation request.
 */
export async function writeFileWithinScope<T>(
  branch: string,
  path: string,
  policy: WriteScopePolicy,
  write: () => Promise<T>
): Promise<T> {
  assertWritableTarget(branch, path, policy);
  return write();
}
