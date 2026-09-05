import { handleGitHubError } from "../services/github.js";
export interface CanonicalResource {
    name: string;
    title: string;
    path: string;
    description: string;
    mimeType: string;
}
export declare const CANONICAL_RESOURCES: CanonicalResource[];
export declare function resourceUri(name: string): string;
export declare function findCanonicalByUri(uri: string): CanonicalResource | undefined;
/** Same URL pattern as vault_get_file — do not mangle ${} in the shell. */
export declare function fetchCanonicalContent(resource: CanonicalResource, ref?: string): Promise<{
    text: string;
    sha: string;
    size: number;
    truncated: boolean;
}>;
export { handleGitHubError };
//# sourceMappingURL=canonical.d.ts.map