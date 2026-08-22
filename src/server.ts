import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerVaultTools } from "./tools/vault.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "canonical-vault-mcp-server",
    version: "1.0.0",
  });

  registerVaultTools(server);

  return server;
}
