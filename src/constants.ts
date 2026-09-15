export const GITHUB_API_BASE_URL = "https://api.github.com";

export const GITHUB_OWNER = process.env.GITHUB_OWNER || "kushkillerjsixx66";
export const GITHUB_REPO = process.env.GITHUB_REPO || "canonical-vault";
export const GITHUB_DEFAULT_REF = process.env.GITHUB_DEFAULT_REF || "main";

// GitHub personal access token (optional). Without it, requests are subject
// to GitHub's unauthenticated rate limit (60/hr). With it, 5000/hr.
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// --- Write path (optional, opt-in) ---------------------------------------
// Deliberately separate from GITHUB_TOKEN: read tools work identically
// whether or not this is set. Setting it is the ONLY thing that activates
// the write tools at all (see server.ts) — a deployment that never sets
// this behaves exactly as read-only as before this was added. Scope this
// PAT to `Contents: Read and write` on this repo only — no Administration,
// no other repos.
export const GITHUB_WRITE_TOKEN = process.env.GITHUB_WRITE_TOKEN;

// Known model identity branches (Model Contribution Contract).
export const KNOWN_MODEL_BRANCHES = [
  "grok",
  "claude",
  "chatgpt",
  "gemini",
  "copilot",
] as const;

export type ModelBranch = (typeof KNOWN_MODEL_BRANCHES)[number];

/**
 * Optional write-scope env.
 * - Single value (e.g. MODEL_WRITE_SCOPE=grok): hard-lock this deployment to that branch only.
 * - Comma-separated (e.g. grok,claude,chatgpt): multi-model allowlist (same as GITHUB_WRITE_BRANCH_ALLOWLIST).
 * Path/branch coherence still applies in both modes.
 */
export const MODEL_WRITE_SCOPE_RAW = (process.env.MODEL_WRITE_SCOPE || "")
  .trim()
  .toLowerCase();

function resolveWriteAllowlist(): string[] {
  if (MODEL_WRITE_SCOPE_RAW) {
    const parts = MODEL_WRITE_SCOPE_RAW.split(",")
      .map((b) => b.trim())
      .filter(Boolean);
    if (parts.includes(GITHUB_DEFAULT_REF)) {
      throw new Error(
        `MODEL_WRITE_SCOPE must not include '${GITHUB_DEFAULT_REF}' (canonical branch). ` +
          "Refusing to start — fix the env var and redeploy."
      );
    }
    if (parts.length === 0) {
      throw new Error("MODEL_WRITE_SCOPE is set but empty after parsing.");
    }
    return parts;
  }
  return (process.env.GITHUB_WRITE_BRANCH_ALLOWLIST || KNOWN_MODEL_BRANCHES.join(","))
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);
}

// Branches the write tools are permitted to touch.
export const WRITE_BRANCH_ALLOWLIST = resolveWriteAllowlist();

if (WRITE_BRANCH_ALLOWLIST.includes(GITHUB_DEFAULT_REF)) {
  throw new Error(
    `GITHUB_WRITE_BRANCH_ALLOWLIST must not include '${GITHUB_DEFAULT_REF}' (the canonical/default branch). ` +
      "Refusing to start with this configuration — fix the env var and redeploy."
  );
}

if (WRITE_BRANCH_ALLOWLIST.length === 0) {
  throw new Error(
    "Write branch allowlist is empty. Set MODEL_WRITE_SCOPE or GITHUB_WRITE_BRANCH_ALLOWLIST."
  );
}

/** True only when exactly one branch is allowed (true single-model hard lock). */
export const WRITE_BRANCH_LOCKED = WRITE_BRANCH_ALLOWLIST.length === 1;
export const LOCKED_WRITE_BRANCH = WRITE_BRANCH_LOCKED
  ? WRITE_BRANCH_ALLOWLIST[0]
  : undefined;

/** Back-compat alias used in tool messages when a single scope is set. */
export const MODEL_WRITE_SCOPE = WRITE_BRANCH_LOCKED
  ? (LOCKED_WRITE_BRANCH as string)
  : MODEL_WRITE_SCOPE_RAW;

// Path prefixes the write tools may never touch, regardless of branch.
export const WRITE_PATH_DENYLIST: RegExp[] = [
  /^00_governance\/constitution\//,
  /^06_ip_legal\//,
  /^00_governance\/claude\/manifest\.json$/,
  /(^|\/)\.git(\/|$)/,
];

/**
 * Model-owned path roots from MCC: vault/<model>/, runtime/<model>/,
 * 00_governance/<model>/. When a path is under one of these, the write
 * branch MUST equal the model segment — blocks cross-branch pollution.
 */
export const MODEL_OWNED_PATH =
  /^(vault|runtime|00_governance)\/([a-z0-9][a-z0-9_-]*)\//i;

export function modelSegmentFromPath(path: string): string | undefined {
  const m = MODEL_OWNED_PATH.exec(path.replace(/^\/+/, ""));
  return m ? m[2].toLowerCase() : undefined;
}

export const CHARACTER_LIMIT = 25000;
export const MAX_FILE_BYTES = 500_000;
