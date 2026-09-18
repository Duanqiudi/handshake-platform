import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { HandshakeApiClient } from "./api-client.js";
import { HandshakeMcpRuntime } from "./mcp-runtime.js";
import { HandshakeToolRegistry } from "./tools.js";

export interface AdapterConfig {
  readonly apiBaseUrl: string;
  readonly ownerToken: string;
  readonly timeoutMs?: number;
}

export function adapterConfigFromEnv(env: NodeJS.ProcessEnv): AdapterConfig {
  const apiBaseUrl = env.HANDSHAKE_API_BASE_URL?.trim();
  const ownerToken = env.HANDSHAKE_OWNER_TOKEN?.trim();
  if (!apiBaseUrl) throw new Error("HANDSHAKE_API_BASE_URL is required.");
  if (!ownerToken) throw new Error("HANDSHAKE_OWNER_TOKEN is required.");
  const timeout = env.HANDSHAKE_API_TIMEOUT_MS?.trim();
  if (timeout === undefined || timeout.length === 0) return { apiBaseUrl, ownerToken };
  if (!/^\d+$/.test(timeout)) throw new Error("HANDSHAKE_API_TIMEOUT_MS must be an integer.");
  return { apiBaseUrl, ownerToken, timeoutMs: Number(timeout) };
}

export async function runStdioServer(config: AdapterConfig): Promise<void> {
  const api = new HandshakeApiClient({
    baseUrl: config.apiBaseUrl,
    ownerToken: config.ownerToken,
    ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
  });
  const runtime = new HandshakeMcpRuntime(new HandshakeToolRegistry(api));
  const server = new Server(
    { name: "handshake", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "Handshake cannot read this host's Memory. Use only context already available to you, send the minimum information needed for seven-day portfolio team matching, and never transmit raw chats, full Memory, credentials, identity documents, detailed addresses, or contact details. Never mark ownerConfirmed true unless the owner explicitly confirmed that exact action in the current interaction.",
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: runtime.listTools(),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return runtime.callTool(request.params.name, request.params.arguments ?? {});
  });

  const transport = new StdioServerTransport();
  const close = async (): Promise<void> => {
    await server.close();
  };
  process.once("SIGINT", () => {
    close().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    close().finally(() => process.exit(0));
  });
  await server.connect(transport);
}
