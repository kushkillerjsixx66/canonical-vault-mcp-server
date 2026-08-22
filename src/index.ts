#!/usr/bin/env node
/**
 * canonical-vault-mcp-server — stdio entry point.
 *
 * This is used for local testing (e.g. `npx @modelcontextprotocol/inspector
 * node dist/index.js`). The deployed Vercel service uses api/mcp.ts instead,
 * which wraps the same server over Streamable HTTP.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("canonical-vault-mcp-server running via stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
