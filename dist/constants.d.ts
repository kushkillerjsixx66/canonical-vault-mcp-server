export declare const GITHUB_API_BASE_URL = "https://api.github.com";
export declare const GITHUB_OWNER: string;
export declare const GITHUB_REPO: string;
export declare const GITHUB_DEFAULT_REF: string;
export declare const GITHUB_TOKEN: string | undefined;
export declare const GITHUB_WRITE_TOKEN: string | undefined;
export declare const KNOWN_MODEL_BRANCHES: readonly ["grok", "claude", "chatgpt", "gemini", "copilot", "muse"];
export type ModelBranch = (typeof KNOWN_MODEL_BRANCHES)[number];
/**
 * Optional write-scope env.
 * - Single value (e.g. MODEL_WRITE_SCOPE=grok): hard-lock this deployment to that branch only.
 * - Comma-separated (e.g. grok,claude,chatgpt): multi-model allowlist (same as GITHUB_WRITE_BRANCH_ALLOWLIST).
 * Path/branch coherence still applies in both modes.
 */
export declare const MODEL_WRITE_SCOPE_RAW: string;
export declare const WRITE_BRANCH_ALLOWLIST: string[];
/** True only when exactly one branch is allowed (true single-model hard lock). */
export declare const WRITE_BRANCH_LOCKED: boolean;
export declare const LOCKED_WRITE_BRANCH: string | undefined;
/** Back-compat alias used in tool messages when a single scope is set. */
export declare const MODEL_WRITE_SCOPE: string;
export declare const WRITE_PATH_DENYLIST: RegExp[];
export declare const MODEL_OWNED_PATH: RegExp;
export declare function modelSegmentFromPath(path: string): string | undefined;
export declare const CHARACTER_LIMIT = 25000;
export declare const MAX_FILE_BYTES = 500000;
//# sourceMappingURL=constants.d.ts.map