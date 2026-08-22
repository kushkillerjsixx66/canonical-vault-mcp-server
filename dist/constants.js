export const GITHUB_API_BASE_URL = "https://api.github.com";
export const GITHUB_OWNER = process.env.GITHUB_OWNER || "kushkillerjsixx66";
export const GITHUB_REPO = process.env.GITHUB_REPO || "canonical-vault";
export const GITHUB_DEFAULT_REF = process.env.GITHUB_DEFAULT_REF || "main";
// GitHub personal access token (optional). Without it, requests are subject
// to GitHub's unauthenticated rate limit (60/hr). With it, 5000/hr.
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
// Maximum characters returned in a single tool response before truncation.
export const CHARACTER_LIMIT = 25000;
// Maximum file size (bytes) we will fetch and decode as text content.
export const MAX_FILE_BYTES = 500_000;
//# sourceMappingURL=constants.js.map