import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GITHUB_DEFAULT_REF } from "../constants.js";
import { handleGitHubError } from "../services/github.js";
import {
  CANONICAL_RESOURCES,
  fetchCanonicalContent,
  resourceUri,
} from "../resources/canonical.js";

export function registerCanonicalTools(server: McpServer): void {
  const names = CANONICAL_RESOURCES.map((r) => r.name) as [string, ...string[]];

  server.registerTool(
    "vault_get_canonical",
    {
      title: "Get Canonical Substrate Document",
      description: `Fetch a curated Lattice substrate document by short name.

Known names: ${names.join(", ")}.

Prefer this over vault_get_file for constitution, invariants, gates, module-registry, node-model, neuralese, index, etc.`,
      inputSchema: z
        .object({
          name: z.enum(names).describe("Canonical short name"),
          ref: z
            .string()
            .min(1)
            .max(200)
            .default(GITHUB_DEFAULT_REF)
            .describe("Branch, tag, or commit SHA"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: { name: string; ref: string }) => {
      const resource = CANONICAL_RESOURCES.find((r) => r.name === params.name);
      if (!resource) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: unknown name '${params.name}'. Use one of: ${names.join(", ")}`,
            },
          ],
        };
      }
      try {
        const { text, sha, size, truncated } = await fetchCanonicalContent(
          resource,
          params.ref
        );
        return {
          content: [{ type: "text", text }],
          structuredContent: {
            name: resource.name,
            uri: resourceUri(resource.name),
            path: resource.path,
            ref: params.ref,
            sha,
            size,
            truncated,
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: handleGitHubError(error, `canonical '${params.name}'`),
            },
          ],
        };
      }
    }
  );
}
