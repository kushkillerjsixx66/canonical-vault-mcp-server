/** Error raised when a request conflicts with a deployment's write-branch scope. */
export class WriteBranchScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteBranchScopeError";
  }
}

/**
 * Resolve the branch a write request may target.
 * A single-branch deployment lock takes precedence over client input.
 * In allowlist mode, branch membership remains enforced by the caller's
 * assertWritable / source-branch check so existing error context is retained.
 */
export function resolveWriteBranch(
  requested: string | undefined,
  locked: boolean,
  lockedBranch: string | undefined,
  modelWriteScope: string,
  allowedBranches: readonly string[]
): string {
  if (locked && lockedBranch) {
    if (requested && requested !== lockedBranch) {
      throw new WriteBranchScopeError(
        `This deployment is locked to branch '${lockedBranch}'` +
          (modelWriteScope ? ` (MODEL_WRITE_SCOPE=${modelWriteScope})` : "") +
          `. Refusing client branch '${requested}'. ` +
          "Point this model at its own deployment or unset MODEL_WRITE_SCOPE for multi-model allowlist mode."
      );
    }
    return lockedBranch;
  }
  return requested || allowedBranches[0] || "";
}
