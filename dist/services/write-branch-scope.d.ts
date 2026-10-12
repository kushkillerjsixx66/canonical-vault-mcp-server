/** Error raised when a request conflicts with a deployment's write-branch scope. */
export declare class WriteBranchScopeError extends Error {
    constructor(message: string);
}
/**
 * Resolve the branch a write request may target.
 * A single-branch deployment lock takes precedence over client input.
 * In allowlist mode, branch membership remains enforced by the caller's
 * assertWritable / source-branch check so existing error context is retained.
 */
export declare function resolveWriteBranch(requested: string | undefined, locked: boolean, lockedBranch: string | undefined, modelWriteScope: string, allowedBranches: readonly string[]): string;
//# sourceMappingURL=write-branch-scope.d.ts.map