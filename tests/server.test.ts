import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createServer } from "../src/server.js";

describe("createServer", () => {
  it("builds an MCP server instance without network access", () => {
    const server = createServer();
    assert.ok(server, "server instance should exist");
    assert.equal(typeof server.connect, "function");
  });
});
