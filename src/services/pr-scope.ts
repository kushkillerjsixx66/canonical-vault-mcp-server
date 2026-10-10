/** Error raised before any PR-creation side effect when target scope is invalid. */
export class PullRequestTargetScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PullRequestTargetScopeError";
  }
}

/** Enforce target scope immediately before invoking the external side effect. */
export async function createPullRequestWithinScope<T>(
  head: string,
  base: string,
  canonicalBase: string,
  create: () => Promise<T>
): Promise<T> {
  const error = pullRequestTargetError(head, base, canonicalBase);
  if (error) {
    throw new PullRequestTargetScopeError(error);
  }
  return create();
}

/** Pure validation for the only supported PR destination. */
export function pullRequestTargetError(
  head: string,
  base: string,
  canonicalBase: string
): string | undefined {
  if (head === base) {
    return "Pull request source and destination branches must differ.";
  }
  if (base !== canonicalBase) {
    return `Pull request destination '${base}' must match configured canonical target '${canonicalBase}'.`;
  }
  return undefined;
}
