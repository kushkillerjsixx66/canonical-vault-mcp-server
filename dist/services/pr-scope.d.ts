/** Error raised before any PR-creation side effect when target scope is invalid. */
export declare class PullRequestTargetScopeError extends Error {
    constructor(message: string);
}
/** Enforce target scope immediately before invoking the external side effect. */
export declare function createPullRequestWithinScope<T>(head: string, base: string, canonicalBase: string, create: () => Promise<T>): Promise<T>;
/** Pure validation for the only supported PR destination. */
export declare function pullRequestTargetError(head: string, base: string, canonicalBase: string): string | undefined;
//# sourceMappingURL=pr-scope.d.ts.map