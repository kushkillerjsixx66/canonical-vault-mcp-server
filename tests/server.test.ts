import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createServer } from "../src/server.js";

describe("createServer", () => {
  it("builds an MCP server instance without network access", () => {
    const server = createServer();
    assert.ok(server, "server instance should exist");
    assert.equal(typeof server.connect, "function");
  });

  it("exposes the expected read-tool inventory through the MCP protocol", async () => {
    const server = createServer();
    const client = new Client({ name: "tool-inventory-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const response = await client.listTools();
      const names = new Set(response.tools.map((tool) => tool.name));
      const expectedReadTools = [
        "vault_list_directory",
        "vault_get_file",
        "vault_get_file_history",
        "vault_get_commit",
        "vault_search_files",
        "vault_get_canonical",
      ];

      for (const name of expectedReadTools) {
        assert.ok(names.has(name), `expected registered MCP tool: ${name}`);
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
});
