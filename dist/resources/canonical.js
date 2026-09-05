import { CHARACTER_LIMIT, GITHUB_DEFAULT_REF, GITHUB_OWNER, GITHUB_REPO, MAX_FILE_BYTES, } from "../constants.js";
import { githubGet, handleGitHubError, REPO_PATH } from "../services/github.js";
export const CANONICAL_RESOURCES = [
    {
        name: "index",
        title: "Vault Index",
        path: "VAULT_INDEX.md",
        description: "Canonical root directory index (layers, invariants, file map).",
        mimeType: "text/markdown",
    },
    {
        name: "constitution",
        title: "Lattice Constitution",
        path: "00_governance/constitution/lattice_constitution.md",
        description: "Primary constitutional document for the Lattice architecture.",
        mimeType: "text/markdown",
    },
    {
        name: "invariants",
        title: "Lattice Invariants v1",
        path: "00_governance/invariants/Lattice_Invariants_v1.md",
        description: "Six invariants (I·COH … VI·SIG) with enforcement and failure classes.",
        mimeType: "text/markdown",
    },
    {
        name: "module-registry",
        title: "Module Registry",
        path: "04_system_spec/MODULE_REGISTRY.md",
        description: "All modules: rank, role, interfaces, invariant bindings, failure modes.",
        mimeType: "text/markdown",
    },
    {
        name: "gates",
        title: "Governance Gates (G1/G2/G3)",
        path: "04_system_spec/Governance_Gates.md",
        description: "Sentinel gate scoring, attention budget, chain validation, decision codes.",
        mimeType: "text/markdown",
    },
    {
        name: "pulse",
        title: "Pulse Cycle Spec",
        path: "04_system_spec/Pulse_Cycle_Spec.md",
        description: "Five-stage Pulse anatomy (may be a stub until populated).",
        mimeType: "text/markdown",
    },
    {
        name: "node-model",
        title: "Lattice Node Model",
        path: "04_system_spec/Lattice_Node_Model.md",
        description: "Node schema, lifecycle states, classification rules.",
        mimeType: "text/markdown",
    },
    {
        name: "snapshots",
        title: "Snapshot Registry",
        path: "04_system_spec/SNAPSHOT_REGISTRY.md",
        description: "Snapshot types, procedures, retention, integrity.",
        mimeType: "text/markdown",
    },
    {
        name: "unified-spec",
        title: "Lattice Unified Spec",
        path: "04_system_spec/Lattice_Unified_Spec.md",
        description: "Root anchor specification document.",
        mimeType: "text/markdown",
    },
    {
        name: "neuralese",
        title: "Neuralese Lexicon",
        path: "02_epistemic_substrate/Neuralese_Lexicon.md",
        description: "Packet grammar, symbols, COL, HUD, invariant notation.",
        mimeType: "text/markdown",
    },
    {
        name: "initiation",
        title: "Lattice Initiation / Boot",
        path: "lattice_initiation.md",
        description: "Five-stage boot sequence and genesis protocol.",
        mimeType: "text/markdown",
    },
    {
        name: "config",
        title: "Lattice Runtime Config",
        path: "05_runtime/lattice_config.py",
        description: "Dataclass config: thresholds, budgets, operator defaults.",
        mimeType: "text/x-python",
    },
    {
        name: "glossary",
        title: "Lattice Glossary Spine",
        path: "LATTICE_GLOSSARY_SPINE.md",
        description: "Glossary spine for Lattice terms.",
        mimeType: "text/markdown",
    },
];
export function resourceUri(name) {
    return "vault://" + name;
}
export function findCanonicalByUri(uri) {
    const match = /^vault:\/\/([a-z0-9-]+)$/i.exec(uri.trim());
    if (!match)
        return undefined;
    return CANONICAL_RESOURCES.find((r) => r.name === match[1].toLowerCase());
}
function truncate(text) {
    if (text.length <= CHARACTER_LIMIT)
        return { text, truncated: false };
    return {
        text: text.slice(0, CHARACTER_LIMIT) +
            "\n\n[Truncated at " +
            CHARACTER_LIMIT +
            " characters.]",
        truncated: true,
    };
}
/** Same URL pattern as vault_get_file — do not mangle ${} in the shell. */
export async function fetchCanonicalContent(resource, ref = GITHUB_DEFAULT_REF) {
    const endpoint = REPO_PATH +
        "/contents/" +
        encodeURIComponent(resource.path).replace(/%2F/g, "/");
    const data = await githubGet(endpoint, { ref });
    if (Array.isArray(data) || data.type !== "file") {
        throw new Error("'" + resource.path + "' is not a file");
    }
    if (data.size > MAX_FILE_BYTES) {
        throw new Error("'" + resource.path + "' is " + data.size + " bytes (limit " + MAX_FILE_BYTES + ")");
    }
    if (!data.content || data.encoding !== "base64") {
        throw new Error("'" + resource.path + "' has no readable text content");
    }
    const decoded = Buffer.from(data.content, "base64").toString("utf-8");
    const header = "# " +
        resource.title +
        "\n" +
        "uri: " +
        resourceUri(resource.name) +
        "\n" +
        "path: " +
        resource.path +
        "\n" +
        "ref: " +
        ref +
        " · sha: " +
        data.sha +
        " · " +
        data.size +
        " bytes\n" +
        "repo: " +
        GITHUB_OWNER +
        "/" +
        GITHUB_REPO +
        "\n\n";
    const { text, truncated } = truncate(header + decoded);
    return { text, sha: data.sha, size: data.size, truncated };
}
export { handleGitHubError };
//# sourceMappingURL=canonical.js.map