import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { HandshakeApiError } from "./api-client.js";
import { ToolInputError } from "./json-schema.js";
import type { HandshakeToolRegistry, ToolDescriptor } from "./tools.js";

export type McpToolResult = CallToolResult;

export class HandshakeMcpRuntime {
  public constructor(private readonly registry: HandshakeToolRegistry) {}

  public listTools(): readonly ToolDescriptor[] {
    return this.registry.listTools();
  }

  public async callTool(name: string, args: unknown): Promise<McpToolResult> {
    try {
      const data = await this.registry.callTool(name, args);
      const structuredContent = toStructuredContent(data);
      return {
        content: [{ type: "text", text: JSON.stringify(structuredContent) }],
        structuredContent,
      };
    } catch (error: unknown) {
      const safe = safeToolError(error);
      return {
        content: [{ type: "text", text: JSON.stringify(safe) }],
        structuredContent: safe,
        isError: true,
      };
    }
  }
}

function toStructuredContent(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  return { data: value };
}

function safeToolError(error: unknown): Record<string, unknown> {
  if (error instanceof HandshakeApiError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        ...(error.status === 0 ? {} : { status: error.status }),
      },
    };
  }
  if (error instanceof ToolInputError) {
    return {
      error: { code: "INVALID_TOOL_INPUT", message: error.message, retryable: false },
    };
  }
  return {
    error: {
      code: "MCP_ADAPTER_ERROR",
      message: "The Handshake MCP adapter could not complete the request.",
      retryable: false,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
