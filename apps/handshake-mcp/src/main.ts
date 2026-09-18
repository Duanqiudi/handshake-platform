#!/usr/bin/env node
import { adapterConfigFromEnv, runStdioServer } from "./stdio-server.js";

runStdioServer(adapterConfigFromEnv(process.env)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup error.";
  // stdout is reserved for MCP frames. Never log the owner token or complete config.
  process.stderr.write(`[handshake-mcp] ${message}\n`);
  process.exitCode = 1;
});
