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

// Branches the write tools are permitted to touch. Per Model Contribution
// Contract (00_governance/contracts/model-contribution.md) and
// canonical_merge_authority: false, each model is expected to write only
// to its own branch. The shared allowlist is the governed surface; the
// canonical/default branch must never appear here — the check below makes
// that a hard startup failure, not just a convention.
// Default covers all existing model branches in canonical-vault.
export const WRITE_BRANCH_ALLOWLIST = (process.env.GITHUB_WRITE_BRANCH_ALLOWLIST || "grok,claude,chatgpt,gemini,copilot")
  .split(",")
  .map((b) => b.trim())
  .filter(Boolean);

if (WRITE_BRANCH_ALLOWLIST.includes(GITHUB_DEFAULT_REF)) {
  throw new Error(
    `GITHUB_WRITE_BRANCH_ALLOWLIST must not include '${GITHUB_DEFAULT_REF}' (the canonical/default branch). ` +
      "Refusing to start with this configuration — fix the env var and redeploy."
  );
}

// Path prefixes the write tools may never touch, regardless of branch.
// Mirrors prohibited_zones (direct_canonical_mutation).
export const WRITE_PATH_DENYLIST: RegExp[] = [
  /^00_governance\/constitution\//,
  /^06_ip_legal\//,
  /^00_governance\/claude\/manifest\.json$/, // can't rewrite its own scope
  /(^|\/)\.git(\/|$)/,
];

// Maximum characters returned in a single tool response before truncation.
export const CHARACTER_LIMIT = 25000;

// Maximum file size (bytes) we will fetch and decode as text content.
export const MAX_FILE_BYTES = 500_000;
