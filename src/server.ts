import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerVaultTools } from "./tools/vault.js";
import { registerCanonicalTools } from "./tools/canonical.js";
import {
  CANONICAL_RESOURCES,
  fetchCanonicalContent,
  findCanonicalByUri,
  handleGitHubError,
  resourceUri,
} from "./resources/canonical.js";
import { GITHUB_DEFAULT_REF } from "./constants.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "canonical-vault-mcp-server",
    version: "1.1.0",
  });

  registerVaultTools(server);
  registerCanonicalTools(server);
  // ----- Resources: curated substrate -----
  for (const r of CANONICAL_RESOURCES) {
    const uri = resourceUri(r.name);

    // Prefer registerResource if present; otherwise server.resource works the same.
    const register =
      typeof (server as any).registerResource === "function"
        ? (server as any).registerResource.bind(server)
        : server.resource.bind(server);

    register(
      r.name,
      uri,
      {
        title: r.title,
        description: r.description,
        mimeType: r.mimeType,
      },
      async (requestedUri: URL) => {
        const uriStr = requestedUri.href;
        try {
          const resource =
            findCanonicalByUri(uriStr) ??
            CANONICAL_RESOURCES.find((c) => c.name === r.name);

          if (!resource) {
            return {
              contents: [
                {
                  uri: uriStr,
                  mimeType: "text/plain",
                  text: `Error: unknown resource URI '${uriStr}'. Known: ${CANONICAL_RESOURCES.map(
                    (c) => resourceUri(c.name)
                  ).join(", ")}`,
                },
              ],
            };
          }

          const { text } = await fetchCanonicalContent(
            resource,
            GITHUB_DEFAULT_REF
          );

          return {
            contents: [
              {
                uri: resourceUri(resource.name), // string, not URL
                mimeType: resource.mimeType,
                text,
              },
            ],
          };
        } catch (error) {
          return {
            contents: [
              {
                uri: uriStr,
                mimeType: "text/plain",
                text: handleGitHubError(error, `resource '${r.name}'`),
              },
            ],
          };
        }
      }
    );
  }

  // ----- Prompt: orientation (SDK: name + description string + callback) -----
  const orientationText = [
    "You are operating against the canonical-vault substrate via MCP.",
    "Prefer these resources before ad-hoc path guesses:",
    "- vault://index — map of the vault",
    "- vault://constitution — constitutional binding",
    "- vault://invariants — six non-waivable invariants",
    "- vault://gates — G1/G2/G3 Sentinel gates",
    "- vault://module-registry — module ranks and bindings",
    "- vault://node-model — Node schema and lifecycle",
    "- vault://neuralese — lexicon / COL / HUD",
    "Rules: read-only; do not invent paths; prefer vault://* resources or vault_list_directory / vault_get_file with real tree paths (00_governance, 04_system_spec, 05_runtime, …).",
    "Lineage via vault_get_file_history is Git history; deeper Vault Chain concepts live in the specs above.",
  ].join("\n");

  if (typeof (server as any).registerPrompt === "function") {
    (server as any).registerPrompt(
      "vault_orientation",
      {
        title: "Vault Orientation",
        description:
          "Orientation for working with the canonical Lattice vault: which resources to read first and altitude rules.",
      },
      async () => ({
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: orientationText },
          },
        ],
      })
    );
  } else {
    // Older overload: (name, description: string, cb)
    server.prompt(
      "vault_orientation",
      "Orientation for working with the canonical Lattice vault: which resources to read first and altitude rules.",
      async () => ({
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: orientationText },
          },
        ],
      })
    );
  }

  return server;
}
