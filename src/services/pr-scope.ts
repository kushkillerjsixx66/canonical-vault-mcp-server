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
